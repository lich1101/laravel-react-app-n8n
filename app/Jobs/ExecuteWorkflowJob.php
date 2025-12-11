<?php

namespace App\Jobs;

use App\Models\Workflow;
use App\Models\WorkflowExecution;
use App\Models\SystemSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use App\Http\Controllers\Api\WebhookController;
use App\Exceptions\WorkflowCancelledException;

class ExecuteWorkflowJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 3600; // 1 hour timeout - đủ cho hầu hết workflows
    public $tries = 3; // Max 3 retries for actual failures
    public $maxExceptions = 3; // Max exceptions before marking as failed
    public $backoff = [5, 15, 60]; // Exponential backoff: 5s, 15s, 60s
    
    /**
     * Calculate the number of seconds to wait before retrying the job.
     * For concurrency limit retries, use exponential backoff
     */
    public function backoff()
    {
        // For concurrency limit retries, use exponential backoff
        $attempts = $this->attempts();
        return min(5 * pow(2, $attempts), 60); // 5s, 10s, 20s, 40s, max 60s
    }

    protected $execution;
    protected $workflow;
    protected $webhookRequest;
    protected $resumeContext;

    public function __construct(WorkflowExecution $execution, Workflow $workflow, array $webhookRequest, ?array $resumeContext = null)
    {
        $this->execution = $execution;
        $this->workflow = $workflow;
        $this->webhookRequest = $webhookRequest;
        $this->resumeContext = $resumeContext;
    }

    public function handle()
    {
        try {
            $this->execution = $this->execution->fresh();

            if ($this->execution->cancel_requested_at || $this->execution->status === 'cancelled') {
                Log::info('Workflow execution cancelled before start', [
                    'execution_id' => $this->execution->id,
                ]);
                $this->markCancelled();
                return;
            }

            // Check concurrent workflows limit
            $maxConcurrent = SystemSetting::get('max_concurrent_workflows', 10);
            
            // Count only truly running executions (not stuck ones)
            // Exclude executions that started more than 1 hour ago (likely stuck)
            $runningCount = WorkflowExecution::where('status', 'running')
                ->where('started_at', '>', now()->subHour())
                ->count();
            
            if ($runningCount >= $maxConcurrent) {
                // Too many workflows running, release back to queue with exponential backoff
                $attempts = $this->attempts();
                $delay = min(5 * pow(2, $attempts), 60); // Exponential: 5s, 10s, 20s, 40s, max 60s
                
                Log::info('Concurrent limit reached, re-queuing workflow with exponential backoff', [
                    'execution_id' => $this->execution->id,
                    'running_count' => $runningCount,
                    'max_concurrent' => $maxConcurrent,
                    'attempt' => $attempts,
                    'delay_seconds' => $delay,
                ]);
                
                // Release job back to queue with exponential backoff
                $this->release($delay);
                return;
            }
            
            Log::info('Starting async workflow execution', [
                'execution_id' => $this->execution->id,
                'workflow_id' => $this->workflow->id,
                'running_count' => $runningCount,
                'max_concurrent' => $maxConcurrent,
            ]);

            $freshBeforeStart = $this->execution->fresh();

            if ($freshBeforeStart->status === 'cancelled' || $freshBeforeStart->cancel_requested_at) {
                Log::info('Workflow execution cancelled prior to start update', [
                    'execution_id' => $this->execution->id,
                ]);
                $this->execution = $freshBeforeStart;
                $this->markCancelled();
                return;
            }

            // Update status to running
            $this->execution->update([
                'status' => 'running',
                'started_at' => now(),
                'queue_job_id' => null,
            ]);

            if ($this->execution->fresh()->cancel_requested_at) {
                Log::info('Workflow execution cancelled immediately after starting', [
                    'execution_id' => $this->execution->id,
                ]);
                $this->markCancelled();
                return;
            }

            $webhookController = new WebhookController();
            
            // Execute workflow
            Log::info('ExecuteWorkflowJob: Starting workflow execution', [
                'execution_id' => $this->execution->id,
                'workflow_id' => $this->workflow->id,
                'queue_job_id' => $this->job->getJobId(),
            ]);
            
            $startTime = microtime(true);
            $executionResult = $webhookController->executeWorkflowPublic(
                $this->workflow,
                $this->webhookRequest,
                'webhook',
                $this->execution,
                $this->resumeContext
            );
            $endTime = microtime(true);
            $duration = round(($endTime - $startTime) * 1000);
            
            Log::info('ExecuteWorkflowJob: Workflow execution completed', [
                'execution_id' => $this->execution->id,
                'workflow_id' => $this->workflow->id,
                'duration_ms' => $duration,
                'has_error' => $executionResult['has_error'] ?? false,
            ]);

            $nodeResults = $executionResult['node_results'] ?? [];
            $executionOrder = $executionResult['execution_order'] ?? [];
            $errorNode = $executionResult['error_node'] ?? null;
            $hasError = $executionResult['has_error'] ?? false;

            // Get final output
            $finalOutput = null;
            if (!empty($nodeResults)) {
                $lastNodeResult = end($nodeResults);
                $finalOutput = is_array($lastNodeResult) && isset($lastNodeResult['output'])
                    ? $lastNodeResult['output']
                    : $lastNodeResult;
            }

            $freshExecution = $this->execution->fresh();
            
            // Check if execution was already updated by executeWorkflowPublic (shouldn't happen, but safety check)
            // Even if already completed, we should still update missing fields (duration_ms, node_results, etc.)
            $needsDurationUpdate = !$freshExecution->duration_ms && $freshExecution->started_at;
            $needsNodeResultsUpdate = empty($freshExecution->node_results) && !empty($nodeResults);
            
            // If already completed, check if we need to update missing data
            if (($freshExecution->status === 'completed' || $freshExecution->status === 'error')) {
                if (!$needsDurationUpdate && !$needsNodeResultsUpdate) {
                    Log::info('Execution already completed with all data, skipping update', [
                        'execution_id' => $this->execution->id,
                        'current_status' => $freshExecution->status,
                        'has_duration_ms' => !empty($freshExecution->duration_ms),
                        'has_node_results' => !empty($freshExecution->node_results),
                    ]);
                    return; // Exit early if already completed with all data
                }
                
                // Update missing data for already completed execution
                try {
                    $updateData = [];
                    
                    if ($needsDurationUpdate) {
                        $calculatedDuration = $freshExecution->started_at 
                            ? $freshExecution->started_at->diffInMilliseconds(now())
                            : $duration;
                        $updateData['duration_ms'] = $calculatedDuration;
                    }
                    
                    if ($needsNodeResultsUpdate) {
                        $updateData['node_results'] = $nodeResults;
                        $updateData['execution_order'] = $executionOrder;
                        $updateData['error_node'] = $errorNode;
                        if (!empty($finalOutput)) {
                            $updateData['output_data'] = $finalOutput;
                        }
                    }
                    
                    if (!empty($updateData)) {
                        $freshExecution->updateOrFail($updateData);
                        
                        Log::info('Updated missing data for already completed execution', [
                            'execution_id' => $this->execution->id,
                            'updated_fields' => array_keys($updateData),
                            'duration_ms' => $updateData['duration_ms'] ?? null,
                            'node_results_count' => isset($updateData['node_results']) ? count($updateData['node_results']) : null,
                        ]);
                    }
                } catch (\Exception $e) {
                    Log::error('Failed to update missing data for completed execution', [
                        'execution_id' => $this->execution->id,
                        'error' => $e->getMessage(),
                    ]);
                }
                return;
            }
            
            if ($freshExecution->status !== 'cancelled') {
                // Update execution record with retry logic for database errors
                try {
                    $updateData = [
                        'status' => $hasError ? 'error' : 'completed',
                        'output_data' => $finalOutput,
                        'node_results' => $nodeResults,
                        'execution_order' => $executionOrder,
                        'error_node' => $errorNode,
                        'duration_ms' => $duration,
                        'finished_at' => now(),
                        'queue_job_id' => null,
                    ];
                    
                    // Use updateOrFail to ensure update happens
                    $freshExecution->updateOrFail($updateData);
                    
                    Log::info('Workflow execution completed - status updated by Job', [
                        'execution_id' => $this->execution->id,
                        'status' => $hasError ? 'error' : 'completed',
                        'duration_ms' => $duration,
                        'error_node' => $errorNode,
                    ]);
                } catch (\Exception $updateException) {
                    // If update fails, try simpler update
                    Log::error('Failed to update execution with full data, trying minimal update', [
                        'execution_id' => $this->execution->id,
                        'error' => $updateException->getMessage(),
                        'trace' => $updateException->getTraceAsString(),
                    ]);
                    
                    try {
                        // Calculate duration_ms even for minimal update
                        $minimalDuration = $freshExecution->started_at 
                            ? $freshExecution->started_at->diffInMilliseconds(now())
                            : $duration;
                        
                        $freshExecution->updateOrFail([
                            'status' => $hasError ? 'error' : 'completed',
                            'finished_at' => now(),
                            'duration_ms' => $minimalDuration,
                            'queue_job_id' => null,
                        ]);
                        
                        Log::info('Execution updated with minimal data (including duration_ms)', [
                            'execution_id' => $this->execution->id,
                            'duration_ms' => $minimalDuration,
                        ]);
                    } catch (\Exception $minimalUpdateException) {
                        Log::error('Failed to update execution even with minimal data', [
                            'execution_id' => $this->execution->id,
                            'error' => $minimalUpdateException->getMessage(),
                            'trace' => $minimalUpdateException->getTraceAsString(),
                        ]);
                    }
                }
            }

        } catch (WorkflowCancelledException $e) {
            Log::info('Workflow execution cancelled', [
                'execution_id' => $this->execution->id,
                'message' => $e->getMessage(),
            ]);

            $this->markCancelled();
        } catch (\Exception $e) {
            Log::error('Workflow execution job failed', [
                'execution_id' => $this->execution->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            $freshExecution = $this->execution->fresh();
            
            if ($freshExecution->status !== 'cancelled') {
                // Calculate duration even on error
                $errorDuration = $freshExecution->started_at 
                    ? $freshExecution->started_at->diffInMilliseconds(now())
                    : 0;
                
                // Update execution as failed with retry logic
                try {
                    $freshExecution->update([
                        'status' => 'error',
                        'output_data' => [
                            'error' => 'Workflow execution failed',
                            'message' => $e->getMessage(),
                        ],
                        'finished_at' => now(),
                        'duration_ms' => $errorDuration,
                        'queue_job_id' => null,
                    ]);
                } catch (\Exception $updateException) {
                    // If update fails, try simpler update
                    Log::error('Failed to update execution on error, trying minimal update', [
                        'execution_id' => $this->execution->id,
                        'error' => $updateException->getMessage(),
                    ]);
                    
                    try {
                        $freshExecution->update([
                            'status' => 'error',
                            'finished_at' => now(),
                            'duration_ms' => $errorDuration,
                            'queue_job_id' => null,
                        ]);
                    } catch (\Exception $minimalUpdateException) {
                        Log::error('Failed to update execution even with minimal data on error', [
                            'execution_id' => $this->execution->id,
                            'error' => $minimalUpdateException->getMessage(),
                        ]);
                    }
                }
            }
        }
        
        // Safety net: never leave execution stuck in running
        // Check one more time and force update if still running
        $finalCheck = $this->execution->fresh();
        if ($finalCheck && $finalCheck->status === 'running') {
            Log::warning('Execution still in running state after completion - forcing update', [
                'execution_id' => $this->execution->id,
            ]);
            
            try {
                // Calculate duration for safety net update
                $safetyDuration = $finalCheck->started_at 
                    ? $finalCheck->started_at->diffInMilliseconds(now())
                    : 0;
                
                $finalCheck->update([
                    'status' => 'completed',
                    'finished_at' => now(),
                    'duration_ms' => $safetyDuration,
                    'queue_job_id' => null,
                ]);
            } catch (\Exception $safetyNetException) {
                Log::error('Safety net update failed', [
                    'execution_id' => $this->execution->id,
                    'error' => $safetyNetException->getMessage(),
                ]);
            }
        }
    }

    public function failed(\Throwable $exception)
    {
        Log::error('Workflow execution job failed permanently', [
            'execution_id' => $this->execution->id,
            'error' => $exception->getMessage(),
        ]);

        if ($this->execution->fresh()->status !== 'cancelled') {
            $this->execution->update([
                'status' => 'error',
                'output_data' => [
                    'error' => 'Job failed',
                    'message' => $exception->getMessage(),
                ],
                'finished_at' => now(),
                'queue_job_id' => null,
            ]);
        }
    }

    protected function markCancelled(): void
    {
        $now = now();
        $execution = $this->execution->fresh();

        $startedAt = $execution->started_at ?: $now;
        $duration = $execution->started_at
            ? $execution->started_at->diffInMilliseconds($now)
            : 0;

        $execution->update([
            'status' => 'cancelled',
            'cancel_requested_at' => $execution->cancel_requested_at ?: $now,
            'cancelled_at' => $now,
            'finished_at' => $now,
            'duration_ms' => $duration,
            'queue_job_id' => null,
        ]);
    }
}


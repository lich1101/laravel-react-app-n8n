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

    public $timeout = 0; // No timeout limit - workflow có thể chạy vô thời hạn
    public $tries = 0; // Unlimited retries (for queue management when limit reached)

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
            $maxConcurrent = SystemSetting::get('max_concurrent_workflows', 5);
            $runningCount = WorkflowExecution::where('status', 'running')->count();
            
            if ($runningCount >= $maxConcurrent) {
                // Too many workflows running, release back to queue with delay
                Log::info('Concurrent limit reached, re-queuing workflow', [
                    'execution_id' => $this->execution->id,
                    'running_count' => $runningCount,
                    'max_concurrent' => $maxConcurrent,
                ]);
                
                // Release job back to queue, retry after 3 seconds
                $this->release(3);
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

            if ($this->execution->fresh()->status !== 'cancelled') {
                // Update execution record
                $this->execution->update([
                    'status' => $hasError ? 'error' : 'completed',
                    'output_data' => $finalOutput,
                    'node_results' => $nodeResults,
                    'execution_order' => $executionOrder,
                    'error_node' => $errorNode,
                    'duration_ms' => $duration,
                    'finished_at' => now(),
                    'queue_job_id' => null,
                ]);
            }

            Log::info('Workflow execution completed', [
                'execution_id' => $this->execution->id,
                'status' => $hasError ? 'error' : 'success',
                'duration_ms' => $duration,
                'error_node' => $errorNode,
            ]);

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

            if ($this->execution->fresh()->status !== 'cancelled') {
                // Update execution as failed
                $this->execution->update([
                    'status' => 'error',
                    'output_data' => [
                        'error' => 'Workflow execution failed',
                        'message' => $e->getMessage(),
                    ],
                    'finished_at' => now(),
                    'queue_job_id' => null,
                ]);
            }
        }
        
        // Safety net: never leave execution stuck in running
        if ($this->execution->fresh()->status === 'running') {
            $this->execution->update([
                'status' => 'completed',
                'finished_at' => now(),
                'queue_job_id' => null,
            ]);
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


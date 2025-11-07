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

class ExecuteWorkflowJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 0; // No timeout limit - workflow có thể chạy vô thời hạn
    public $tries = 0; // Unlimited retries (for queue management when limit reached)

    protected $execution;
    protected $workflow;
    protected $webhookRequest;

    public function __construct(WorkflowExecution $execution, Workflow $workflow, array $webhookRequest)
    {
        $this->execution = $execution;
        $this->workflow = $workflow;
        $this->webhookRequest = $webhookRequest;
    }

    public function handle()
    {
        try {
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

            // Update status to running
            $this->execution->update([
                'status' => 'running',
                'started_at' => now(),
            ]);

            $webhookController = new WebhookController();
            
            // Execute workflow
            $startTime = microtime(true);
            $executionResult = $webhookController->executeWorkflowPublic(
                $this->workflow,
                $this->webhookRequest,
                'webhook',
                $this->execution
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

            // Update execution record
            $this->execution->update([
                'status' => $hasError ? 'error' : 'success',
                'output_data' => $finalOutput,
                'node_results' => $nodeResults,
                'execution_order' => $executionOrder,
                'error_node' => $errorNode,
                'duration_ms' => $duration,
                'finished_at' => now(),
            ]);

            Log::info('Workflow execution completed', [
                'execution_id' => $this->execution->id,
                'status' => $hasError ? 'error' : 'success',
                'duration_ms' => $duration,
                'error_node' => $errorNode,
            ]);

        } catch (\Exception $e) {
            Log::error('Workflow execution job failed', [
                'execution_id' => $this->execution->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            // Update execution as failed
            $this->execution->update([
                'status' => 'error',
                'output_data' => [
                    'error' => 'Workflow execution failed',
                    'message' => $e->getMessage(),
                ],
                'finished_at' => now(),
            ]);
        }
    }

    public function failed(\Throwable $exception)
    {
        Log::error('Workflow execution job failed permanently', [
            'execution_id' => $this->execution->id,
            'error' => $exception->getMessage(),
        ]);

        $this->execution->update([
            'status' => 'error',
            'output_data' => [
                'error' => 'Job failed',
                'message' => $exception->getMessage(),
            ],
            'finished_at' => now(),
        ]);
    }
}


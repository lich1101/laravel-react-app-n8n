<?php

namespace App\Console\Commands;

use App\Models\WorkflowExecution;
use Illuminate\Console\Command;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class CheckStuckExecution extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'execution:check-stuck {execution_id? : Specific execution ID to check} {--all : Check all running executions}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Check stuck workflow executions and show details';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $executionId = $this->argument('execution_id');
        $checkAll = $this->option('all');

        if ($executionId) {
            $this->checkSpecificExecution($executionId);
        } elseif ($checkAll) {
            $this->checkAllRunningExecutions();
        } else {
            $this->info('Usage:');
            $this->info('  php artisan execution:check-stuck {execution_id}  - Check specific execution');
            $this->info('  php artisan execution:check-stuck --all            - Check all running executions');
        }

        return 0;
    }

    private function checkSpecificExecution($executionId)
    {
        $execution = WorkflowExecution::find($executionId);

        if (!$execution) {
            $this->error("Execution #{$executionId} not found.");
            return;
        }

        $this->info("=== Execution #{$executionId} Details ===");
        $this->displayExecutionDetails($execution);

        // Check if stuck
        if ($execution->status === 'running') {
            $runningTime = $execution->started_at 
                ? now()->diffInSeconds($execution->started_at) 
                : 0;
            
            $this->warn("⚠️  Execution is RUNNING for {$runningTime} seconds");
            
            if ($runningTime > 300) {
                $this->error("❌ Execution is STUCK (running > 5 minutes)");
                $this->info("Run: php artisan queue:cleanup-stuck --timeout=300");
            }
        }

        // Check for duplicate executions
        $this->checkDuplicates($execution);
    }

    private function checkAllRunningExecutions()
    {
        // Use limit to avoid memory issues with large datasets
        $runningExecutions = WorkflowExecution::where('status', 'running')
            ->orderBy('id', 'desc')
            ->limit(50)
            ->get();

        if ($runningExecutions->isEmpty()) {
            $this->info('✓ No running executions found.');
            return;
        }

        $this->info("Found {$runningExecutions->count()} running execution(s):\n");

        foreach ($runningExecutions as $execution) {
            $runningTime = $execution->started_at 
                ? now()->diffInSeconds($execution->started_at) 
                : 0;
            
            $status = $runningTime > 300 ? '❌ STUCK' : '⚠️  RUNNING';
            
            $this->line("{$status} - Execution #{$execution->id}");
            $this->displayExecutionDetails($execution, true);
            $this->newLine();
        }

        // Check for duplicates
        $this->checkAllDuplicates();
    }

    private function displayExecutionDetails($execution, $compact = false)
    {
        $details = [
            'Workflow ID' => $execution->workflow_id,
            'Status' => $execution->status,
            'Trigger Type' => $execution->trigger_type ?? 'N/A',
            'Created At' => $execution->created_at?->format('Y-m-d H:i:s') ?? 'N/A',
            'Started At' => $execution->started_at?->format('Y-m-d H:i:s') ?? 'N/A',
            'Finished At' => $execution->finished_at?->format('Y-m-d H:i:s') ?? 'N/A',
            'Queue Job ID' => $execution->queue_job_id ?? 'N/A',
        ];

        if ($execution->started_at) {
            $runningTime = now()->diffInSeconds($execution->started_at);
            $details['Running Time'] = "{$runningTime} seconds";
        }

        if ($execution->duration_ms) {
            $details['Duration'] = "{$execution->duration_ms}ms";
        }

        foreach ($details as $key => $value) {
            if ($compact) {
                $this->line("  {$key}: {$value}");
            } else {
                $this->info("  {$key}: {$value}");
            }
        }

        // Check input data for webhook signature
        if ($execution->input_data && is_array($execution->input_data)) {
            $this->line("  Input Data Keys: " . implode(', ', array_keys($execution->input_data)));
        }
    }

    private function checkDuplicates($execution)
    {
        if ($execution->trigger_type !== 'webhook') {
            return;
        }

        // Find other executions with same workflow and similar timing
        $timeWindow = Carbon::parse($execution->created_at)->subSeconds(10);
        $timeWindowEnd = Carbon::parse($execution->created_at)->addSeconds(10);

        $duplicates = WorkflowExecution::where('workflow_id', $execution->workflow_id)
            ->where('id', '!=', $execution->id)
            ->where('trigger_type', 'webhook')
            ->whereBetween('created_at', [$timeWindow, $timeWindowEnd])
            ->get();

        if ($duplicates->isNotEmpty()) {
            $this->warn("\n⚠️  Found " . $duplicates->count() . " potential duplicate execution(s):");
            foreach ($duplicates as $dup) {
                $timeDiff = abs($execution->created_at->diffInSeconds($dup->created_at));
                $this->line("  - Execution #{$dup->id} (created {$timeDiff}s difference, status: {$dup->status})");
            }
        } else {
            $this->info("\n✓ No duplicate executions found.");
        }
    }

    private function checkAllDuplicates()
    {
        $this->info("\n=== Checking for Duplicate Executions ===");
        
        // Group executions by workflow_id and created_at (within 5 seconds)
        $recentExecutions = WorkflowExecution::where('trigger_type', 'webhook')
            ->where('created_at', '>', now()->subHours(24))
            ->orderBy('workflow_id')
            ->orderBy('created_at')
            ->get();

        $duplicateGroups = [];
        
        foreach ($recentExecutions as $execution) {
            $key = $execution->workflow_id . '_' . $execution->created_at->format('Y-m-d H:i:s');
            
            // Check for executions within 5 seconds
            $nearby = $recentExecutions->filter(function ($e) use ($execution) {
                return $e->workflow_id === $execution->workflow_id 
                    && $e->id !== $execution->id
                    && abs($e->created_at->diffInSeconds($execution->created_at)) <= 5;
            });

            if ($nearby->isNotEmpty()) {
                $groupKey = $execution->workflow_id . '_' . $execution->created_at->format('Y-m-d H:i');
                if (!isset($duplicateGroups[$groupKey])) {
                    $duplicateGroups[$groupKey] = collect([$execution]);
                }
                $duplicateGroups[$groupKey] = $duplicateGroups[$groupKey]->merge($nearby)->unique('id');
            }
        }

        if (empty($duplicateGroups)) {
            $this->info('✓ No duplicate executions found.');
            return;
        }

        $this->warn("Found " . count($duplicateGroups) . " duplicate group(s):");
        foreach ($duplicateGroups as $groupKey => $group) {
            $workflowId = explode('_', $groupKey)[0];
            $this->warn("\n  Workflow #{$workflowId} - " . $group->count() . " executions:");
            foreach ($group as $exec) {
                $this->line("    - Execution #{$exec->id} ({$exec->status}) - {$exec->created_at->format('H:i:s')}");
            }
        }
    }
}


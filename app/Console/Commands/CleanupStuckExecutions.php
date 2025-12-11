<?php

namespace App\Console\Commands;

use App\Models\WorkflowExecution;
use Illuminate\Console\Command;
use Carbon\Carbon;

class CleanupStuckExecutions extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'queue:cleanup-stuck {--timeout=300 : Timeout in seconds (default: 5 minutes)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Cleanup stuck workflow executions (running/queued for too long)';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $timeout = (int) $this->option('timeout');
        $cutoffTime = Carbon::now()->subSeconds($timeout);

        $this->info("Checking for stuck executions (timeout: {$timeout}s)...");

        // Find stuck 'running' executions (limit to avoid memory issues)
        // Use orderBy('id') instead of orderBy('started_at') to avoid memory issues
        $stuckRunning = WorkflowExecution::where('status', 'running')
            ->where('started_at', '<', $cutoffTime)
            ->orderBy('id', 'desc')
            ->limit(100)
            ->get();

        // Find stuck 'queued' executions (never started)
        // Use orderBy('id') instead of orderBy('created_at') to avoid memory issues
        $stuckQueued = WorkflowExecution::where('status', 'queued')
            ->where('created_at', '<', $cutoffTime)
            ->whereNull('started_at')
            ->orderBy('id', 'desc')
            ->limit(100)
            ->get();

        $totalStuck = $stuckRunning->count() + $stuckQueued->count();

        if ($totalStuck === 0) {
            $this->info('✓ No stuck executions found.');
            return 0;
        }

        $this->warn("Found {$totalStuck} stuck executions:");
        $this->warn("  - Running: {$stuckRunning->count()}");
        $this->warn("  - Queued: {$stuckQueued->count()}");

        if (!$this->confirm('Do you want to mark them as failed?', true)) {
            $this->info('Cleanup cancelled.');
            return 0;
        }

        // Cleanup stuck running executions
        foreach ($stuckRunning as $execution) {
            try {
                $execution->update([
                    'status' => 'error',
                    'output_data' => [
                        'error' => 'Execution stuck/timeout',
                        'message' => 'Workflow was stuck in running state and was automatically cleaned up.',
                        'stuck_since' => $execution->started_at?->toIso8601String(),
                        'cleaned_at' => now()->toIso8601String(),
                    ],
                    'finished_at' => now(),
                    'queue_job_id' => null,
                ]);
                $this->info("  ✓ Cleaned execution #{$execution->id} (workflow #{$execution->workflow_id})");
            } catch (\Exception $e) {
                $this->error("  ✗ Failed to clean execution #{$execution->id}: " . $e->getMessage());
            }
        }

        // Cleanup stuck queued executions
        foreach ($stuckQueued as $execution) {
            try {
                $execution->update([
                    'status' => 'error',
                    'output_data' => [
                        'error' => 'Execution stuck in queue',
                        'message' => 'Workflow was stuck in queued state and was automatically cleaned up.',
                        'stuck_since' => $execution->created_at?->toIso8601String(),
                        'cleaned_at' => now()->toIso8601String(),
                    ],
                    'finished_at' => now(),
                    'queue_job_id' => null,
                ]);
                $this->info("  ✓ Cleaned execution #{$execution->id} (workflow #{$execution->workflow_id})");
            } catch (\Exception $e) {
                $this->error("  ✗ Failed to clean execution #{$execution->id}: " . $e->getMessage());
            }
        }

        $this->info('');
        $this->info("✅ Cleaned up {$totalStuck} stuck executions.");

        return 0;
    }
}

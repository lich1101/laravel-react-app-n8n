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

        // Find stuck 'running' executions
        $stuckRunning = WorkflowExecution::where('status', 'running')
            ->where('started_at', '<', $cutoffTime)
            ->get();

        // Find stuck 'queued' executions (never started)
        $stuckQueued = WorkflowExecution::where('status', 'queued')
            ->where('created_at', '<', $cutoffTime)
            ->whereNull('started_at')
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
            $execution->update([
                'status' => 'error',
                'output_data' => [
                    'error' => 'Execution stuck/timeout',
                    'message' => 'Workflow was stuck in running state and was automatically cleaned up.',
                ],
                'finished_at' => now(),
            ]);
            $this->info("  ✓ Cleaned execution #{$execution->id} (workflow #{$execution->workflow_id})");
        }

        // Cleanup stuck queued executions
        foreach ($stuckQueued as $execution) {
            $execution->update([
                'status' => 'error',
                'output_data' => [
                    'error' => 'Execution stuck in queue',
                    'message' => 'Workflow was stuck in queued state and was automatically cleaned up.',
                ],
                'finished_at' => now(),
            ]);
            $this->info("  ✓ Cleaned execution #{$execution->id} (workflow #{$execution->workflow_id})");
        }

        $this->info('');
        $this->info("✅ Cleaned up {$totalStuck} stuck executions.");

        return 0;
    }
}

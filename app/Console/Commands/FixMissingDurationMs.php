<?php

namespace App\Console\Commands;

use App\Models\WorkflowExecution;
use Illuminate\Console\Command;

class FixMissingDurationMs extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'workflows:fix-missing-data {--limit=100 : Maximum number of executions to check}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Check and report missing duration_ms or node_results for completed/error executions';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $limit = (int) $this->option('limit');
        
        $this->info('Searching for executions with missing data...');
        
        // Find executions missing duration_ms
        $missingDuration = WorkflowExecution::whereIn('status', ['completed', 'success', 'error'])
            ->whereNull('duration_ms')
            ->whereNotNull('started_at')
            ->limit($limit)
            ->get();
        
        // Find executions missing node_results
        $missingNodeResults = WorkflowExecution::whereIn('status', ['completed', 'success', 'error'])
            ->where(function($query) {
                $query->whereNull('node_results')
                      ->orWhere('node_results', '[]')
                      ->orWhere('node_results', '{}');
            })
            ->limit($limit)
            ->get();
        
        $fixedDuration = 0;
        $fixedNodeResults = 0;
        $failed = 0;
        
        // Fix missing duration_ms
        if ($missingDuration->isNotEmpty()) {
            $this->info("Found {$missingDuration->count()} executions without duration_ms.");
            
            foreach ($missingDuration as $execution) {
                try {
                    $duration = $execution->started_at->diffInMilliseconds(
                        $execution->finished_at ?: now()
                    );
                    
                    $execution->update(['duration_ms' => $duration]);
                    
                    $fixedDuration++;
                    $this->line("  ✓ Fixed execution #{$execution->id}: {$duration}ms");
                } catch (\Exception $e) {
                    $failed++;
                    $this->error("  ✗ Failed to fix execution #{$execution->id}: {$e->getMessage()}");
                }
            }
        }
        
        // Report missing node_results (cannot fix as data is lost)
        if ($missingNodeResults->isNotEmpty()) {
            $this->warn("Found {$missingNodeResults->count()} executions without node_results (data cannot be recovered):");
            
            foreach ($missingNodeResults as $execution) {
                $this->line("  ⚠ Execution #{$execution->id} (status: {$execution->status}, started: {$execution->started_at})");
                $this->line("    → node_results data was lost and cannot be recovered.");
                $this->line("    → This execution will not show node data in history view.");
            }
            
            $this->newLine();
            $this->info("Note: Missing node_results cannot be fixed as the execution data is no longer available.");
            $this->info("Future executions will have node_results saved correctly.");
        }
        
        if ($missingDuration->isEmpty() && $missingNodeResults->isEmpty()) {
            $this->info('No executions found with missing data.');
        } else {
            $this->newLine();
            $this->info("Summary: {$fixedDuration} duration_ms fixed, {$missingNodeResults->count()} missing node_results (cannot fix), {$failed} failed.");
        }
        
        return 0;
    }
}


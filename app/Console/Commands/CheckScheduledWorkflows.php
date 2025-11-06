<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Workflow;
use App\Http\Controllers\Api\WebhookController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class CheckScheduledWorkflows extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'workflows:check-schedules';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Check and execute workflows with Schedule Trigger nodes';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Checking for scheduled workflows...');
        
        // Get all active workflows
        $workflows = Workflow::where('active', true)->get();
        
        $this->info("Found {$workflows->count()} active workflows");
        
        $triggered = 0;
        $checked = 0;
        
        foreach ($workflows as $workflow) {
            $checked++;
            $this->info("Checking workflow: {$workflow->name} (ID: {$workflow->id})");
            
            // Get workflow nodes - already decoded by model cast
            $nodes = $workflow->nodes;
            
            if (!is_array($nodes)) {
                $this->warn("  Nodes is not array, skipping");
                continue;
            }
            
            $this->info("  Found " . count($nodes) . " nodes");
            
            // Find Schedule Trigger nodes
            foreach ($nodes as $node) {
                $nodeType = $node['type'] ?? '';
                $nodeName = $node['data']['customName'] ?? $node['data']['label'] ?? 'unnamed';
                
                if ($nodeType === 'schedule') {
                    $this->info("  ✅ Found Schedule Trigger: {$nodeName}");
                    
                    $config = $node['data']['config'] ?? [];
                    $this->info("  Config: " . json_encode($config));
                    
                    if ($this->shouldTrigger($config, $workflow)) {
                        $this->info("  🚀 Triggering workflow: {$workflow->name}");
                        
                        // Execute the workflow
                        $this->executeWorkflow($workflow, $node);
                        $triggered++;
                    } else {
                        $this->info("  ⏳ Not time to trigger yet");
                    }
                }
            }
        }
        
        $this->info("Checked {$checked} workflows, triggered {$triggered}");
        
        return Command::SUCCESS;
    }

    /**
     * Check if schedule should trigger now
     */
    private function shouldTrigger($config, $workflow)
    {
        $triggerType = $config['triggerType'] ?? 'interval';
        $timezone = $config['timezone'] ?? 'Asia/Ho_Chi_Minh';
        $now = Carbon::now($timezone);
        
        // Get last execution time from workflow
        $lastExecution = $workflow->executions()
            ->where('trigger_type', 'schedule')
            ->latest()
            ->first();
        
        if ($triggerType === 'cron') {
            return $this->shouldTriggerCron($config['cronExpression'] ?? '0 * * * *', $lastExecution, $now);
        }
        
        // Interval-based trigger
        return $this->shouldTriggerInterval($config, $lastExecution, $now);
    }

    /**
     * Check if cron expression should trigger
     */
    private function shouldTriggerCron($cronExpression, $lastExecution, $now)
    {
        // Simple cron parsing (for production, use a library like cron-expression)
        // For now, check if current minute matches
        
        // If last execution was within the last minute, don't trigger again
        if ($lastExecution && $lastExecution->created_at->diffInSeconds($now) < 60) {
            return false;
        }
        
        // Parse cron: minute hour day month weekday
        $parts = explode(' ', $cronExpression);
        if (count($parts) < 5) {
            return false;
        }
        
        [$minute, $hour, $day, $month, $weekday] = $parts;
        
        // Check if current time matches cron expression
        if ($minute !== '*' && (int)$minute !== $now->minute) return false;
        if ($hour !== '*' && (int)$hour !== $now->hour) return false;
        if ($day !== '*' && (int)$day !== $now->day) return false;
        if ($month !== '*' && (int)$month !== $now->month) return false;
        if ($weekday !== '*' && (int)$weekday !== $now->dayOfWeek) return false;
        
        return true;
    }

    /**
     * Check if interval should trigger
     */
    private function shouldTriggerInterval($config, $lastExecution, $now)
    {
        $interval = $config['interval'] ?? 'hours';
        $intervalValue = $config['intervalValue'] ?? 1;
        
        // If never executed, trigger now
        if (!$lastExecution) {
            // But check if we're at the right time for daily/weekly/monthly
            if (in_array($interval, ['days', 'weeks', 'months'])) {
                $hour = $config['triggerAt']['hour'] ?? 0;
                $minute = $config['triggerAt']['minute'] ?? 0;
                
                return $now->hour === $hour && $now->minute === $minute;
            }
            return true;
        }
        
        $lastTime = $lastExecution->created_at;
        
        switch ($interval) {
            case 'minutes':
                return $lastTime->diffInMinutes($now) >= $intervalValue;
            case 'hours':
                return $lastTime->diffInHours($now) >= $intervalValue;
            case 'days':
                $hour = $config['triggerAt']['hour'] ?? 0;
                $minute = $config['triggerAt']['minute'] ?? 0;
                return $lastTime->diffInDays($now) >= $intervalValue 
                    && $now->hour === $hour 
                    && $now->minute === $minute;
            case 'weeks':
                $hour = $config['triggerAt']['hour'] ?? 0;
                $minute = $config['triggerAt']['minute'] ?? 0;
                return $lastTime->diffInWeeks($now) >= $intervalValue 
                    && $now->hour === $hour 
                    && $now->minute === $minute;
            case 'months':
                $hour = $config['triggerAt']['hour'] ?? 0;
                $minute = $config['triggerAt']['minute'] ?? 0;
                return $lastTime->diffInMonths($now) >= $intervalValue 
                    && $now->hour === $hour 
                    && $now->minute === $minute;
            default:
                return false;
        }
    }

    /**
     * Execute the workflow
     */
    private function executeWorkflow($workflow, $scheduleNode)
    {
        try {
            // Create webhook request data for schedule trigger
            $webhookRequestData = [
                'triggeredAt' => now()->toIso8601String(),
                'triggerType' => 'schedule',
                'schedule' => $scheduleNode['data']['config'] ?? [],
            ];
            
            $webhookController = new WebhookController();
            
            // Execute workflow using public method with trigger_type = 'schedule'
            // This will create an execution record with trigger_type = 'schedule'
            $result = $webhookController->executeWorkflowPublic($workflow, $webhookRequestData, 'schedule');
            
            $this->info("✅ Workflow executed successfully: {$workflow->name}");
            
        } catch (\Exception $e) {
            $this->error("❌ Error executing workflow {$workflow->name}: {$e->getMessage()}");
            Log::error('Schedule trigger execution error', [
                'workflow_id' => $workflow->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }
    }
}

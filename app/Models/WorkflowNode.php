<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Log;
use App\Services\MemoryService;

class WorkflowNode extends Model
{
    protected $fillable = [
        'workflow_id',
        'node_id',
        'type',
        'config',
        'pinned_output',
    ];

    protected $casts = [
        'config' => 'array',
        'pinned_output' => 'array',
    ];

    protected static function booted()
    {
        // Cleanup memory when workflow node is deleted
        static::deleting(function ($workflowNode) {
            try {
                $config = $workflowNode->config ?? [];
                
                // Check if node has memory enabled
                if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                    $memoryService = app(MemoryService::class);
                    $memoryId = $config['memoryId'];
                    
                    // Delete memory from cache
                    $memoryService->deleteMemory($memoryId);
                    
                    Log::info('Memory cleaned up on workflow node deletion', [
                        'workflow_id' => $workflowNode->workflow_id,
                        'node_id' => $workflowNode->node_id,
                        'memory_id' => $memoryId,
                    ]);
                }
            } catch (\Exception $e) {
                // Don't block deletion if cleanup fails
                Log::error('Failed to cleanup memory on workflow node deletion', [
                    'workflow_node_id' => $workflowNode->id,
                    'node_id' => $workflowNode->node_id,
                    'error' => $e->getMessage(),
                ]);
            }
        });
    }

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }
}

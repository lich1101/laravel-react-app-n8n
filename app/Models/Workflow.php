<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use App\Services\MemoryService;
use Illuminate\Support\Facades\Log;

class Workflow extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'description',
        'nodes',
        'edges',
        'active',
        'folder_id',
        'is_from_folder',
    ];

    protected $casts = [
        'nodes' => 'array',
        'edges' => 'array',
        'active' => 'boolean',
        'is_from_folder' => 'boolean',
    ];

    /**
     * Boot method to register events
     */
    protected static function boot()
    {
        parent::boot();

        // Cleanup memories when workflow is deleted
        static::deleting(function ($workflow) {
            try {
                $memoryService = app(MemoryService::class);
                $deletedCount = 0;
                $memoryIdsProcessed = []; // Track processed memory IDs to avoid duplicates
                
                // First, check workflow_nodes table (where config is actually stored)
                $workflowNodes = \App\Models\WorkflowNode::where('workflow_id', $workflow->id)->get();
                foreach ($workflowNodes as $workflowNode) {
                    $config = $workflowNode->config ?? [];
                    if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                        $memoryId = $config['memoryId'];
                        
                        // Skip if already processed
                        if (!in_array($memoryId, $memoryIdsProcessed)) {
                            $memoryService->deleteMemory($memoryId);
                            $memoryIdsProcessed[] = $memoryId;
                            $deletedCount++;
                            
                            Log::info('Memory cleaned up on workflow deletion (from workflow_nodes)', [
                                'workflow_id' => $workflow->id,
                                'memory_id' => $memoryId,
                                'node_id' => $workflowNode->node_id,
                            ]);
                        }
                    }
                }
                
                // Fallback: also check workflow.nodes JSON (for backward compatibility)
                $nodes = $workflow->nodes ?? [];
                foreach ($nodes as $node) {
                    $config = $node['data']['config'] ?? [];
                    
                    // Check if node has memory enabled
                    if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                        $memoryId = $config['memoryId'];
                        
                        // Skip if already processed
                        if (!in_array($memoryId, $memoryIdsProcessed)) {
                            $memoryService->deleteMemory($memoryId);
                            $memoryIdsProcessed[] = $memoryId;
                            $deletedCount++;
                            
                            Log::info('Memory cleaned up on workflow deletion (from nodes JSON)', [
                                'workflow_id' => $workflow->id,
                                'memory_id' => $memoryId,
                                'node_id' => $node['id'] ?? 'unknown',
                            ]);
                        }
                    }
                }
                
                if ($deletedCount > 0) {
                    Log::info('Total memories cleaned up on workflow deletion', [
                        'workflow_id' => $workflow->id,
                        'deleted_count' => $deletedCount,
                    ]);
                }
            } catch (\Exception $e) {
                // Don't block deletion if cleanup fails
                Log::error('Failed to cleanup memories on workflow deletion', [
                    'workflow_id' => $workflow->id,
                    'error' => $e->getMessage(),
                ]);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    public function workflowNodes()
    {
        return $this->hasMany(WorkflowNode::class);
    }

    public function executions(): HasMany
    {
        return $this->hasMany(WorkflowExecution::class);
    }

    public function folders(): BelongsToMany
    {
        return $this->belongsToMany(Folder::class, 'folder_workflows')
            ->withPivot('order')
            ->orderBy('order');
    }
}

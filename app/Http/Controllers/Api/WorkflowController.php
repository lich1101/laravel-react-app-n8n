<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\WorkflowNode;
use App\Models\WorkflowExecution;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\MemoryService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Log;
use App\Jobs\ExecuteWorkflowJob;

class WorkflowController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        try {
            // Try to get workflows with orderBy, but fallback to PHP sort if MySQL sort fails
            $workflows = Workflow::with('folder')->get();
            
            // Sort by updated_at in PHP to avoid MySQL sort memory issues
            $workflows = $workflows->sortByDesc('updated_at')->values();
            
            return response()->json($workflows);
        } catch (\Exception $e) {
            // Fallback: get without orderBy and sort in PHP
            Log::warning('Workflow index query failed, using fallback', [
                'error' => $e->getMessage()
            ]);
            
            $workflows = Workflow::with('folder')->get();
            $workflows = $workflows->sortByDesc('updated_at')->values();
            
            return response()->json($workflows);
        }
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);

        $user = auth()->user();
        
        // Check max_user_workflows limit for user role only
        if ($user && $user->role === 'user') {
            // Get max_user_workflows from system_settings or project
            $maxUserWorkflows = null;
            $subscriptionPackageName = null;
            
            // Try to get from project first
            if ($user->project_id) {
                $project = $user->project;
                if ($project) {
                    $maxUserWorkflows = $project->max_user_workflows;
                    // Get subscription package name from system_settings if available
                    $subscriptionPackageName = SystemSetting::get('subscription_package_name', null);
                }
            }
            
            // Fallback to system_settings
            if ($maxUserWorkflows === null) {
                $maxUserWorkflows = SystemSetting::get('max_user_workflows', null);
            }
            
            // If max_user_workflows is set, check limit
            if ($maxUserWorkflows !== null && $maxUserWorkflows >= 0) {
                // Count workflows created by user (exclude workflows from folder sync)
                // Workflows synced from folders have is_from_folder = true and are created by admin user
                // so they are automatically excluded by both user_id check and is_from_folder check
                $userWorkflowCount = Workflow::where('user_id', $user->id)
                    ->where(function($query) {
                        $query->where('is_from_folder', false)
                              ->orWhereNull('is_from_folder');
                    })
                    ->count();
                
                // Check if limit reached
                if ($userWorkflowCount >= $maxUserWorkflows) {
                    // Get subscription package name for error message
                    if (!$subscriptionPackageName) {
                        $subscriptionPackageName = SystemSetting::get('subscription_package_name', 'gói cước hiện tại');
                    }
                    
                    return response()->json([
                        'error' => 'workflow_limit_reached',
                        'message' => "Số lượng workflows có thể tạo đã đến giới hạn của {$subscriptionPackageName}",
                        'detail_message' => "Số lượng workflows có thể tạo đã đến giới hạn của {$subscriptionPackageName} - vui lòng liên hệ đội ngũ hỗ trợ để đổi gói cước",
                        'current_count' => $userWorkflowCount,
                        'max_limit' => $maxUserWorkflows,
                        'subscription_package_name' => $subscriptionPackageName,
                    ], 403);
                }
            }
        }

        $workflow = Workflow::create([
            'user_id' => auth()->id(),
            'name' => $request->name,
            'description' => $request->description,
            'nodes' => [],
            'edges' => [],
            'active' => false,
        ]);

        return response()->json($workflow, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        // Find workflow with workflowNodes relation
        // All users can view all workflows
        $workflow = Workflow::with('workflowNodes')->findOrFail($id);
        return response()->json($workflow);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        // All users can edit all workflows
        $workflow = Workflow::findOrFail($id);

        $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'nodes' => 'sometimes|array',
            'edges' => 'sometimes|array',
            'active' => 'sometimes|boolean',
            'folder_id' => 'nullable|exists:folders,id',
        ]);

        $updateData = [];

        if ($request->has('name')) {
            $updateData['name'] = $request->name;
        }
        if ($request->has('description')) {
            $updateData['description'] = $request->description;
        }
        if ($request->has('nodes')) {
            $updateData['nodes'] = $request->nodes;
        }
        if ($request->has('edges')) {
            $updateData['edges'] = $request->edges;
        }
        if ($request->has('active')) {
            // Only allow activation if webhook node exists
            if ($request->active) {
                $hasWebhook = collect($request->nodes ?? $workflow->nodes ?? [])
                    ->contains('type', 'webhook');

                if (!$hasWebhook) {
                    return response()->json([
                        'message' => 'Cannot activate workflow without a webhook node'
                    ], 400);
                }
            }
            $updateData['active'] = $request->active;
        }
        if ($request->has('folder_id')) {
            $updateData['folder_id'] = $request->folder_id;
        }

        // Cleanup memories when nodes are deleted or memoryId changed
        if ($request->has('nodes')) {
            $this->cleanupMemoriesOnNodeChange($workflow, $request->nodes);
        }

        $workflow->update($updateData);

        return response()->json($workflow);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        $workflow = Workflow::findOrFail($id);
        $workflow->delete();

        return response()->json(['message' => 'Workflow deleted successfully']);
    }

    /**
     * Save node configuration
     */
    public function saveNode(Request $request, string $id): JsonResponse
    {
        $workflow = Workflow::findOrFail($id);

        $request->validate([
            'node_id' => 'required|string',
            'type' => 'required|string',
            'config' => 'required|array',
        ]);

        $workflowNode = WorkflowNode::updateOrCreate(
            [
                'workflow_id' => $workflow->id,
                'node_id' => $request->node_id,
            ],
            [
                'type' => $request->type,
                'config' => $request->config,
            ]
        );

        return response()->json($workflowNode);
    }

    /**
     * Get workflow execution history
     * Optimized: Only select necessary fields for list view to improve performance
     */
    public function executions(Request $request, string $id): JsonResponse
    {
        $workflow = Workflow::findOrFail($id);

        // Get pagination params
        $perPage = min((int) $request->get('per_page', 50), 100); // Max 100 per page
        $page = (int) $request->get('page', 1);

        // Only select fields needed for list view (exclude large JSON fields)
        $executions = $workflow->executions()
            ->select([
                'id',
                'workflow_id',
                'trigger_type',
                'status',
                'duration_ms',
                'started_at',
                'finished_at',
                'cancel_requested_at',
                'cancelled_at',
                'error_node',
                'created_at',
                'updated_at',
                // Only get a small preview of error_message (first 200 chars)
                DB::raw('LEFT(error_message, 200) as error_message_preview'),
            ])
            ->orderBy('started_at', 'desc')
            ->orderBy('id', 'desc') // Secondary sort for consistency
            ->paginate($perPage, ['*'], 'page', $page);

        return response()->json($executions);
    }

    /**
     * Get a single execution details
     */
    public function execution(string $workflowId, string $executionId): JsonResponse
    {
        $workflow = Workflow::findOrFail($workflowId);

        $execution = $workflow->executions()->findOrFail($executionId);

        return response()->json($execution);
    }

    /**
     * Resume a failed execution from its error node
     */
    public function resumeExecution(Request $request, string $workflowId, string $executionId): JsonResponse
    {
        $workflow = Workflow::findOrFail($workflowId);

        $execution = $workflow->executions()->findOrFail($executionId);

        if ($execution->status !== 'error') {
            return response()->json([
                'message' => 'Chỉ có thể chạy lại các lần thực thi ở trạng thái error.',
            ], 422);
        }

        if ($execution->resumed_to_execution_id) {
            return response()->json([
                'message' => 'Lần thực thi này đã được chạy lại trước đó.',
            ], 409);
        }

        $request->validate([
            'start_node_id' => 'nullable|string',
        ]);

        $startNodeId = $request->input('start_node_id', $execution->error_node);

        if (!$startNodeId) {
            return response()->json([
                'message' => 'Không xác định được node bắt đầu để chạy lại.',
            ], 422);
        }

        $nodeResults = $execution->node_results ?? [];

        if (empty($nodeResults) || !is_array($nodeResults)) {
            return response()->json([
                'message' => 'Không có dữ liệu node trước đó để tiếp tục.',
            ], 422);
        }

        $currentNodes = is_array($workflow->nodes) ? $workflow->nodes : json_decode($workflow->nodes, true);
        $nodeExists = collect($currentNodes)->contains(function ($node) use ($startNodeId) {
            return isset($node['id']) && $node['id'] === $startNodeId;
        });

        if (!$nodeExists) {
            return response()->json([
                'message' => 'Node bắt đầu không tồn tại trong workflow hiện tại.',
            ], 404);
        }

        $inputData = $execution->input_data ?? [];
        if (!is_array($inputData)) {
            $inputData = [];
        }

        $resumeContext = [
            'source_execution_id' => $execution->id,
            'node_results' => $nodeResults,
            'execution_order' => $execution->execution_order ?? [],
            'start_node_id' => $startNodeId,
        ];

        $newExecution = DB::transaction(function () use ($workflow, $execution, $inputData) {
            $snapshot = [
                'nodes' => is_array($workflow->nodes) ? $workflow->nodes : json_decode($workflow->nodes, true),
                'edges' => is_array($workflow->edges) ? $workflow->edges : json_decode($workflow->edges, true),
            ];

            $created = WorkflowExecution::create([
                'workflow_id' => $workflow->id,
                'trigger_type' => $execution->trigger_type ?? 'webhook',
                'status' => 'queued',
                'input_data' => $inputData,
                'workflow_snapshot' => $snapshot,
                'started_at' => now(),
                'resumed_from_execution_id' => $execution->id,
            ]);

            $execution->update([
                'resumed_at' => now(),
                'resumed_to_execution_id' => $created->id,
            ]);

            return $created;
        });

        $job = new ExecuteWorkflowJob($newExecution, $workflow, $inputData, $resumeContext);
        $jobId = Queue::push($job);

        if ($jobId) {
            $newExecution->update([
                'queue_job_id' => $jobId,
            ]);
        }

        Log::info('Resume execution queued', [
            'workflow_id' => $workflow->id,
            'previous_execution_id' => $execution->id,
            'new_execution_id' => $newExecution->id,
            'start_node_id' => $startNodeId,
        ]);

        return response()->json([
            'message' => 'Workflow đã được đưa vào hàng đợi để chạy lại.',
            'execution' => $newExecution->fresh(),
        ], 202);
    }

    /**
     * Delete an execution
     */
    public function deleteExecution(string $workflowId, string $executionId): JsonResponse
    {
        $workflow = Workflow::findOrFail($workflowId);

        $execution = $workflow->executions()->findOrFail($executionId);

        if ($execution->status === 'running') {
            $execution->update([
                'status' => 'cancelled',
                'queue_job_id' => null,
                'cancel_requested_at' => now(),
                'cancelled_at' => now(),
                'finished_at' => now(),
                'duration_ms' => $execution->started_at
                    ? $execution->started_at->diffInMilliseconds(now())
                    : 0,
            ]);

            return response()->json([
                'message' => 'Cancellation requested. Workflow will stop shortly.',
            ]);
        }

        if (in_array($execution->status, ['queued', 'cancelled', 'success', 'completed', 'error', 'failed'], true)) {
            if ($execution->queue_job_id) {
                DB::table('jobs')->where('id', $execution->queue_job_id)->delete();
            }

        $execution->delete();

            return response()->json([
                'message' => 'Execution deleted successfully',
            ]);
        }

        return response()->json([
            'message' => 'Execution already processed.',
        ]);
    }

    /**
     * Delete all non-running executions for a workflow
     */
    public function bulkDeleteExecutions(Request $request, string $workflowId): JsonResponse
    {
        $workflow = Workflow::findOrFail($workflowId);

        $executions = $workflow->executions()
            ->where('status', '!=', 'running')
            ->where('status', '!=', 'queued')
            ->get();

        if ($executions->isEmpty()) {
            return response()->json([
                'deleted' => 0,
                'message' => 'Không có execution nào cần xóa.',
            ]);
        }

        $deletedCount = 0;

        DB::beginTransaction();

        try {
            foreach ($executions as $execution) {
                if ($execution->queue_job_id) {
                    DB::table('jobs')->where('id', $execution->queue_job_id)->delete();
                }

                $execution->delete();
                $deletedCount++;
            }

            DB::commit();
        } catch (\Throwable $throwable) {
            DB::rollBack();

            throw $throwable;
        }

        return response()->json([
            'deleted' => $deletedCount,
            'message' => 'Đã xóa tất cả executions không ở trạng thái running.',
        ]);
    }

    /**
     * Test a node configuration (avoids CORS issues)
     */
    public function testNode(Request $request): JsonResponse
    {
        $request->validate([
            'nodeType' => 'required|string',
            'config' => 'required|array',
            'inputData' => 'sometimes|array',
            'nodes' => 'sometimes|array', // For building namedInputs
            'edges' => 'sometimes|array', // For building namedInputs
            'nodeOutputs' => 'sometimes|array', // For building namedInputs
            'nodeId' => 'sometimes|string', // Current node ID being tested
        ]);

        $nodeType = $request->nodeType;
        $config = $request->config;
        $inputData = $request->inputData ?? [];
        
        // Build namedInputs if nodes/edges/nodeOutputs are provided (from frontend)
        // This fixes the issue where {{NodeName.field}} doesn't work in test step
        if ($request->has('nodes') && $request->has('edges') && $request->has('nodeOutputs') && $request->has('nodeId')) {
            $nodes = $request->nodes;
            $edges = $request->edges;
            $nodeOutputs = $request->nodeOutputs;
            $nodeId = $request->nodeId;
            
            // Build node map: id => customName
            $nodeMap = [];
            foreach ($nodes as $node) {
                $nodeMap[$node['id']] = $node['data']['customName'] ?? $node['data']['label'] ?? $node['type'];
            }
            
            // Collect upstream nodes using BFS, but respect If/Switch branch routing
            $namedInputs = [];
            $allUpstreamIds = $this->collectAllUpstreamNodesForTestWithBranchFilter($nodeId, $edges, $nodes, $nodeOutputs);
            
            foreach ($allUpstreamIds as $upstreamId) {
                if (isset($nodeOutputs[$upstreamId]) && isset($nodeMap[$upstreamId])) {
                    $nodeName = $nodeMap[$upstreamId];
                    $namedInputs[$nodeName] = $nodeOutputs[$upstreamId];
                }
            }
            
            // Merge namedInputs into inputData (preserve existing numeric indices)
            $inputData = array_merge($inputData, $namedInputs);
        }

        // Create WebhookController instance to use executeNode methods
        $webhookController = new WebhookController();
        
        try {
            $result = null;
            
            // Call appropriate execute method based on node type
            switch ($nodeType) {
                case 'schedule':
                    $result = $webhookController->testScheduleTriggerNode($config, $inputData);
                    break;
                case 'http':
                    $result = $webhookController->testHttpNode($config, $inputData);
                    break;
                case 'code':
                    $result = $webhookController->testCodeNode($config, $inputData);
                    break;
                case 'if':
                    $result = $webhookController->testIfNode($config, $inputData);
                    break;
                case 'switch':
                    $result = $webhookController->testSwitchNode($config, $inputData);
                    break;
                case 'escape':
                    $result = $webhookController->testEscapeNode($config, $inputData);
                    break;
                case 'claude':
                    $result = $webhookController->testClaudeNode($config, $inputData);
                    break;
                case 'perplexity':
                    $result = $webhookController->testPerplexityNode($config, $inputData);
                    break;
                case 'googledocs':
                    $result = $webhookController->testGoogleDocsNode($config, $inputData);
                    break;
            case 'googlesheets':
                    $result = $webhookController->testGoogleSheetsNode($config, $inputData);
                    break;
            case 'googledrivefolder':
                    $result = $webhookController->testGoogleDriveFolderNode($config, $inputData);
                    break;
            case 'gemini':
                    $result = $webhookController->testGeminiNode($config, $inputData);
                    break;
                case 'kling':
                    $result = $webhookController->testKlingNode($config, $inputData);
                    break;
                case 'convert':
                    $result = $webhookController->testConvertNode($config, $inputData);
                    break;
                case 'openai':
                    $result = $webhookController->testOpenAINode($config, $inputData);
                    break;
                default:
                    return response()->json([
                        'error' => 'Unsupported node type for testing'
                    ], 400);
            }
            
            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Test failed',
                'message' => $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * Collect all upstream nodes using BFS (for test step)
     */
    private function collectAllUpstreamNodesForTest($nodeId, $edges)
    {
        $upstream = [];
        $visited = [];
        $queue = [$nodeId];

        while (!empty($queue)) {
            $current = array_shift($queue);

            if (isset($visited[$current])) {
                continue;
            }

            $visited[$current] = true;

            // Find all nodes that point to current node
            $incomingNodes = collect($edges)
                ->filter(function ($edge) use ($current) {
                    return $edge['target'] === $current;
                })
                ->map(function ($edge) {
                    return $edge['source'];
                })
                ->filter()
                ->toArray();

            foreach ($incomingNodes as $source) {
                $upstream[] = $source;
                if (!isset($visited[$source])) {
                    $queue[] = $source;
                }
            }
        }

        return $upstream;
    }

    /**
     * Collect upstream nodes with branch filtering (respect If/Switch routing)
     * Only collect nodes from branches that have been tested (have output data)
     */
    private function collectAllUpstreamNodesForTestWithBranchFilter($nodeId, $edges, $nodes, $nodeOutputs)
    {
        $upstream = [];
        $visited = [];
        $queue = [$nodeId];
        $ifResults = [];
        $switchResults = [];

        while (!empty($queue)) {
            $current = array_shift($queue);

            if (isset($visited[$current])) {
                continue;
            }

            $visited[$current] = true;

            // Find all edges that point to current node
            $incomingEdges = collect($edges)
                ->filter(function ($edge) use ($current) {
                    return $edge['target'] === $current;
                })
                ->toArray();

            foreach ($incomingEdges as $edge) {
                $sourceId = $edge['source'];
                $sourceHandle = $edge['sourceHandle'] ?? null;
                $targetHandle = $edge['targetHandle'] ?? null;

                // Find source node
                $sourceNode = collect($nodes)->firstWhere('id', $sourceId);
                if (!$sourceNode) {
                    continue;
                }

                // Check if source node is If or Switch and filter by branch
                if ($sourceNode['type'] === 'if') {
                    // Check if If node has been tested and get result
                    if (isset($nodeOutputs[$sourceId]) && isset($nodeOutputs[$sourceId]['result'])) {
                        $ifResult = $nodeOutputs[$sourceId]['result'];
                        $ifResults[$sourceId] = $ifResult;
                        
                        // Only include if sourceHandle matches the If result
                        $expectedHandle = $ifResult ? 'true' : 'false';
                        if ($sourceHandle !== $expectedHandle) {
                            // Skip this branch
                            continue;
                        }
                    } else {
                        // If node not tested yet, skip this branch to avoid collecting wrong nodes
                        continue;
                    }
                } elseif ($sourceNode['type'] === 'switch') {
                    // Check if Switch node has been tested and get matched output
                    if (isset($nodeOutputs[$sourceId]) && isset($nodeOutputs[$sourceId]['matchedOutput'])) {
                        $matchedOutput = $nodeOutputs[$sourceId]['matchedOutput'];
                        $switchResults[$sourceId] = $matchedOutput;
                        
                        // Determine expected handle
                        $expectedHandle = $matchedOutput >= 0 ? "output{$matchedOutput}" : 'fallback';
                        if ($sourceHandle !== $expectedHandle) {
                            // Skip this branch
                            continue;
                        }
                    } else {
                        // Switch node not tested yet, skip this branch
                        continue;
                    }
                }

                // Add to upstream if it has output data (has been tested)
                // This ensures we only collect nodes from tested branches
                if (isset($nodeOutputs[$sourceId])) {
                    $upstream[] = $sourceId;
                    if (!isset($visited[$sourceId])) {
                        $queue[] = $sourceId;
                    }
                }
            }
        }

        return $upstream;
    }

    /**
     * Cleanup memories when nodes are deleted or memoryId changed
     */
    private function cleanupMemoriesOnNodeChange($workflow, $newNodes)
    {
        try {
            $memoryService = app(MemoryService::class);
            $deletedCount = 0;
            
            // Build map of old nodes from workflow_nodes table (priority) and workflow.nodes (fallback)
            $oldMemoryMap = [];
            
            // First, check workflow_nodes table (where config is actually stored)
            $workflowNodes = \App\Models\WorkflowNode::where('workflow_id', $workflow->id)->get();
            foreach ($workflowNodes as $workflowNode) {
                $config = $workflowNode->config ?? [];
                if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                    $oldMemoryMap[$workflowNode->node_id] = $config['memoryId'];
                }
            }
            
            // Fallback: also check workflow.nodes JSON (for backward compatibility)
            $oldNodes = $workflow->nodes ?? [];
            foreach ($oldNodes as $oldNode) {
                $nodeId = $oldNode['id'] ?? null;
                // Only use JSON if not already in map from workflow_nodes table
                if ($nodeId && !isset($oldMemoryMap[$nodeId])) {
                    $oldConfig = $oldNode['data']['config'] ?? [];
                    if (!empty($oldConfig['memoryEnabled']) && !empty($oldConfig['memoryId'])) {
                        $oldMemoryMap[$nodeId] = $oldConfig['memoryId'];
                    }
                }
            }
            
            // Build map of new nodes: nodeId => memoryId
            $newMemoryMap = [];
            foreach ($newNodes as $newNode) {
                $nodeId = $newNode['id'] ?? null;
                if ($nodeId) {
                    $newConfig = $newNode['data']['config'] ?? [];
                    if (!empty($newConfig['memoryEnabled']) && !empty($newConfig['memoryId'])) {
                        $newMemoryMap[$nodeId] = $newConfig['memoryId'];
                    }
                }
            }
            
            // Find memories to delete:
            // 1. Nodes that were deleted (in old but not in new)
            // 2. Nodes with memoryId changed
            foreach ($oldMemoryMap as $nodeId => $oldMemoryId) {
                $shouldDelete = false;
                
                // Check if node still exists
                $nodeStillExists = isset($newMemoryMap[$nodeId]);
                
                if (!$nodeStillExists) {
                    // Node deleted
                    $shouldDelete = true;
                    Log::info('Node deleted, cleaning memory', [
                        'workflow_id' => $workflow->id,
                        'node_id' => $nodeId,
                        'memory_id' => $oldMemoryId,
                    ]);
                } else {
                    $newMemoryId = $newMemoryMap[$nodeId];
                    if ($newMemoryId !== $oldMemoryId) {
                        // memoryId changed
                        $shouldDelete = true;
                        Log::info('MemoryId changed, cleaning old memory', [
                            'workflow_id' => $workflow->id,
                            'node_id' => $nodeId,
                            'old_memory_id' => $oldMemoryId,
                            'new_memory_id' => $newMemoryId,
                        ]);
                    }
                }
                
                if ($shouldDelete) {
                    $memoryService->deleteMemory($oldMemoryId);
                    $deletedCount++;
                }
            }
            
            if ($deletedCount > 0) {
                Log::info('Memories cleaned up on workflow update', [
                    'workflow_id' => $workflow->id,
                    'deleted_count' => $deletedCount,
                ]);
            }
        } catch (\Exception $e) {
            // Don't block update if cleanup fails
            Log::error('Failed to cleanup memories on workflow update', [
                'workflow_id' => $workflow->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

}

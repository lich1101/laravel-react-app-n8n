<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\WorkflowNode;
use App\Models\WorkflowExecution;
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
        $user = auth()->user();
        $workflows = Workflow::where('user_id', $user->id)->get();
        return response()->json($workflows);
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

        $workflow->update($updateData);

        return response()->json($workflow);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::findOrFail($id);

        // Check ownership hoặc permission
        // User role cũng được phép xóa tất cả workflows (kể cả từ folder)
        if ($workflow->user_id !== $user->id && $user->role !== 'admin' && $user->role !== 'user') {
            return response()->json([
                'error' => 'Unauthorized',
                'message' => 'Bạn không có quyền xóa workflow này'
            ], 403);
        }

        // User role giờ được phép xóa workflows từ folder
        // Bỏ check is_from_folder để user có full quyền quản lý workflows

        $workflow->delete();

        return response()->json(['message' => 'Workflow deleted successfully']);
    }

    /**
     * Save node configuration
     */
    public function saveNode(Request $request, string $id): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($id);

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
     */
    public function executions(string $id): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($id);

        $executions = $workflow->executions()
            ->orderBy('started_at', 'desc')
            ->paginate(20);

        return response()->json($executions);
    }

    /**
     * Get a single execution details
     */
    public function execution(string $workflowId, string $executionId): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($workflowId);

        $execution = $workflow->executions()->findOrFail($executionId);

        return response()->json($execution);
    }

    /**
     * Resume a failed execution from its error node
     */
    public function resumeExecution(Request $request, string $workflowId, string $executionId): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($workflowId);

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
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($workflowId);

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
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($workflowId);

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
            
            // Collect ALL upstream nodes using BFS
            $namedInputs = [];
            $allUpstreamIds = $this->collectAllUpstreamNodesForTest($nodeId, $edges);
            
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
                case 'gemini':
                    $result = $webhookController->testGeminiNode($config, $inputData);
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

}

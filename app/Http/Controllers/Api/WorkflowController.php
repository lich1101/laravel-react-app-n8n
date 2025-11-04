<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\WorkflowNode;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

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
        if ($workflow->user_id !== $user->id) {
            return response()->json([
                'error' => 'Unauthorized',
                'message' => 'Bạn không có quyền xóa workflow này'
            ], 403);
        }

        // Ngăn xóa workflows được sync từ Administrator (is_from_folder = true)
        // Chỉ admin mới được xóa workflows từ folder
        if ($workflow->is_from_folder && $user->role !== 'admin') {
            return response()->json([
                'error' => 'Cannot delete workflow from folder',
                'message' => 'Workflow này được sync từ Administrator. Bạn không thể xóa, chỉ có thể sửa. Liên hệ Admin để xóa.'
            ], 403);
        }

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

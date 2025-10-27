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
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($id);
        return response()->json($workflow);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($id);

        $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'nodes' => 'sometimes|array',
            'edges' => 'sometimes|array',
            'active' => 'sometimes|boolean',
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

        $workflow->update($updateData);

        return response()->json($workflow);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::where('user_id', $user->id)->findOrFail($id);
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
}

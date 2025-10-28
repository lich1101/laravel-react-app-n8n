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
        
        // Find workflow
        $workflow = Workflow::findOrFail($id);
        
        // Check if user has access
        if ($workflow->user_id === $user->id) {
            // User owns this workflow
            return response()->json($workflow);
        }
        
        // Check if workflow is in a folder that user has permission to
        if ($workflow->folder_id) {
            $folder = \App\Models\Folder::find($workflow->folder_id);
            if ($folder && $folder->userHasPermission($user, 'view')) {
                return response()->json($workflow);
            }
        }
        
        // User doesn't have access
        return response()->json(['error' => 'Unauthorized'], 403);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user = auth()->user();
        $workflow = Workflow::findOrFail($id);
        
        // Check if user has edit permission
        $canEdit = false;
        if ($workflow->user_id === $user->id) {
            $canEdit = true;
        } elseif ($workflow->folder_id) {
            $folder = \App\Models\Folder::find($workflow->folder_id);
            if ($folder && $folder->userHasPermission($user, 'edit')) {
                $canEdit = true;
            }
        }
        
        if (!$canEdit) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

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
}

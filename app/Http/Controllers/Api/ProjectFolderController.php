<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProjectFolderController extends Controller
{
    /**
     * Create folder in project domain
     */
    public function createFolder(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'workflows' => 'nullable|array',
        ]);

        // For now, we'll create workflows directly in this project
        // In real implementation, this would be called from the project's subdomain
        $folderData = [
            'name' => $request->name,
            'description' => $request->description,
        ];

        // Create workflows if provided
        $workflowIds = [];
        if ($request->has('workflows')) {
            foreach ($request->workflows as $workflowData) {
                $workflow = Workflow::create([
                    'user_id' => auth()->id(), // This would be the project user
                    'name' => $workflowData['name'],
                    'description' => $workflowData['description'] ?? '',
                    'nodes' => $workflowData['nodes'] ?? [],
                    'edges' => $workflowData['edges'] ?? [],
                    'active' => false,
                    'is_from_folder' => true,
                ]);
                $workflowIds[] = $workflow->id;
            }
        }

        return response()->json([
            'folder_id' => 'generated_folder_id', // This would be the folder ID in project domain
            'workflow_ids' => $workflowIds,
        ], 201);
    }

    /**
     * Update folder in project domain
     */
    public function updateFolder(Request $request, string $folderId): JsonResponse
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'workflows' => 'sometimes|array',
        ]);

        // Update workflows
        if ($request->has('workflows')) {
            foreach ($request->workflows as $workflowData) {
                if (isset($workflowData['id'])) {
                    // Update existing workflow
                    $workflow = Workflow::find($workflowData['id']);
                    if ($workflow) {
                        $workflow->update([
                            'name' => $workflowData['name'],
                            'description' => $workflowData['description'] ?? '',
                            'nodes' => $workflowData['nodes'] ?? [],
                            'edges' => $workflowData['edges'] ?? [],
                        ]);
                    }
                } else {
                    // Create new workflow
                    Workflow::create([
                        'user_id' => auth()->id(),
                        'name' => $workflowData['name'],
                        'description' => $workflowData['description'] ?? '',
                        'nodes' => $workflowData['nodes'] ?? [],
                        'edges' => $workflowData['edges'] ?? [],
                        'active' => false,
                        'is_from_folder' => true,
                    ]);
                }
            }
        }

        return response()->json(['message' => 'Folder updated successfully']);
    }

    /**
     * Delete folder in project domain
     */
    public function deleteFolder(string $folderId): JsonResponse
    {
        // Delete all workflows in this folder
        Workflow::where('is_from_folder', true)
            ->where('user_id', auth()->id())
            ->delete();

        return response()->json(['message' => 'Folder deleted successfully']);
    }
}

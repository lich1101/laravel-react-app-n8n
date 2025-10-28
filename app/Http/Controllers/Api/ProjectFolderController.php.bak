<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\Folder;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProjectFolderController extends Controller
{
    /**
     * Get folders for the authenticated user
     */
    public function getFolders(): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $folders = Folder::where('created_by', $user->id)
            ->with(['workflows' => function($query) use ($user) {
                $query->where('user_id', $user->id);
            }])
            ->get();

        return response()->json($folders);
    }

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

        // Get authenticated user (from API token)
        $user = auth()->user();
        if (!$user) {
            return response()->json([
                'error' => 'Unauthenticated'
            ], 401);
        }

        \Log::info("Creating folder '{$request->name}' from Administrator App for user: {$user->email}");

        // Create the folder first
        $folder = Folder::create([
            'name' => $request->name,
            'description' => $request->description,
            'created_by' => $user->id,
        ]);

        \Log::info("Created folder '{$folder->name}' with ID: {$folder->id}");

        // Create workflows if provided and attach to folder
        $workflowIds = [];
        if ($request->has('workflows')) {
            foreach ($request->workflows as $workflowData) {
                $workflow = Workflow::create([
                    'user_id' => $user->id,
                    'name' => $workflowData['name'],
                    'description' => $workflowData['description'] ?? '',
                    'nodes' => $workflowData['nodes'] ?? [],
                    'edges' => $workflowData['edges'] ?? [],
                    'active' => false,
                    'folder_id' => $folder->id,
                    'is_from_folder' => true,
                ]);
                $workflowIds[] = $workflow->id;
                \Log::info("Created workflow '{$workflow->name}' with ID: {$workflow->id} in folder: {$folder->id}");
            }
        }

        return response()->json([
            'success' => true,
            'folder_id' => $folder->id,
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

        // Get authenticated user
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Find the folder
        $folder = Folder::find($folderId);
        if (!$folder) {
            return response()->json(['error' => 'Folder not found'], 404);
        }

        \Log::info("Updating folder '{$folder->name}' (ID: {$folderId}) for user: {$user->email}");

        // Update folder details
        if ($request->has('name')) {
            $folder->name = $request->name;
        }
        if ($request->has('description')) {
            $folder->description = $request->description;
        }
        $folder->save();

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
                        \Log::info("Updated workflow '{$workflow->name}' with ID: {$workflow->id}");
                    }
                } else {
                    // Create new workflow
                    $workflow = Workflow::create([
                        'user_id' => $user->id,
                        'name' => $workflowData['name'],
                        'description' => $workflowData['description'] ?? '',
                        'nodes' => $workflowData['nodes'] ?? [],
                        'edges' => $workflowData['edges'] ?? [],
                        'active' => false,
                        'folder_id' => $folder->id,
                        'is_from_folder' => true,
                    ]);
                    \Log::info("Created new workflow '{$workflow->name}' with ID: {$workflow->id} in folder: {$folder->id}");
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
        // Get authenticated user
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Find the folder
        $folder = Folder::find($folderId);
        if (!$folder) {
            return response()->json(['error' => 'Folder not found'], 404);
        }

        \Log::info("Deleting folder '{$folder->name}' (ID: {$folderId}) for user: {$user->email}");

        // Delete all workflows in this folder
        Workflow::where('folder_id', $folderId)
            ->where('user_id', $user->id)
            ->delete();

        // Delete the folder
        $folder->delete();

        return response()->json(['message' => 'Folder deleted successfully']);
    }
}

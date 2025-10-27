<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\Folder;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProjectFolderController extends Controller
{
    /**
     * Get folders for the authenticated user
     * Returns:
     * - Folders created by user (if user is admin/creator)
     * - Folders user has been granted permission to access
     */
    public function getFolders(): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Get folders based on role and permissions
        if ($user->role === 'admin') {
            // Admin sees all folders they created
            $folders = Folder::where('created_by', $user->id)
                ->with(['directWorkflows', 'permissions.user', 'creator'])
                ->get();
        } else {
            // Regular users see:
            // 1. Folders they created
            // 2. Folders they have permission to access
            $folderIds = \App\Models\FolderUserPermission::where('user_id', $user->id)
                ->pluck('folder_id')
                ->toArray();
            
            $folders = Folder::where(function($query) use ($user, $folderIds) {
                $query->where('created_by', $user->id)
                      ->orWhereIn('id', $folderIds);
            })
            ->with(['directWorkflows', 'permissions' => function($query) use ($user) {
                $query->where('user_id', $user->id);
            }, 'creator'])
            ->get();
        }

        // Map directWorkflows to workflows and add permission info
        $folders->each(function($folder) use ($user) {
            $folder->workflows = $folder->directWorkflows ?? [];
            
            // Add user's permission level for this folder
            if ($user->id === $folder->created_by || $user->role === 'admin') {
                $folder->user_permission = 'edit'; // Creator/admin has full access
                $folder->can_delete = true;
            } else {
                $permission = $folder->permissions->first();
                $folder->user_permission = $permission ? $permission->permission : 'none';
                $folder->can_delete = false; // Users with granted permission cannot delete
            }
            
            unset($folder->directWorkflows);
        });

        return response()->json($folders);
    }

    /**
     * Create folder in project domain
     * Called from Administrator app with X-Admin-Key
     */
    public function createFolder(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'workflows' => 'nullable|array',
            'admin_user_email' => 'sometimes|email',
        ]);

        // Get or create admin user for this project
        $adminEmail = $request->admin_user_email ?? 'admin.user@chatplus.vn';
        $user = User::firstOrCreate(
            ['email' => $adminEmail],
            [
                'name' => 'Admin User',
                'password' => bcrypt('admin123'),
                'role' => 'admin'
            ]
        );

        \Log::info("Creating folder '{$request->name}' from Administrator App for admin user: {$user->email}");

        // Create the folder
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
     * Called from Administrator app with X-Admin-Key
     */
    public function updateFolder(Request $request, string $folderId): JsonResponse
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'workflows' => 'sometimes|array',
            'admin_user_email' => 'sometimes|email',
        ]);

        // Find the folder
        $folder = Folder::find($folderId);
        if (!$folder) {
            return response()->json(['error' => 'Folder not found'], 404);
        }

        // Get admin user
        $adminEmail = $request->admin_user_email ?? 'admin.user@chatplus.vn';
        $user = User::where('email', $adminEmail)->first();
        
        if (!$user) {
            return response()->json(['error' => 'Admin user not found'], 404);
        }

        \Log::info("Updating folder '{$folder->name}' (ID: {$folderId}) from Administrator App");

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

        return response()->json([
            'success' => true,
            'message' => 'Folder updated successfully'
        ]);
    }

    /**
     * Delete folder in project domain
     * Called from Administrator app with X-Admin-Key
     */
    public function deleteFolder(string $folderId): JsonResponse
    {
        // Find the folder
        $folder = Folder::find($folderId);
        if (!$folder) {
            return response()->json(['error' => 'Folder not found'], 404);
        }

        \Log::info("Deleting folder '{$folder->name}' (ID: {$folderId}) from Administrator App");

        // Delete all workflows in this folder
        Workflow::where('folder_id', $folderId)
            ->where('is_from_folder', true)
            ->delete();

        // Delete the folder
        $folder->delete();

        return response()->json([
            'success' => true,
            'message' => 'Folder deleted successfully'
        ]);
    }
}

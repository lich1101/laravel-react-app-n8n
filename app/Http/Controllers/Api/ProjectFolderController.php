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
     * Returns all folders - all users can view and edit all folders
     */
    public function getFolders(): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Get all folders with their workflows
        $folders = Folder::with(['directWorkflows', 'creator'])->get();

        // Map directWorkflows to workflows and set permissions
        $folders->each(function($folder) use ($user) {
            $folder->workflows = $folder->directWorkflows ?? [];
            
            // All users have edit permission on all folders
            $folder->user_permission = 'edit';
            // All users (including 'user' role) can delete folders
            $folder->can_delete = true;
            
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
                $workflow = null;
                
                // Try to find workflow by ID first
                if (isset($workflowData['id']) && $workflowData['id']) {
                    $workflow = Workflow::find($workflowData['id']);
                }
                
                // If not found by ID, try to find by name + folder_id
                if (!$workflow) {
                    $workflow = Workflow::where('folder_id', $folder->id)
                        ->where('name', $workflowData['name'])
                        ->where('is_from_folder', true)
                        ->first();
                }
                
                if ($workflow) {
                    // Update existing workflow
                    $workflow->update([
                        'name' => $workflowData['name'],
                        'description' => $workflowData['description'] ?? '',
                        'nodes' => $workflowData['nodes'] ?? [],
                        'edges' => $workflowData['edges'] ?? [],
                    ]);
                    \Log::info("Updated workflow '{$workflow->name}' with ID: {$workflow->id}");
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

    /**
     * Update folder by regular user (not from Administrator)
     * User can rename folder and modify workflows
     */
    public function userUpdateFolder(Request $request, string $folderId): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $folder = Folder::find($folderId);
        if (!$folder) {
            return response()->json(['error' => 'Folder not found'], 404);
        }

        $request->validate([
            'name' => 'nullable|string|max:255',
            'description' => 'nullable|string',
        ]);

        // User can update folder name and description
        if ($request->has('name')) {
            $folder->name = $request->name;
        }
        if ($request->has('description')) {
            $folder->description = $request->description;
        }

        $folder->save();

        \Log::info("User '{$user->email}' updated folder '{$folder->name}' (ID: {$folderId})");

        return response()->json([
            'success' => true,
            'message' => 'Folder updated successfully',
            'folder' => $folder
        ]);
    }

    /**
     * Create folder by regular user
     */
    public function userCreateFolder(Request $request): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'workflows' => 'nullable|array',
            'workflows.*' => 'exists:workflows,id',
        ]);

        $folder = Folder::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? '',
            'created_by' => $user->id,
        ]);

        if (!empty($validated['workflows'])) {
            Workflow::whereIn('id', $validated['workflows'])->update([
                'folder_id' => $folder->id,
            ]);
        }

        $folder->load(['directWorkflows', 'creator']);
        $folder->workflows = $folder->directWorkflows ?? [];
        unset($folder->directWorkflows);

        // Align permissions with frontend expectations
        $folder->user_permission = 'edit';
        $folder->can_delete = true;

        \Log::info("User '{$user->email}' created folder '{$folder->name}' (ID: {$folder->id})");

        return response()->json([
            'success' => true,
            'folder' => $folder,
        ], 201);
    }

    /**
     * Delete folder by regular user (not from Administrator)
     * User can delete any folder they have access to
     */
    public function userDeleteFolder(string $folderId): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $folder = Folder::find($folderId);
        if (!$folder) {
            return response()->json(['error' => 'Folder not found'], 404);
        }

        \Log::info("User '{$user->email}' deleting folder '{$folder->name}' (ID: {$folderId})");

        // Delete all workflows in this folder first
        $deletedWorkflows = Workflow::where('folder_id', $folderId)->delete();
        
        \Log::info("Deleted {$deletedWorkflows} workflows from folder '{$folder->name}'");

        // Delete the folder
        $folder->delete();

        return response()->json([
            'success' => true,
            'message' => 'Folder and all workflows deleted successfully'
        ]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Folder;
use App\Models\Workflow;
use App\Models\Project;
use App\Models\FolderProjectMapping;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\JsonResponse;

class FolderController extends Controller
{
    private function checkAdministrator()
    {
        $user = auth()->user();
        if (!$user || !in_array($user->role, ['administrator', 'admin'])) {
            throw new \Illuminate\Auth\Access\AuthorizationException('Unauthorized. Administrator access required.');
        }
    }

    /**
     * Display a listing of folders
     */
    public function index(): JsonResponse
    {
        $this->checkAdministrator();
        // Use directWorkflows instead of workflows (Many-to-Many)
        // to match with drag-drop behavior that updates folder_id
        $folders = Folder::with(['creator', 'directWorkflows', 'projects'])->get();
        
        // Map directWorkflows to workflows for frontend compatibility
        $folders->each(function($folder) {
            $folder->workflows = $folder->directWorkflows;
            unset($folder->directWorkflows);
        });
        
        return response()->json($folders);
    }

    /**
     * Store a newly created folder
     */
    public function store(Request $request): JsonResponse
    {
        $this->checkAdministrator();
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'workflows' => 'nullable|array',
            'workflows.*' => 'exists:workflows,id',
        ]);

        $user = auth()->user();

        $folder = Folder::create([
            'name' => $request->name,
            'description' => $request->description,
            'created_by' => $user->id,
        ]);

        // Attach workflows if provided
        if ($request->has('workflows') && is_array($request->workflows)) {
            // Update workflows to belong to this folder (set folder_id)
            if (!empty($request->workflows)) {
                Workflow::whereIn('id', $request->workflows)->update(['folder_id' => $folder->id]);
            }
        }

        $folder->load(['creator', 'directWorkflows', 'projects']);
        
        // Map directWorkflows to workflows for frontend compatibility
        $folder->workflows = $folder->directWorkflows;
        unset($folder->directWorkflows);
        
        return response()->json($folder, 201);
    }

    /**
     * Display the specified folder
     */
    public function show(string $id): JsonResponse
    {
        $this->checkAdministrator();
        // Use directWorkflows instead of workflows (Many-to-Many)
        // to match with drag-drop behavior that updates folder_id
        $folder = Folder::with(['creator', 'directWorkflows', 'projects'])->findOrFail($id);
        
        // Map directWorkflows to workflows for frontend compatibility
        $folder->workflows = $folder->directWorkflows;
        unset($folder->directWorkflows);
        
        return response()->json($folder);
    }

    /**
     * Update the specified folder
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'workflows' => 'nullable|array',
            'workflows.*' => 'exists:workflows,id',
        ]);

        $folder->update([
            'name' => $request->name,
            'description' => $request->description,
        ]);

        // Update workflows if provided
        if ($request->has('workflows')) {
            // Remove old workflows from this folder (set folder_id to null)
            Workflow::where('folder_id', $folder->id)->update(['folder_id' => null]);
            
            // Add new workflows to this folder (set folder_id)
            if (!empty($request->workflows)) {
                Workflow::whereIn('id', $request->workflows)->update(['folder_id' => $folder->id]);
            }
        }

        // Sync workflows to all projects using this folder
        $this->syncFolderToProjects($folder);

        $folder->load(['creator', 'directWorkflows', 'projects']);
        
        // Map directWorkflows to workflows for frontend compatibility
        $folder->workflows = $folder->directWorkflows;
        unset($folder->directWorkflows);
        
        return response()->json($folder);
    }

    /**
     * Remove the specified folder
     */
    public function destroy(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::findOrFail($id);
        $folder->delete();

        return response()->json(['message' => 'Folder deleted successfully']);
    }

    /**
     * Sync folder updates to all projects using this folder
     */
    private function syncFolderToProjects(Folder $folder)
    {
        // Ensure directWorkflows are loaded
        $folder->loadMissing('directWorkflows', 'projects');
        
        $projects = $folder->projects;

        foreach ($projects as $project) {
            try {
                $projectDomain = $project->domain ?: $project->subdomain;

                // Skip localhost to prevent infinite loop
                if (str_contains($projectDomain, '127.0.0.1') || str_contains($projectDomain, 'localhost')) {
                    \Log::info("Skipping localhost project domain: {$projectDomain}");
                    continue;
                }

                \Log::info("Syncing folder '{$folder->name}' to project '{$project->name}' (Domain: {$projectDomain})");

                // Check if mapping exists
                $mapping = FolderProjectMapping::where('admin_folder_id', $folder->id)
                    ->where('project_id', $project->id)
                    ->first();

                if (!$mapping) {
                    // First time sync - create folder in project domain
                    $this->createFolderInProject($folder, $project);
                } else {
                    // Update existing folder in project domain
                    $this->updateFolderInProject($folder, $project, $mapping);
                }
            } catch (\Exception $e) {
                \Log::error("Error syncing folder '{$folder->name}' to project '{$project->name}': " . $e->getMessage());
                // Continue with other projects even if one fails
                continue;
            }
        }
    }

    private function createFolderInProject(Folder $folder, Project $project)
    {
        $projectDomain = $project->domain ?: $project->subdomain;
        // Add https:// if not present
        if (!str_starts_with($projectDomain, 'http')) {
            $projectDomain = 'https://' . $projectDomain;
        }
        $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders';

        \Log::info("Creating folder in project domain: {$apiUrl}");

        // Use directWorkflows to get workflows by folder_id
        $workflowsData = $folder->directWorkflows->map(function ($workflow) {
            return [
                'name' => $workflow->name,
                'description' => $workflow->description,
                'nodes' => $workflow->nodes,
                'edges' => $workflow->edges,
            ];
        })->toArray();

        try {
            // Use APP_KEY from project domain for authentication
            $adminKey = env('USER_APP_ADMIN_KEY', 'base64:nwdDyfV4pwpxIJGIW1ktTkyG26tTrKsKbCugHkgdFOw=');
            
            $response = Http::timeout(30)
                ->withHeaders([
                    'X-Admin-Key' => $adminKey,
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])
                ->post($apiUrl, [
                    'name' => $folder->name,
                    'description' => $folder->description,
                    'workflows' => $workflowsData,
                    'admin_user_email' => 'admin.user@chatplus.vn',
                ]);

            if ($response->successful()) {
                $data = $response->json();
                \Log::info("Response from project domain: " . json_encode($data));

                // Create mapping
                FolderProjectMapping::create([
                    'admin_folder_id' => $folder->id,
                    'project_id' => $project->id,
                    'project_folder_id' => $data['folder_id'] ?? $data['id'] ?? null,
                    'workflow_mappings' => array_combine(
                        $folder->directWorkflows->pluck('id')->toArray(),
                        $data['workflow_ids'] ?? []
                    ),
                ]);

                \Log::info("Successfully created folder in project domain: {$projectDomain}");
            } else {
                $errorMsg = "Failed to create folder in project domain: {$projectDomain}. Status: {$response->status()}, Response: " . $response->body();
                \Log::error($errorMsg);
                throw new \Exception($errorMsg);
            }
        } catch (\Exception $e) {
            $errorMsg = "Error creating folder in project domain {$projectDomain}: " . $e->getMessage();
            \Log::error($errorMsg);
            throw new \Exception($errorMsg);
        }
    }

    private function updateFolderInProject(Folder $folder, Project $project, FolderProjectMapping $mapping)
    {
        $projectDomain = $project->domain ?: $project->subdomain;
        // Add https:// if not present
        if (!str_starts_with($projectDomain, 'http')) {
            $projectDomain = 'https://' . $projectDomain;
        }
        $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders/' . $mapping->project_folder_id;

        \Log::info("Updating folder in project domain: {$apiUrl}");

        // Use directWorkflows to get workflows by folder_id
        $workflowsData = $folder->directWorkflows->map(function ($workflow) use ($mapping) {
            $projectWorkflowId = $mapping->workflow_mappings[$workflow->id] ?? null;

            return [
                'id' => $projectWorkflowId,
                'name' => $workflow->name,
                'description' => $workflow->description,
                'nodes' => $workflow->nodes,
                'edges' => $workflow->edges,
            ];
        })->toArray();

        try {
            // Use APP_KEY from project domain for authentication
            $adminKey = env('USER_APP_ADMIN_KEY', 'base64:nwdDyfV4pwpxIJGIW1ktTkyG26tTrKsKbCugHkgdFOw=');
            
            $response = Http::timeout(30)
                ->withHeaders([
                    'X-Admin-Key' => $adminKey,
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])
                ->put($apiUrl, [
                    'name' => $folder->name,
                    'description' => $folder->description,
                    'workflows' => $workflowsData,
                    'admin_user_email' => 'admin.user@chatplus.vn',
                ]);

            if ($response->successful()) {
                \Log::info("Successfully updated folder in project domain: {$projectDomain}");
            } else if ($response->status() === 404) {
                // Folder not found - it was deleted, recreate it
                \Log::warning("Folder not found (404), deleting old mapping and recreating folder");
                $mapping->delete();
                
                // Recreate the folder
                $this->createFolderInProject($folder, $project);
                \Log::info("Successfully recreated folder after 404 error");
            } else {
                $errorMsg = "Failed to update folder in project domain: {$projectDomain}. Status: {$response->status()}, Response: " . $response->body();
                \Log::error($errorMsg);
                throw new \Exception($errorMsg);
            }
        } catch (\Exception $e) {
            $errorMsg = "Error updating folder in project domain {$projectDomain}: " . $e->getMessage();
            \Log::error($errorMsg);
            throw new \Exception($errorMsg);
        }
    }

    /**
     * Add workflows to a folder
     */
    public function addWorkflows(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::findOrFail($id);

        $request->validate([
            'workflow_ids' => 'required|array',
            'workflow_ids.*' => 'exists:workflows,id',
        ]);

        // Update workflows to belong to this folder (set folder_id)
        Workflow::whereIn('id', $request->workflow_ids)->update(['folder_id' => $folder->id]);

        $folder->load(['creator', 'directWorkflows', 'projects']);
        
        // Map directWorkflows to workflows for frontend compatibility
        $folder->workflows = $folder->directWorkflows;
        unset($folder->directWorkflows);
        
        return response()->json($folder);
    }

    /**
     * Remove workflows from a folder
     */
    public function removeWorkflows(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::findOrFail($id);

        $request->validate([
            'workflow_ids' => 'required|array',
            'workflow_ids.*' => 'exists:workflows,id',
        ]);

        // Remove workflows from this folder (set folder_id to null)
        Workflow::whereIn('id', $request->workflow_ids)
            ->where('folder_id', $folder->id)
            ->update(['folder_id' => null]);

        $folder->load(['creator', 'directWorkflows', 'projects']);
        
        // Map directWorkflows to workflows for frontend compatibility
        $folder->workflows = $folder->directWorkflows;
        unset($folder->directWorkflows);
        
        return response()->json($folder);
    }

    /**
     * Assign folder to projects
     */
    public function assignToProjects(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::findOrFail($id);

        $request->validate([
            'project_ids' => 'required|array',
            'project_ids.*' => 'exists:projects,id',
        ]);

        try {
            // First, sync the folder-project relationship
            $folder->projects()->sync($request->project_ids);

            $folder->load(['creator', 'directWorkflows', 'projects']);
            
            // Map directWorkflows to workflows for frontend compatibility
            $folder->workflows = $folder->directWorkflows;
            unset($folder->directWorkflows);

            // Return success immediately, sync can be done manually later
            return response()->json([
                'message' => 'Folder assigned to projects successfully',
                'folder' => $folder
            ]);

        } catch (\Exception $e) {
            \Log::error("Error assigning folder to projects: " . $e->getMessage());
            return response()->json([
                'message' => 'Error assigning folder to projects',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Manually sync a folder to all assigned projects
     */
    public function syncFolder(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::findOrFail($id);

        try {
            $folder->load(['creator', 'directWorkflows', 'projects']);
            
            // Map directWorkflows to workflows for frontend compatibility
            $folder->workflows = $folder->directWorkflows;
            unset($folder->directWorkflows);

            // Check if folder has any projects assigned
            if ($folder->projects->isEmpty()) {
                return response()->json([
                    'message' => 'No projects assigned to this folder',
                    'folder' => $folder
                ]);
            }

            $syncResults = [];
            $errors = [];

            // Try to sync to each project individually
            foreach ($folder->projects as $project) {
                try {
                    $projectDomain = $project->domain ?: $project->subdomain;

                    // Skip localhost
                    if (str_contains($projectDomain, '127.0.0.1') || str_contains($projectDomain, 'localhost')) {
                        $syncResults[] = [
                            'project' => $project->name,
                            'status' => 'skipped',
                            'reason' => 'localhost domain'
                        ];
                        continue;
                    }

                    \Log::info("Attempting to sync folder '{$folder->name}' to project '{$project->name}' (Domain: {$projectDomain})");

                    // Check if mapping exists
                    $mapping = FolderProjectMapping::where('admin_folder_id', $folder->id)
                        ->where('project_id', $project->id)
                        ->first();

                    if (!$mapping) {
                        $this->createFolderInProject($folder, $project);
                        $syncResults[] = [
                            'project' => $project->name,
                            'status' => 'created',
                            'domain' => $projectDomain
                        ];
                    } else {
                        $this->updateFolderInProject($folder, $project, $mapping);
                        $syncResults[] = [
                            'project' => $project->name,
                            'status' => 'updated',
                            'domain' => $projectDomain
                        ];
                    }

                } catch (\Exception $e) {
                    $errorMsg = "Error syncing to project '{$project->name}': " . $e->getMessage();
                    \Log::error($errorMsg);
                    $errors[] = $errorMsg;
                    $syncResults[] = [
                        'project' => $project->name,
                        'status' => 'failed',
                        'error' => $e->getMessage()
                    ];
                }
            }

            return response()->json([
                'message' => 'Folder sync completed',
                'folder' => $folder,
                'sync_results' => $syncResults,
                'errors' => $errors
            ]);

        } catch (\Exception $e) {
            \Log::error("Error in syncFolder: " . $e->getMessage());
            return response()->json([
                'message' => 'Error syncing folder',
                'error' => $e->getMessage()
            ], 500);
        }
    }

}

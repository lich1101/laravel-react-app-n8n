<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Folder;
use App\Models\FolderProjectMapping;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

class ProjectController extends Controller
{
    private function checkAdministrator()
    {
        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Unauthorized. Administrator access required.');
        }
    }

    /**
     * Display a listing of projects
     */
    public function index(): JsonResponse
    {
        $this->checkAdministrator();
        $projects = Project::with(['users', 'folders'])->get();
        return response()->json($projects);
    }

    /**
     * Store a newly created project
     */
    public function store(Request $request): JsonResponse
    {
        $this->checkAdministrator();
        $request->validate([
            'name' => 'required|string|max:255',
            'subdomain' => 'required|string|max:255|unique:projects',
            'domain' => 'nullable|string|max:255',
            'status' => 'nullable|in:active,inactive',
            'max_concurrent_workflows' => 'nullable|integer|min:1|max:100',
            'folder_ids' => 'nullable|array',
            'folder_ids.*' => 'exists:folders,id',
        ]);

        $project = Project::create([
            'name' => $request->name,
            'subdomain' => $request->subdomain,
            'domain' => $request->domain,
            'status' => $request->status ?? 'active',
            'max_concurrent_workflows' => $request->max_concurrent_workflows ?? 5,
        ]);

        // Attach folders if provided
        if ($request->has('folder_ids')) {
            $project->folders()->sync($request->folder_ids);
        }

        // Don't auto-sync - user will manually click Sync button when needed

        $project->load(['users', 'folders']);
        return response()->json($project, 201);
    }

    /**
     * Display the specified project
     */
    public function show(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::with(['users', 'folders'])->findOrFail($id);
        return response()->json($project);
    }

    /**
     * Update the specified project
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'subdomain' => 'required|string|max:255|unique:projects,subdomain,' . $id,
            'domain' => 'nullable|string|max:255',
            'status' => 'nullable|in:active,inactive',
            'max_concurrent_workflows' => 'nullable|integer|min:1|max:100',
            'folder_ids' => 'nullable|array',
            'folder_ids.*' => 'exists:folders,id',
        ]);

        $project->update([
            'name' => $request->name,
            'subdomain' => $request->subdomain,
            'domain' => $request->domain,
            'status' => $request->status,
            'max_concurrent_workflows' => $request->max_concurrent_workflows ?? $project->max_concurrent_workflows,
        ]);

        // Sync folders if provided
        if ($request->has('folder_ids')) {
            $project->folders()->sync($request->folder_ids);
        }

        // Don't auto-sync - user will manually click Sync button when needed

        $project->load(['users', 'folders']);
        return response()->json($project);
    }

    /**
     * Remove the specified project
     */
    public function destroy(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::findOrFail($id);
        $project->delete();

        return response()->json(['message' => 'Project deleted successfully']);
    }

    /**
     * Sync project configuration and folders to project domain
     */
    public function sync(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::with('folders')->findOrFail($id);
        
        $result = $this->syncProject($project);
        
        return response()->json($result);
    }

    /**
     * Internal method to sync project config and folders
     */
    private function syncProject(Project $project): array
    {
        $results = [
            'config_synced' => false,
            'folders_synced' => false,
            'errors' => [],
        ];

        try {
            // 1. Sync max_concurrent_workflows config
            $projectDomain = $project->domain ?: $project->subdomain;
            $projectDomain = rtrim($projectDomain, '/');
            // Add https:// if not present
            if (!preg_match('/^https?:\/\//', $projectDomain)) {
                $projectDomain = 'https://' . $projectDomain;
            }
            $configUrl = $projectDomain . '/api/project-config/sync';
            
            \Log::info("Syncing config to project '{$project->name}' at URL: {$configUrl}", [
                'max_concurrent_workflows' => $project->max_concurrent_workflows,
                'project_id' => $project->id,
            ]);
            
            $configResponse = Http::timeout(30)
                ->withHeaders([
                    'X-Admin-Key' => config('app.user_app_admin_key'),
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])->post($configUrl, [
                    'max_concurrent_workflows' => $project->max_concurrent_workflows,
                    'project_id' => $project->id,
                    'project_name' => $project->name,
                ]);

            $results['config_synced'] = $configResponse->successful();
            if ($configResponse->successful()) {
                \Log::info("Config sync successful for project '{$project->name}'", $configResponse->json());
            } else {
                $errorMsg = 'Config sync failed: ' . $configResponse->status() . ' - ' . $configResponse->body();
                \Log::error($errorMsg);
                $results['errors'][] = $errorMsg;
            }

        } catch (\Exception $e) {
            $errorMsg = 'Config sync error: ' . $e->getMessage();
            \Log::error($errorMsg);
            $results['errors'][] = $errorMsg;
        }

        try {
            // 2. Sync folders (CREATE or UPDATE, not DELETE all)
            $syncedCount = 0;
            $failedCount = 0;

            foreach ($project->folders as $folder) {
                try {
                    // Load directWorkflows for this folder
                    $folder->loadMissing('directWorkflows');

                    // Check if mapping exists
                    $mapping = FolderProjectMapping::where('admin_folder_id', $folder->id)
                        ->where('project_id', $project->id)
                        ->first();

                    if (!$mapping) {
                        // First time sync - create folder in project domain
                        \Log::info("Creating folder '{$folder->name}' in project '{$project->name}'");
                        $this->createFolderInProject($folder, $project);
                        $syncedCount++;
                    } else {
                        // Update existing folder in project domain
                        \Log::info("Updating folder '{$folder->name}' in project '{$project->name}'");
                        $this->updateFolderInProject($folder, $project, $mapping);
                        $syncedCount++;
                    }
                } catch (\Exception $e) {
                    \Log::error("Error syncing folder '{$folder->name}': " . $e->getMessage());
                    $results['errors'][] = "Folder '{$folder->name}': " . $e->getMessage();
                    $failedCount++;
                }
            }

            $results['folders_synced'] = $failedCount === 0;
            $results['folders_synced_count'] = $syncedCount;
            $results['folders_failed_count'] = $failedCount;

        } catch (\Exception $e) {
            $results['errors'][] = 'Folder sync error: ' . $e->getMessage();
        }

        return $results;
    }

    /**
     * Create a new folder in the project domain (first time sync)
     */
    private function createFolderInProject(Folder $folder, Project $project)
    {
        $projectDomain = $project->domain ?: $project->subdomain;
        // Add https:// if not present
        if (!preg_match('/^https?:\/\//', $projectDomain)) {
            $projectDomain = 'https://' . $projectDomain;
        }
        $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders';

        \Log::info("Creating folder '{$folder->name}' in project domain: {$apiUrl}");

        // Prepare workflows data
        $workflowsData = $folder->directWorkflows->map(function ($workflow) {
            return [
                'name' => $workflow->name,
                'description' => $workflow->description,
                'nodes' => $workflow->nodes,
                'edges' => $workflow->edges,
                'active' => $workflow->active,
            ];
        })->toArray();

        $response = Http::timeout(30)
            ->withHeaders([
                'X-Admin-Key' => config('app.user_app_admin_key'),
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ])
            ->post($apiUrl, [
                'id' => $folder->id,
                'name' => $folder->name,
                'description' => $folder->description,
                'workflows' => $workflowsData,
                'admin_user_email' => 'admin.user@chatplus.vn',
            ]);

        if ($response->successful()) {
            $data = $response->json();
            \Log::info("Successfully created folder in project domain", $data);

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
        } else {
            $errorMsg = "Failed to create folder. Status: {$response->status()}, Response: " . $response->body();
            \Log::error($errorMsg);
            throw new \Exception($errorMsg);
        }
    }

    /**
     * Update an existing folder in the project domain
     */
    private function updateFolderInProject(Folder $folder, Project $project, FolderProjectMapping $mapping)
    {
        $projectDomain = $project->domain ?: $project->subdomain;
        // Add https:// if not present
        if (!preg_match('/^https?:\/\//', $projectDomain)) {
            $projectDomain = 'https://' . $projectDomain;
        }
        $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders/' . $mapping->project_folder_id;

        \Log::info("Updating folder '{$folder->name}' in project domain: {$apiUrl}");

        // Prepare workflows data with mapped IDs
        $workflowsData = $folder->directWorkflows->map(function ($workflow) use ($mapping) {
            $projectWorkflowId = $mapping->workflow_mappings[$workflow->id] ?? null;

            return [
                'id' => $projectWorkflowId,
                'name' => $workflow->name,
                'description' => $workflow->description,
                'nodes' => $workflow->nodes,
                'edges' => $workflow->edges,
                'active' => $workflow->active,
            ];
        })->toArray();

        $response = Http::timeout(30)
            ->withHeaders([
                'X-Admin-Key' => config('app.user_app_admin_key'),
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
            \Log::info("Successfully updated folder in project domain");
        } else if ($response->status() === 404) {
            // Folder not found - it was deleted, recreate it
            \Log::warning("Folder not found (404), deleting old mapping and recreating folder");
            $mapping->delete();
            
            // Recreate the folder
            $this->createFolderInProject($folder, $project);
            \Log::info("Successfully recreated folder after 404 error");
        } else {
            $errorMsg = "Failed to update folder. Status: {$response->status()}, Response: " . $response->body();
            \Log::error($errorMsg);
            throw new \Exception($errorMsg);
        }
    }
}

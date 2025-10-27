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
        if (!$user || $user->role !== 'administrator') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Unauthorized. Administrator access required.');
        }
    }

    /**
     * Display a listing of folders
     */
    public function index(): JsonResponse
    {
        $this->checkAdministrator();
        $folders = Folder::with(['creator', 'workflows', 'projects'])->get();
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
            foreach ($request->workflows as $index => $workflowId) {
                $folder->workflows()->attach($workflowId, ['order' => $index]);
            }
        }

        $folder->load(['creator', 'workflows', 'projects']);
        return response()->json($folder, 201);
    }

    /**
     * Display the specified folder
     */
    public function show(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::with(['creator', 'workflows', 'projects'])->findOrFail($id);
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
            $folder->workflows()->detach();
            foreach ($request->workflows as $index => $workflowId) {
                $folder->workflows()->attach($workflowId, ['order' => $index]);
            }
        }

        // Sync workflows to all projects using this folder
        $this->syncFolderToProjects($folder);

        $folder->load(['creator', 'workflows', 'projects']);
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
        $projects = $folder->projects;

        foreach ($projects as $project) {
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
        }
    }

    private function createFolderInProject(Folder $folder, Project $project)
    {
        try {
            $projectDomain = $project->domain ?: $project->subdomain;
            $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders';

            $workflowsData = $folder->workflows->map(function ($workflow) {
                return [
                    'name' => $workflow->name,
                    'description' => $workflow->description,
                    'nodes' => $workflow->nodes,
                    'edges' => $workflow->edges,
                ];
            })->toArray();

            $response = Http::post($apiUrl, [
                'name' => $folder->name,
                'description' => $folder->description,
                'workflows' => $workflowsData,
            ]);

            if ($response->successful()) {
                $data = $response->json();

                // Create mapping
                FolderProjectMapping::create([
                    'admin_folder_id' => $folder->id,
                    'project_id' => $project->id,
                    'project_folder_id' => $data['folder_id'],
                    'workflow_mappings' => array_combine(
                        $folder->workflows->pluck('id')->toArray(),
                        $data['workflow_ids']
                    ),
                ]);

                \Log::info("Created folder in project domain: {$projectDomain}");
            } else {
                \Log::error("Failed to create folder in project domain: {$projectDomain}. Response: " . $response->body());
            }
        } catch (\Exception $e) {
            \Log::error("Error creating folder in project domain: " . $e->getMessage());
        }
    }

    private function updateFolderInProject(Folder $folder, Project $project, FolderProjectMapping $mapping)
    {
        try {
            $projectDomain = $project->domain ?: $project->subdomain;
            $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders/' . $mapping->project_folder_id;

            $workflowsData = $folder->workflows->map(function ($workflow) use ($mapping) {
                $projectWorkflowId = $mapping->workflow_mappings[$workflow->id] ?? null;

                return [
                    'id' => $projectWorkflowId,
                    'name' => $workflow->name,
                    'description' => $workflow->description,
                    'nodes' => $workflow->nodes,
                    'edges' => $workflow->edges,
                ];
            })->toArray();

            $response = Http::put($apiUrl, [
                'name' => $folder->name,
                'description' => $folder->description,
                'workflows' => $workflowsData,
            ]);

            if ($response->successful()) {
                \Log::info("Updated folder in project domain: {$projectDomain}");
            } else {
                \Log::error("Failed to update folder in project domain: {$projectDomain}. Response: " . $response->body());
            }
        } catch (\Exception $e) {
            \Log::error("Error updating folder in project domain: " . $e->getMessage());
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

        foreach ($request->workflow_ids as $index => $workflowId) {
            if (!$folder->workflows()->where('workflow_id', $workflowId)->exists()) {
                $folder->workflows()->attach($workflowId, ['order' => $folder->workflows()->count() + $index]);
            }
        }

        $folder->load(['creator', 'workflows', 'projects']);
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

        $folder->workflows()->detach($request->workflow_ids);

        $folder->load(['creator', 'workflows', 'projects']);
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

        $folder->projects()->sync($request->project_ids);

        // Sync workflows to projects
        $this->syncFolderToProjects($folder);

        $folder->load(['creator', 'workflows', 'projects']);
        return response()->json($folder);
    }

    /**
     * Manually sync a folder to all assigned projects
     */
    public function syncFolder(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $folder = Folder::findOrFail($id);

        try {
            // Sync workflows to projects
            $this->syncFolderToProjects($folder);

            $folder->load(['creator', 'workflows', 'projects']);

            return response()->json([
                'message' => 'Folder synced successfully to all projects',
                'folder' => $folder
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error syncing folder',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

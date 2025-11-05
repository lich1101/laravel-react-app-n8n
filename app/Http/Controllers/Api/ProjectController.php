<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Folder;
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

        // Sync config and folders to project
        $this->syncProject($project);

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

        // Sync config and folders to project
        $this->syncProject($project);

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
            $configUrl = rtrim($project->subdomain, '/') . '/api/project-config/sync';
            $configResponse = Http::withHeaders([
                'X-Admin-Key' => env('USER_APP_ADMIN_KEY'),
                'Accept' => 'application/json',
            ])->post($configUrl, [
                'max_concurrent_workflows' => $project->max_concurrent_workflows,
            ]);

            $results['config_synced'] = $configResponse->successful();
            if (!$configResponse->successful()) {
                $results['errors'][] = 'Config sync failed: ' . $configResponse->body();
            }

        } catch (\Exception $e) {
            $results['errors'][] = 'Config sync error: ' . $e->getMessage();
        }

        try {
            // 2. Sync folders (same as FolderController sync)
            $folderUrl = rtrim($project->subdomain, '/') . '/api/project-folders';
            
            // Delete all existing folders first
            $deleteResponse = Http::withHeaders([
                'X-Admin-Key' => env('USER_APP_ADMIN_KEY'),
            ])->delete($folderUrl);

            // Create folders for this project
            foreach ($project->folders as $folder) {
                $createResponse = Http::withHeaders([
                    'X-Admin-Key' => env('USER_APP_ADMIN_KEY'),
                ])->post($folderUrl, [
                    'id' => $folder->id,
                    'name' => $folder->name,
                    'description' => $folder->description,
                    'workflows' => $folder->directWorkflows->map(function ($workflow) {
                        return [
                            'id' => $workflow->id,
                            'name' => $workflow->name,
                            'description' => $workflow->description,
                            'nodes' => $workflow->nodes,
                            'edges' => $workflow->edges,
                            'active' => $workflow->active,
                        ];
                    }),
                ]);
            }

            $results['folders_synced'] = true;

        } catch (\Exception $e) {
            $results['errors'][] = 'Folder sync error: ' . $e->getMessage();
        }

        return $results;
    }
}

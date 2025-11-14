<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\DestroyProjectJob;
use App\Jobs\ProvisionProjectJob;
use App\Models\Project;
use App\Models\Folder;
use App\Models\FolderProjectMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Process\Process;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Illuminate\Support\Str;

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
            'max_concurrent_workflows' => 'nullable|integer|min:1|max:100',
            'folder_ids' => 'nullable|array',
            'folder_ids.*' => 'exists:folders,id',
        ]);

        $subdomain = $this->ensureUniqueSubdomain(
            $this->normalizeEnvironmentName($request->name)
        );

        // Create project with provisioning status
        $project = Project::create([
            'name' => $request->name,
            'subdomain' => $subdomain,
            'domain' => $this->buildDomainFromSubdomain($subdomain),
            'status' => 'active',
            'max_concurrent_workflows' => $request->max_concurrent_workflows ?? 5,
            'provisioning_status' => 'provisioning',
            'provisioning_error' => null,
        ]);

        // Trigger provisioning asynchronously - job will update project after completion
        ProvisionProjectJob::dispatch($project->id, $request->folder_ids ?? []);

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
            'subdomain' => 'nullable|string|max:255|unique:projects,subdomain,' . $id,
            'domain' => 'nullable|string|max:255',
            'status' => 'nullable|in:active,inactive',
            'max_concurrent_workflows' => 'nullable|integer|min:1|max:100',
            'folder_ids' => 'nullable|array',
            'folder_ids.*' => 'exists:folders,id',
        ]);

        $subdomain = $project->subdomain;
        if ($request->filled('subdomain')) {
            $subdomain = $this->ensureUniqueSubdomain(
                $this->normalizeEnvironmentName($request->subdomain),
                (int) $project->id
            );
        }

        $domain = $project->domain;
        if ($request->filled('domain')) {
            $domain = $request->domain;
        } elseif ($project->domain === null) {
            $domain = $this->buildDomainFromSubdomain($subdomain);
        }

        $project->update([
            'name' => $request->name,
            'subdomain' => $subdomain,
            'domain' => $domain,
            'status' => $request->status ?? $project->status,
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
        $environment = $project->subdomain;
        $projectId = $project->id;
        $project->delete();

        if ($environment) {
            DestroyProjectJob::dispatch($projectId, $environment);
        }

        return response()->json(['message' => 'Project deleted successfully and destruction queued']);
    }

    /**
     * Sync project configuration and folders to project domain
     */
    public function sync(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::with('folders')->findOrFail($id);
        
        $result = $this->syncProject($project);

        if ($result['config_synced'] ?? false) {
            $queueResult = $this->restartProjectQueue($project);
            $result['queue_restart'] = $queueResult;
        }
        
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
     * Restart queue worker for project to apply concurrency changes
     */
    private function restartProjectQueue(Project $project): array
    {
        $scriptPath = config('projects.restart_queue_script');
        $environment = $project->subdomain;

        if (!$environment) {
            $message = 'Project missing subdomain; skip queue restart.';
            \Log::warning($message, ['project_id' => $project->id]);
            return ['success' => false, 'message' => $message];
        }

        if (!$scriptPath || !is_file($scriptPath)) {
            $message = sprintf(
                'restart-queue script not found (config projects.restart_queue_script = %s)',
                $scriptPath ?: '(empty)'
            );
            \Log::error($message);
            return ['success' => false, 'message' => $message];
        }

        $process = new Process(['bash', $scriptPath, $environment]);
        $process->setTimeout(120);

        try {
            $process->run();

            if (!$process->isSuccessful()) {
                $errorOutput = $process->getErrorOutput() ?: $process->getOutput();
                $message = 'Queue restart failed: ' . trim($errorOutput);
                \Log::error($message, [
                    'project_id' => $project->id,
                    'environment' => $environment,
                ]);
                throw new ProcessFailedException($process);
            }

            $message = 'Queue restarted successfully.';
            \Log::info($message, [
                'project_id' => $project->id,
                'environment' => $environment,
            ]);

            return ['success' => true, 'message' => $message];
        } catch (\Throwable $e) {
            $message = 'Queue restart exception: ' . $e->getMessage();
            \Log::error($message, [
                'project_id' => $project->id,
                'environment' => $environment,
            ]);

            return ['success' => false, 'message' => $message];
        }
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

    private function normalizeEnvironmentName(string $value): string
    {
        $normalized = Str::slug($value);
        if (empty($normalized)) {
            $normalized = 'project-' . strtolower(Str::random(6));
        }

        return substr($normalized, 0, 63);
    }

    private function ensureUniqueSubdomain(string $base, ?int $ignoreId = null): string
    {
        $candidate = $base;
        $counter = 1;

        while (
            Project::where('subdomain', $candidate)
                ->when($ignoreId, fn ($query, $id) => $query->where('id', '<>', $id))
                ->exists()
        ) {
            $candidate = $base . '-' . $counter;
            $counter++;
        }

        return $candidate;
    }

    private function buildDomainFromSubdomain(string $subdomain): string
    {
        $baseDomain = config('projects.base_domain', 'chatplus.vn');
        return "{$subdomain}.{$baseDomain}";
    }
}

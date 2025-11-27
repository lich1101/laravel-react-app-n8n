<?php

namespace App\Jobs;

use App\Models\Project;
use App\Models\FolderProjectMapping;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class ProvisionProjectJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly int $projectId,
        public readonly array $folderIds
    ) {
    }

    public function handle(): void
    {
        $project = Project::findOrFail($this->projectId);
        $environmentName = $project->subdomain;
        $script = config('projects.provision_script');

        if (!$script || !is_file($script)) {
            $message = sprintf('Provision script not found at path: %s', $script ?? '(empty)');
            Log::error($message, [
                'project_id' => $this->projectId,
                'environment' => $environmentName,
            ]);
            $project->update(['provisioning_status' => 'failed']);
            throw new \RuntimeException($message);
        }

        $process = new Process(['bash', $script, $environmentName]);
        $process->setTimeout(null);

        try {
            Log::info('Starting project provisioning script', [
                'project_id' => $this->projectId,
                'environment' => $environmentName,
                'script' => $script,
            ]);

            $process->run(function ($type, $buffer) use ($environmentName) {
                Log::info(sprintf('[provision-%s] %s', $environmentName, trim($buffer)));
            });

            if (!$process->isSuccessful()) {
                throw new ProcessFailedException($process);
            }
        } catch (\Throwable $e) {
            $errorOutput = $process->getErrorOutput() ?: $process->getOutput();
            $message = trim($errorOutput) ?: $e->getMessage();

            Log::error('Provision script failed', [
                'project_id' => $this->projectId,
                'environment' => $environmentName,
                'output' => $message,
            ]);

            $project->update([
                'provisioning_status' => 'failed',
                'provisioning_error' => mb_substr($message, 0, 2000),
            ]);

            throw $e;
        }

        // Update project after successful provisioning
        $project->update([
            'provisioning_status' => 'completed',
            'provisioning_error' => null,
        ]);

        // Attach folders if provided
        if (!empty($this->folderIds)) {
            $project->folders()->sync($this->folderIds);
        }

        // Reload project with relationships
        $project->load(['folders', 'subscriptionPackage']);

        // Wait a bit for project domain to be ready
        sleep(3);

        // Auto-sync project after provisioning completes
        try {
            Log::info('Starting auto-sync for newly created project', [
                'project_id' => $this->projectId,
                'project_name' => $project->name,
            ]);

            $this->syncProject($project);

            Log::info('Auto-sync completed successfully', [
                'project_id' => $this->projectId,
                'project_name' => $project->name,
            ]);
        } catch (\Exception $e) {
            // Log error but don't fail the job - provisioning was successful
            Log::error('Auto-sync failed after provisioning', [
                'project_id' => $this->projectId,
                'project_name' => $project->name,
                'error' => $e->getMessage(),
            ]);
        }

        Log::info('Provision script completed successfully', [
            'project_id' => $this->projectId,
            'environment' => $environmentName,
        ]);
    }

    /**
     * Sync project config and folders to project domain
     */
    private function syncProject(Project $project): void
    {
        // 1. Sync config: max_concurrent_workflows, subscription package info, max_user_workflows
        $projectDomain = $project->domain ?: $project->subdomain;
        $projectDomain = rtrim($projectDomain, '/');
        // Add https:// if not present
        if (!preg_match('/^https?:\/\//', $projectDomain)) {
            $projectDomain = 'https://' . $projectDomain;
        }
        $configUrl = $projectDomain . '/api/project-config/sync';
        
        // Prepare subscription package data
        $subscriptionPackageData = null;
        if ($project->subscriptionPackage) {
            $subscriptionPackageData = [
                'id' => $project->subscriptionPackage->id,
                'name' => $project->subscriptionPackage->name,
                'description' => $project->subscriptionPackage->description,
                'max_concurrent_workflows' => $project->subscriptionPackage->max_concurrent_workflows,
                'max_user_workflows' => $project->subscriptionPackage->max_user_workflows,
            ];
        }
        
        $configPayload = [
            'max_concurrent_workflows' => $project->max_concurrent_workflows,
            'project_id' => $project->id,
            'project_name' => $project->name,
            'max_user_workflows' => $project->max_user_workflows,
        ];
        
        if ($subscriptionPackageData) {
            $configPayload['subscription_package'] = $subscriptionPackageData;
        }
        
        Log::info("Syncing config to project '{$project->name}' at URL: {$configUrl}", $configPayload);
        
        $configResponse = Http::timeout(30)
            ->withHeaders([
                'X-Admin-Key' => config('app.user_app_admin_key'),
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ])->post($configUrl, $configPayload);

        if ($configResponse->successful()) {
            Log::info("Config sync successful for project '{$project->name}'", $configResponse->json());
        } else {
            $errorMsg = 'Config sync failed: ' . $configResponse->status() . ' - ' . $configResponse->body();
            Log::error($errorMsg);
            throw new \Exception($errorMsg);
        }

        // 2. Sync folders (CREATE or UPDATE, not DELETE all)
        foreach ($project->folders as $folder) {
            // Load directWorkflows for this folder
            $folder->loadMissing('directWorkflows');

            // Check if mapping exists
            $mapping = FolderProjectMapping::where('admin_folder_id', $folder->id)
                ->where('project_id', $project->id)
                ->first();

            if (!$mapping) {
                // First time sync - create folder in project domain
                Log::info("Creating folder '{$folder->name}' in project '{$project->name}'");
                $this->createFolderInProject($folder, $project);
            } else {
                // Update existing folder in project domain
                Log::info("Updating folder '{$folder->name}' in project '{$project->name}'");
                $this->updateFolderInProject($folder, $project, $mapping);
            }
        }
    }

    /**
     * Create a new folder in the project domain (first time sync)
     */
    private function createFolderInProject($folder, Project $project): void
    {
        $projectDomain = $project->domain ?: $project->subdomain;
        // Add https:// if not present
        if (!preg_match('/^https?:\/\//', $projectDomain)) {
            $projectDomain = 'https://' . $projectDomain;
        }
        $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders';

        Log::info("Creating folder '{$folder->name}' in project domain: {$apiUrl}");

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
            Log::info("Successfully created folder in project domain", $data);

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
            Log::error($errorMsg);
            throw new \Exception($errorMsg);
        }
    }

    /**
     * Update an existing folder in the project domain
     */
    private function updateFolderInProject($folder, Project $project, FolderProjectMapping $mapping): void
    {
        $projectDomain = $project->domain ?: $project->subdomain;
        // Add https:// if not present
        if (!preg_match('/^https?:\/\//', $projectDomain)) {
            $projectDomain = 'https://' . $projectDomain;
        }
        $apiUrl = rtrim($projectDomain, '/') . '/api/project-folders/' . $mapping->project_folder_id;

        Log::info("Updating folder '{$folder->name}' in project domain: {$apiUrl}");

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
            Log::info("Successfully updated folder in project domain");
        } else if ($response->status() === 404) {
            // Folder not found - it was deleted, recreate it
            Log::warning("Folder not found (404), deleting old mapping and recreating folder");
            $mapping->delete();
            
            // Recreate the folder
            $this->createFolderInProject($folder, $project);
            Log::info("Successfully recreated folder after 404 error");
        } else {
            $errorMsg = "Failed to update folder. Status: {$response->status()}, Response: " . $response->body();
            Log::error($errorMsg);
            throw new \Exception($errorMsg);
        }
    }
}


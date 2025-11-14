<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\SystemSetting;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProjectConfigController extends Controller
{
    /**
     * Get configuration for a project (called from project domain)
     * Authenticated via X-Admin-Key header
     */
    public function getConfig(Request $request): JsonResponse
    {
        // Get project from subdomain
        $subdomain = $request->header('X-Project-Domain') ?? $request->getHost();
        
        $project = $this->resolveProject($subdomain);

        return response()->json([
            'max_concurrent_workflows' => $project->max_concurrent_workflows ?? 5,
            'project_name' => $project->name,
            'status' => $project->status,
        ]);
    }

    /**
     * Update configuration for current project
     * Called from project domain via cron/script
     */
    public function updateLocalConfig(Request $request): JsonResponse
    {
        $request->validate([
            'max_concurrent_workflows' => 'required|integer|min:1|max:100',
        ]);

        // Get project from subdomain
        $subdomain = $request->header('X-Project-Domain') ?? $request->getHost();
        
        $project = $this->resolveProject($subdomain);

        // Update project config
        $project->update([
            'max_concurrent_workflows' => $request->max_concurrent_workflows,
        ]);

        // Update local system_settings table
        SystemSetting::set(
            'max_concurrent_workflows',
            $request->max_concurrent_workflows,
            'integer'
        );

        return response()->json([
            'message' => 'Configuration updated successfully',
            'max_concurrent_workflows' => $project->max_concurrent_workflows,
        ]);
    }

    /**
     * Sync config from Administrator to project domain
     * Called from Administrator when updating project
     */
    public function syncConfigToProject(Project $project): JsonResponse
    {
        try {
            $apiUrl = rtrim($project->subdomain, '/') . '/api/project-config/sync';
            
            // Call project's API to update its config
            $response = \Http::withHeaders([
                'X-Admin-Key' => config('app.admin_key'),
                'Accept' => 'application/json',
            ])->post($apiUrl, [
                'max_concurrent_workflows' => $project->max_concurrent_workflows,
            ]);

            if ($response->successful()) {
                return response()->json([
                    'message' => 'Configuration synced successfully',
                    'project' => $project->name,
                ]);
            }

            return response()->json([
                'error' => 'Failed to sync configuration',
                'details' => $response->body(),
            ], 500);

        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to sync configuration',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Find project record by domain/subdomain. If missing, create a minimal one so sync never fails.
     */
    protected function resolveProject(string $domain): Project
    {
        $project = Project::where('subdomain', $domain)
            ->orWhere('domain', $domain)
            ->first();

        if ($project) {
            return $project;
        }

        return Project::create([
            'name' => config('app.name', 'Automation Project'),
            'subdomain' => $domain,
            'domain' => $domain,
            'status' => 'active',
            'max_concurrent_workflows' => SystemSetting::get('max_concurrent_workflows', 5),
        ]);
    }
}

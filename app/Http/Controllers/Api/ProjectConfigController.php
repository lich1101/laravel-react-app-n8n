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
        $project->load('subscriptionPackage');

        $response = [
            'max_concurrent_workflows' => $project->max_concurrent_workflows ?? 5,
            'max_user_workflows' => $project->max_user_workflows,
            'project_name' => $project->name,
            'status' => $project->status,
        ];
        
        if ($project->expires_at) {
            $response['expires_at'] = $project->expires_at->toIso8601String();
        }
        
        if ($project->subscriptionPackage) {
            $response['subscription_package'] = [
                'id' => $project->subscriptionPackage->id,
                'name' => $project->subscriptionPackage->name,
                'max_concurrent_workflows' => $project->subscriptionPackage->max_concurrent_workflows,
                'max_user_workflows' => $project->subscriptionPackage->max_user_workflows,
                'duration_days' => $project->subscriptionPackage->duration_days,
                'price' => $project->subscriptionPackage->price,
            ];
        }

        return response()->json($response);
    }

    /**
     * Update configuration for current project
     * Called from project domain via cron/script
     */
    public function updateLocalConfig(Request $request): JsonResponse
    {
        $request->validate([
            'max_concurrent_workflows' => 'required|integer|min:1|max:100',
            'max_user_workflows' => 'nullable|integer|min:0|max:1000',
            'expires_at' => 'nullable|date',
            'subscription_package' => 'nullable|array',
            'subscription_package.id' => 'nullable|integer',
            'subscription_package.name' => 'nullable|string',
            'subscription_package.max_concurrent_workflows' => 'nullable|integer',
            'subscription_package.max_user_workflows' => 'nullable|integer',
            'subscription_package.duration_days' => 'nullable|integer',
            'subscription_package.price' => 'nullable|numeric',
        ]);

        // Get project from subdomain
        $subdomain = $request->header('X-Project-Domain') ?? $request->getHost();
        
        $project = $this->resolveProject($subdomain);

        // Update project config
        $updateData = [
            'max_concurrent_workflows' => $request->max_concurrent_workflows,
        ];
        
        if ($request->has('max_user_workflows')) {
            $updateData['max_user_workflows'] = $request->max_user_workflows;
        }
        
        // Update expires_at only if project doesn't have it yet (first time sync only)
        // This allows future renewal/package change features to manage expires_at separately
        if ($request->has('expires_at') && $request->expires_at && !$project->expires_at) {
            $updateData['expires_at'] = $request->expires_at;
        }
        
        $project->update($updateData);

        // Update local system_settings table
        SystemSetting::set(
            'max_concurrent_workflows',
            $request->max_concurrent_workflows,
            'integer'
        );
        
        // Update max_user_workflows setting if provided
        if ($request->has('max_user_workflows') && $request->max_user_workflows !== null) {
            SystemSetting::set(
                'max_user_workflows',
                $request->max_user_workflows,
                'integer'
            );
        }
        
        // Save expires_at to system settings
        // Always update SystemSetting to keep it in sync with administrator
        if ($request->has('expires_at') && $request->expires_at) {
            SystemSetting::set(
                'project_expires_at',
                $request->expires_at,
                'string'
            );
            
            \Log::info("Updated project_expires_at in SystemSetting", [
                'expires_at' => $request->expires_at,
                'project_name' => $project->name,
            ]);
        } else {
            // Clear expires_at if not provided
            SystemSetting::where('key', 'project_expires_at')->delete();
        }
        
        // Save subscription package info if provided
        if ($request->has('subscription_package') && $request->subscription_package) {
            $packageName = $request->subscription_package['name'] ?? null;
            $packageDescription = $request->subscription_package['description'] ?? null;
            
            if ($packageName) {
                SystemSetting::set(
                    'subscription_package_name',
                    $packageName,
                    'string'
                );
            }
            
            if ($packageDescription) {
                SystemSetting::set(
                    'subscription_package_description',
                    $packageDescription,
                    'string'
                );
            }
            
            \Log::info("Project '{$project->name}' synced with subscription package", [
                'package_id' => $request->subscription_package['id'] ?? null,
                'package_name' => $packageName,
                'package_max_concurrent_workflows' => $request->subscription_package['max_concurrent_workflows'] ?? null,
                'package_max_user_workflows' => $request->subscription_package['max_user_workflows'] ?? null,
            ]);
        } else {
            // Clear subscription package info if not provided
            SystemSetting::where('key', 'subscription_package_name')->delete();
            SystemSetting::where('key', 'subscription_package_description')->delete();
        }

        return response()->json([
            'message' => 'Configuration updated successfully',
            'max_concurrent_workflows' => $project->max_concurrent_workflows,
            'max_user_workflows' => $project->max_user_workflows,
            'expires_at' => $project->expires_at ? $project->expires_at->toIso8601String() : null,
            'subscription_package' => $request->subscription_package ?? null,
        ]);
    }

    /**
     * Sync config from Administrator to project domain
     * Called from Administrator when updating project
     */
    public function syncConfigToProject(Project $project): JsonResponse
    {
        try {
            $project->load('subscriptionPackage');
            
            $apiUrl = rtrim($project->subdomain, '/') . '/api/project-config/sync';
            
            // Prepare subscription package data
            $subscriptionPackageData = null;
            if ($project->subscriptionPackage) {
                $subscriptionPackageData = [
                    'id' => $project->subscriptionPackage->id,
                    'name' => $project->subscriptionPackage->name,
                    'description' => $project->subscriptionPackage->description,
                    'max_concurrent_workflows' => $project->subscriptionPackage->max_concurrent_workflows,
                    'max_user_workflows' => $project->subscriptionPackage->max_user_workflows,
                    'duration_days' => $project->subscriptionPackage->duration_days,
                    'price' => $project->subscriptionPackage->price,
                ];
            }
            
            $payload = [
                'max_concurrent_workflows' => $project->max_concurrent_workflows,
                'max_user_workflows' => $project->max_user_workflows,
            ];
            
            // Add expires_at if set
            if ($project->expires_at) {
                $payload['expires_at'] = $project->expires_at->toIso8601String();
            }
            
            if ($subscriptionPackageData) {
                $payload['subscription_package'] = $subscriptionPackageData;
            }
            
            // Call project's API to update its config
            $response = \Http::withHeaders([
                'X-Admin-Key' => config('app.admin_key'),
                'Accept' => 'application/json',
            ])->post($apiUrl, $payload);

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

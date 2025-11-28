<?php

namespace App\Http\Middleware;

use App\Models\Project;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckSubscriptionExpiry
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $path = $request->path();
        
        // Skip check for API routes - they have their own authentication
        if (str_starts_with($path, 'api/')) {
            return $next($request);
        }
        
        // Get project from domain/subdomain first
        $domain = $request->getHost();
        $project = Project::where('subdomain', $domain)
            ->orWhere('domain', $domain)
            ->first();
        
        // If project not found, allow request (might be administrator app or project not set up yet)
        if (!$project) {
            \Log::info("CheckSubscriptionExpiry: No project found for domain {$domain}, allowing request");
            return $next($request);
        }
        
        // Check if project is still being provisioned
        if ($project->provisioning_status === 'pending' || $project->provisioning_status === 'provisioning') {
            // Only allow specific API routes needed for provisioning
            $allowedApiPaths = [
                '/api/project-config/sync',  // Sync config from administrator
                '/api/project-config',       // Get config
                '/api/sso-verify',           // SSO verification
            ];
            
            $isAllowedApi = false;
            foreach ($allowedApiPaths as $allowedPath) {
                if (str_starts_with($path, $allowedPath)) {
                    $isAllowedApi = true;
                    break;
                }
            }
            
            if ($isAllowedApi) {
                return $next($request);
            }
            
            // Block all other requests and show "Website đang được tạo" page
            \Log::info("CheckSubscriptionExpiry: Project is being provisioned, showing provisioning page", [
                'project_id' => $project->id,
                'provisioning_status' => $project->provisioning_status,
                'path' => $path,
            ]);
            
            return response()->view('provisioning-in-progress', [
                'project' => $project,
            ]);
        }
        
        // Log project status for debugging
        \Log::info("CheckSubscriptionExpiry: Project found", [
            'project_id' => $project->id,
            'project_name' => $project->name,
            'expires_at' => $project->expires_at?->toIso8601String(),
            'is_past' => $project->expires_at ? $project->expires_at->isPast() : null,
            'path' => $path,
        ]);
        
        // Check if project has expired
        // Only block if expires_at is set AND has passed
        if ($project->expires_at && $project->expires_at->isPast()) {
            \Log::warning("CheckSubscriptionExpiry: Project expired, blocking request", [
                'project_id' => $project->id,
                'expires_at' => $project->expires_at->toIso8601String(),
                'path' => $path,
            ]);
            // Only allow these specific paths when expired:
            // 1. Subscription expired page itself
            if ($path === 'subscription-expired') {
                return $next($request);
            }
            
            // 2. API routes that are critical for sync from administrator
            $allowedApiPaths = [
                '/api/project-config/sync',  // Sync config from administrator
                '/api/project-config',       // Get config
                '/api/sso-verify',           // SSO verification
            ];
            
            $isAllowedApi = false;
            foreach ($allowedApiPaths as $allowedPath) {
                if (str_starts_with($path, $allowedPath)) {
                    $isAllowedApi = true;
                    break;
                }
            }
            
            if ($isAllowedApi) {
                return $next($request);
            }
            
            // Block everything else, including:
            // - All other API routes
            // - All web routes (including catch-all /{any})
            // - SSO login
            // - Static icons
            // - React Router routes
            return redirect()->route('subscription.expired');
        }
        
        // If project exists but hasn't expired (or expires_at is null), allow all requests
        return $next($request);
    }
}

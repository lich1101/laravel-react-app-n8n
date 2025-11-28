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
        
        // Get project from domain/subdomain first
        $domain = $request->getHost();
        $project = Project::where('subdomain', $domain)
            ->orWhere('domain', $domain)
            ->first();
        
        // If project not found, allow request (might be administrator app)
        if (!$project) {
            return $next($request);
        }
        
        // Check if project has expired
        if ($project->expires_at && $project->expires_at->isPast()) {
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
        
        return $next($request);
    }
}

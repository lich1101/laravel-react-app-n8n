<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateWithAdminKey
{
    /**
     * Handle an incoming request.
     * 
     * Authenticate using X-Admin-Key header instead of Bearer token
     * This allows Administrator app to manage resources across all users
     */
    public function handle(Request $request, Closure $next): Response
    {
        $adminKey = $request->header('X-Admin-Key');
        
        // Check if admin key is provided and matches APP_KEY
        if (!$adminKey) {
            return response()->json([
                'error' => 'Admin key required',
                'message' => 'X-Admin-Key header is required for this endpoint'
            ], 401);
        }

        // Verify admin key matches APP_KEY
        $expectedKey = config('app.key');
        
        // Remove 'base64:' prefix if present
        if (str_starts_with($expectedKey, 'base64:')) {
            $expectedKey = substr($expectedKey, 7);
        }
        
        // Also handle base64: prefix in provided key
        $providedKey = $adminKey;
        if (str_starts_with($providedKey, 'base64:')) {
            $providedKey = substr($providedKey, 7);
        }
        
        if ($providedKey !== $expectedKey) {
            return response()->json([
                'error' => 'Invalid admin key',
                'message' => 'The provided X-Admin-Key is invalid'
            ], 403);
        }

        // Admin key is valid, proceed without user authentication
        \Log::info('Authenticated request with Admin Key from: ' . $request->ip());
        
        return $next($request);
    }
}


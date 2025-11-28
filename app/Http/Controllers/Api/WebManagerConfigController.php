<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SubscriptionPackage;
use Illuminate\Http\JsonResponse;

class WebManagerConfigController extends Controller
{
    /**
     * Check if current domain is WEB_MANAGER_USER domain
     */
    public function checkDomain(): JsonResponse
    {
        $isWebManagerDomain = \App\Helpers\DomainHelper::isWebManagerUserDomain();
        
        return response()->json([
            'is_web_manager_domain' => $isWebManagerDomain,
        ]);
    }

    /**
     * Get subscription packages for web manager users
     */
    public function getSubscriptionPackages(): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        // Get all packages, including those without price (for display)
        $packages = SubscriptionPackage::orderBy('price', 'asc')
            ->orderBy('name', 'asc')
            ->get();

        return response()->json($packages);
    }
}

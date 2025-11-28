<?php

namespace App\Helpers;

class DomainHelper
{
    /**
     * Check if current domain is the web manager user domain
     */
    public static function isWebManagerUserDomain(): bool
    {
        // Use config() instead of env() to work with config cache
        // config('app.web_manager_user') reads from config/app.php which reads from env('WEB_MANAGER_USER')
        $webManagerDomain = config('app.web_manager_user');
        
        // Log for debugging
        \Log::info('DomainHelper::isWebManagerUserDomain', [
            'web_manager_domain' => $webManagerDomain,
            'current_domain' => request()->getHost(),
        ]);
        
        if (!$webManagerDomain) {
            \Log::warning('WEB_MANAGER_USER not set in config or env');
            return false;
        }
        
        $currentDomain = request()->getHost();
        
        // Remove protocol if present
        $webManagerDomain = str_replace(['https://', 'http://'], '', $webManagerDomain);
        $webManagerDomain = trim($webManagerDomain, '/');
        
        $isMatch = $currentDomain === $webManagerDomain;
        
        \Log::info('DomainHelper::isWebManagerUserDomain result', [
            'is_match' => $isMatch,
            'current_domain' => $currentDomain,
            'web_manager_domain' => $webManagerDomain,
        ]);
        
        return $isMatch;
    }
}


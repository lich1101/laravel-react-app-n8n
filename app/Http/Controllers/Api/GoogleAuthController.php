<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Helpers\DomainHelper;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    /**
     * Redirect to Google OAuth
     */
    public function redirect(): \Illuminate\Http\RedirectResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!DomainHelper::isWebManagerUserDomain()) {
            abort(403, 'Unauthorized');
        }

        try {
            return Socialite::driver('google')
                ->scopes(['openid', 'profile', 'email'])
                ->redirect();
        } catch (\Exception $e) {
            \Log::error('Google OAuth redirect error', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            abort(500, 'Google OAuth configuration error: ' . $e->getMessage());
        }
    }

    /**
     * Handle Google OAuth callback
     */
    public function callback(Request $request): \Illuminate\Http\RedirectResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!DomainHelper::isWebManagerUserDomain()) {
            abort(403, 'Unauthorized');
        }

        try {
            $googleUser = Socialite::driver('google')->user();

            // Find or create user
            $user = User::where('email', $googleUser->email)->first();

            if ($user) {
                // Check if user's project still exists, if not, reset project_id
                // This allows user to create a new project after their old project was deleted
                $projectId = null;
                if ($user->project_id) {
                    $projectExists = \App\Models\Project::find($user->project_id);
                    if ($projectExists) {
                        $projectId = $user->project_id;
                    }
                    // If project doesn't exist, projectId remains null
                }
                
                // Update existing user
                $user->update([
                    'name' => $googleUser->name ?? $user->name,
                    'project_id' => $projectId, // Reset to null if project was deleted
                ]);
            } else {
                // Create new user with role 'user'
                $user = User::create([
                    'name' => $googleUser->name ?? $googleUser->nickname ?? 'User',
                    'email' => $googleUser->email,
                    'password' => Hash::make(Str::random(32)), // Random password since using OAuth
                    'role' => 'user',
                    'email_verified_at' => now(), // Google verified email
                    'project_id' => null,
                ]);
            }

            // Create token for API authentication
            $token = $user->createToken('auth_token')->plainTextToken;

            // Store token and user in localStorage via redirect with hash
            $baseUrl = config('app.url', url('/'));
            $redirectUrl = $baseUrl . '/login?google_auth=success&token=' . urlencode($token) . '&user=' . urlencode(json_encode([
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ]));

            return redirect($redirectUrl);
        } catch (\Exception $e) {
            \Log::error('Google OAuth callback error', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            $baseUrl = config('app.url', url('/'));
            return redirect($baseUrl . '/login?google_auth=error&message=' . urlencode('Đăng nhập Google thất bại. Vui lòng thử lại.'));
        }
    }
}


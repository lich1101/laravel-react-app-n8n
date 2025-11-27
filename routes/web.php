<?php

use App\Http\Controllers\Api\AutomationCallbackController;
use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;

Route::match(['get', 'post'], '/automation-{slug}/{path}/{uuid}', [AutomationCallbackController::class, 'handle'])
    ->withoutMiddleware([VerifyCsrfToken::class])
    ->where([
        'slug' => '[A-Za-z0-9\-]+',
        'path' => '[A-Za-z0-9\-]+',
        'uuid' => '[0-9a-fA-F\-]{36}',
    ]);

// SSO Login route - must be before catch-all
Route::get('/sso-login', function (\Illuminate\Http\Request $request) {
    $token = $request->query('token');
    
    if (!$token) {
        return redirect('/login')->with('error', 'Token không hợp lệ');
    }
    
    // Verify token from administrator
    $adminUrl = config('app.administrator_url', 'https://administrator.chatplus.vn');
    
    try {
        // Call administrator API to verify token
        $response = \Illuminate\Support\Facades\Http::timeout(10)
            ->withHeaders([
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ])
            ->post("{$adminUrl}/api/sso-verify", [
                'token' => $token,
            ]);
        
        if ($response->successful() && $response->json('valid')) {
            $data = $response->json();
            $adminRole = $data['admin_role'] ?? 'administrator';
            
            // Find user by role (should exist from SystemUsersSeeder)
            $user = \App\Models\User::where('role', $adminRole)->first();
            
            if (!$user) {
                \Log::error('SSO login: User with role not found', [
                    'role' => $adminRole,
                ]);
                return redirect('/login')->with('error', 'Không tìm thấy user với role ' . $adminRole . '. Vui lòng chạy SystemUsersSeeder.');
            }
            
            // Create API token for React app
            $apiToken = $user->createToken('sso_token')->plainTextToken;
            
            // Return HTML page that saves token to localStorage and redirects
            return response()->view('sso-login', [
                'token' => $apiToken,
                'user' => $user,
            ]);
        }
    } catch (\Exception $e) {
        \Log::error('SSO login error', [
            'error' => $e->getMessage(),
            'token' => substr($token, 0, 10) . '...',
        ]);
    }
    
    return redirect('/login')->with('error', 'Không thể đăng nhập tự động. Vui lòng đăng nhập thủ công.');
})->name('sso-login');

// Serve static icons before catch-all route
Route::get('/icons/{path}', function ($path) {
    $filePath = public_path('icons/' . $path);
    if (file_exists($filePath) && is_file($filePath)) {
        $mimeType = mime_content_type($filePath);
        return response()->file($filePath, ['Content-Type' => $mimeType]);
    }
    abort(404);
})->where('path', '.*');

// Catch all routes for React Router
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');

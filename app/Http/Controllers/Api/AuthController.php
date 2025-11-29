<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function registrationStatus(): JsonResponse
    {
        // For WEB_MANAGER_USER domain, allow unlimited user registrations
        if (\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json([
                'requires_registration' => false, // Always allow registration
            ]);
        }

        $hasUser = User::where('role', 'user')->exists();

        return response()->json([
            'requires_registration' => !$hasUser,
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        // For WEB_MANAGER_USER domain, allow unlimited user registrations
        // For other domains, limit to only 1 user registration
        $isWebManagerDomain = \App\Helpers\DomainHelper::isWebManagerUserDomain();
        
        // Only limit registration if NOT in WEB_MANAGER_USER domain
        // In WEB_MANAGER_USER domain, allow unlimited registrations
        if (!$isWebManagerDomain) {
            // Check if a user with role 'user' already exists
        if (User::where('role', 'user')->exists()) {
            return response()->json([
                'message' => 'Tài khoản đã được đăng ký. Vui lòng đăng nhập.'
            ], 403);
        }
        }
        // If isWebManagerDomain is true, skip the check and allow registration

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => 'user',
            'project_id' => null,
        ]);

        event(new Registered($user));

        return response()->json([
            'message' => 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực.'
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if (!Auth::attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $user = User::where('email', $request->email)->firstOrFail();

        if ($user->role === 'user' && !$user->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Email chưa được xác thực. Vui lòng kiểm tra hộp thư của bạn.'
            ], 403);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'access_token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }

    public function verifyEmail(Request $request, $id, $hash)
    {
        $user = User::findOrFail($id);

        if (! hash_equals((string) $hash, sha1($user->getEmailForVerification()))) {
            abort(403, 'Liên kết xác thực không hợp lệ.');
        }

        if (!$user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        $redirectUrl = rtrim(config('app.url'), '/') . '/login?verified=1';
        return redirect($redirectUrl);
    }
}

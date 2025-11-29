<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\SystemSetting;
use App\Models\Workflow;
use App\Models\WorkflowExecution;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    private function checkAdmin()
    {
        $user = auth()->user();
        if (!$user || ($user->role !== 'admin' && $user->role !== 'administrator')) {
            throw new \Illuminate\Auth\Access\AuthorizationException('Unauthorized');
        }
    }
    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        $this->checkAdmin();
        $users = User::all();
        return response()->json($users);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $this->checkAdmin();
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:6',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => bcrypt($request->password),
            'role' => 'user', // Default role for new users
        ]);

        return response()->json($user, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        $this->checkAdmin();
        $user = User::findOrFail($id);
        return response()->json($user);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->checkAdmin();
        $user = User::findOrFail($id);

        // Prevent changing email of protected users (administrator and admin)
        if ($user->isProtectedUser() && $request->email !== $user->email) {
            return response()->json([
                'error' => 'Cannot change email of protected system users (Administrator and Admin)'
            ], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email,' . $id,
            'password' => 'nullable|string|min:6',
            'role' => 'sometimes|in:user,admin,administrator',
        ]);

        $updateData = [
            'name' => $request->name,
            'email' => $request->email,
        ];

        // Allow updating role if provided
        if ($request->has('role')) {
            $updateData['role'] = $request->role;
        }

        // Only update password if provided
        if ($request->filled('password')) {
            $updateData['password'] = bcrypt($request->password);
        }

        $user->update($updateData);

        return response()->json($user);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        $this->checkAdmin();
        $user = User::findOrFail($id);

        // Prevent deletion of protected users (administrator and admin)
        if ($user->isProtectedUser()) {
            return response()->json([
                'error' => 'Cannot delete protected system users (Administrator and Admin)'
            ], 403);
        }

        $user->delete();

        return response()->json(['message' => 'User deleted successfully']);
    }

    /**
     * Verify or unverify a user's email
     */
    public function verify(Request $request, string $id): JsonResponse
    {
        $this->checkAdmin();
        $user = User::findOrFail($id);

        $request->validate([
            'verified' => 'required|boolean',
        ]);

        if ($request->verified) {
            if (!$user->hasVerifiedEmail()) {
                $user->markEmailAsVerified();
            }
        } else {
            $user->email_verified_at = null;
            $user->save();
        }

        return response()->json([
            'message' => $request->verified ? 'User verified successfully' : 'User unverified successfully',
            'user' => $user->fresh()
        ]);
    }

    /**
     * Get subscription package info and workflow statistics for current user
     */
    public function getPackageInfo(): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Get subscription package info from system_settings
        $packageName = SystemSetting::get('subscription_package_name', null);
        $packageDescription = SystemSetting::get('subscription_package_description', null);
        $maxConcurrentWorkflows = SystemSetting::get('max_concurrent_workflows', 5);
        $maxUserWorkflows = SystemSetting::get('max_user_workflows', null);
        
        // Get project expires_at from system_settings or project
        $expiresAt = null;
        $expiresAtStr = SystemSetting::get('project_expires_at', null);
        if ($expiresAtStr) {
            try {
                $expiresAt = \Carbon\Carbon::parse($expiresAtStr);
            } catch (\Exception $e) {
                // Invalid date, ignore
            }
        }
        
        // If not in system_settings, try to get from project
        if (!$expiresAt && $user->project_id) {
            $project = \App\Models\Project::find($user->project_id);
            if ($project && $project->expires_at) {
                $expiresAt = $project->expires_at;
            }
        }

        // Count running workflows
        $runningWorkflowsCount = WorkflowExecution::where('status', 'running')->count();

        // Count user created workflows (exclude workflows from folder sync)
        $userWorkflowsCount = Workflow::where('user_id', $user->id)
            ->where(function($query) {
                $query->where('is_from_folder', false)
                      ->orWhereNull('is_from_folder');
            })
            ->count();

        return response()->json([
            'subscription_package' => [
                'name' => $packageName,
                'description' => $packageDescription,
            ],
            'expires_at' => $expiresAt ? $expiresAt->toIso8601String() : null,
            'workflow_stats' => [
                'running' => $runningWorkflowsCount,
                'max_concurrent' => $maxConcurrentWorkflows,
                'user_created' => $userWorkflowsCount,
                'max_user_workflows' => $maxUserWorkflows,
            ],
        ]);
    }

    /**
     * Update current user's profile
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email,' . $user->id,
            'phone' => 'nullable|string|max:20',
        ]);

        $updateData = [
            'name' => $request->name,
            'email' => $request->email,
        ];

        if ($request->has('phone')) {
            $updateData['phone'] = $request->phone;
        }

        $user->update($updateData);

        // Update localStorage user info
        $updatedUser = $user->fresh();
        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $updatedUser,
        ]);
    }

    /**
     * Change current user's password
     */
    public function changePassword(Request $request): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $request->validate([
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:6',
            'new_password_confirmation' => 'required|string|same:new_password',
        ]);

        // Verify current password
        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'error' => 'Current password is incorrect'
            ], 422);
        }

        // Update password
        $user->update([
            'password' => Hash::make($request->new_password),
        ]);

        return response()->json([
            'message' => 'Password changed successfully'
        ]);
    }
}

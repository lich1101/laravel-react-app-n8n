<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\SubscriptionPackage;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class WebManagerProjectController extends Controller
{
    /**
     * Get user's project (only 1 project per user)
     */
    public function index(Request $request): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'user') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        // Get project directly from user.project_id (not via whereHas to avoid issues with deleted/recreated users)
        $project = null;
        if ($user->project_id) {
            $project = Project::with(['subscriptionPackage'])->find($user->project_id);
            // If project was deleted but user.project_id still points to it, reset it
            if (!$project) {
                $user->update(['project_id' => null]);
            }
        }

        if (!$project) {
            return response()->json(null, 404);
        }

        return response()->json($project);
    }

    /**
     * Create a new project for user (only 1 project per user)
     */
    public function store(Request $request): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'user') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        // Check if user already has a project (that still exists)
        // Only check user.project_id - if it's null or points to non-existent project, allow creation
        $existingProject = null;
        if ($user->project_id) {
            $existingProject = Project::find($user->project_id);
            // If project was deleted but user.project_id still points to it, reset it
            if (!$existingProject) {
                $user->update(['project_id' => null]);
                $existingProject = null; // Ensure it's null so user can create new project
            }
        }
        
        // Note: We don't check via whereHas('users') because:
        // - If user was deleted and recreated, they have a new ID
        // - Old projects won't be linked to the new user
        // - We only care about the current user's project_id

        if ($existingProject) {
            return response()->json(['error' => 'Bạn đã có trang web. Mỗi tài khoản chỉ được tạo 1 trang web.'], 400);
        }

        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        // Create project without subscription package (blank website)
        $subscriptionPackage = null;
        $folderIds = [];

        $subdomain = $this->ensureUniqueSubdomain(
            $this->normalizeEnvironmentName($request->name)
        );

        // Create project (blank website, no package)
        // IMPORTANT: This only creates a database record, does NOT provision/clone the website
        // Provisioning will only happen when administrator approves payment order in SubscriptionRenewalController
        $project = Project::create([
            'name' => $request->name,
            'subdomain' => $subdomain,
            'domain' => $this->buildDomainFromSubdomain($subdomain),
            'status' => 'active',
            'subscription_package_id' => null, // No package yet
            'max_concurrent_workflows' => 5,
            'max_user_workflows' => null,
            'provisioning_status' => 'pending', // Waiting for admin approval - website not cloned yet
            'provisioning_error' => null,
        ]);

        // Assign user to project
        $user->update(['project_id' => $project->id]);

        // Do NOT trigger ProvisionProjectJob here - it will be triggered when admin approves payment order
        // The actual website cloning and package application happens in SubscriptionRenewalController::approve()

        \Log::info('WebManagerProjectController: Created blank project (database only, no provisioning)', [
            'project_id' => $project->id,
            'project_name' => $project->name,
            'subdomain' => $project->subdomain,
            'user_id' => $user->id,
        ]);

        $project->load(['users', 'subscriptionPackage']);
        return response()->json($project, 201);
    }

    private function normalizeEnvironmentName(string $value): string
    {
        $normalized = Str::slug($value);
        if (empty($normalized)) {
            $normalized = 'project-' . strtolower(Str::random(6));
        }

        return substr($normalized, 0, 63);
    }

    private function ensureUniqueSubdomain(string $base): string
    {
        $candidate = $base;
        $counter = 1;

        while (Project::where('subdomain', $candidate)->exists()) {
            $candidate = $base . '-' . $counter;
            $counter++;
        }

        return $candidate;
    }

    private function buildDomainFromSubdomain(string $subdomain): string
    {
        $baseDomain = config('projects.base_domain', 'chatplus.vn');
        return "{$subdomain}.{$baseDomain}";
    }
}

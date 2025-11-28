<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\SubscriptionPackage;
use App\Jobs\ProvisionProjectJob;
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

        $project = Project::whereHas('users', function($query) use ($user) {
            $query->where('id', $user->id);
        })->with(['subscriptionPackage'])->first();

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

        // Check if user already has a project
        $existingProject = Project::whereHas('users', function($query) use ($user) {
            $query->where('id', $user->id);
        })->first();

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
        // Provisioning will only happen when administrator approves payment order
        $project = Project::create([
            'name' => $request->name,
            'subdomain' => $subdomain,
            'domain' => $this->buildDomainFromSubdomain($subdomain),
            'status' => 'active',
            'subscription_package_id' => null, // No package yet
            'max_concurrent_workflows' => 5,
            'max_user_workflows' => null,
            'provisioning_status' => 'pending', // Waiting for admin approval
            'provisioning_error' => null,
        ]);

        // Assign user to project
        $user->update(['project_id' => $project->id]);

        // Do NOT trigger provisioning here - it will be triggered when admin approves payment order

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

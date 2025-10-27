<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProjectController extends Controller
{
    private function checkAdministrator()
    {
        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Unauthorized. Administrator access required.');
        }
    }

    /**
     * Display a listing of projects
     */
    public function index(): JsonResponse
    {
        $this->checkAdministrator();
        $projects = Project::with(['users', 'folders'])->get();
        return response()->json($projects);
    }

    /**
     * Store a newly created project
     */
    public function store(Request $request): JsonResponse
    {
        $this->checkAdministrator();
        $request->validate([
            'name' => 'required|string|max:255',
            'subdomain' => 'required|string|max:255|unique:projects',
            'domain' => 'nullable|string|max:255',
            'status' => 'nullable|in:active,inactive',
        ]);

        $project = Project::create([
            'name' => $request->name,
            'subdomain' => $request->subdomain,
            'domain' => $request->domain,
            'status' => $request->status ?? 'active',
        ]);

        $project->load(['users', 'folders']);
        return response()->json($project, 201);
    }

    /**
     * Display the specified project
     */
    public function show(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::with(['users', 'folders'])->findOrFail($id);
        return response()->json($project);
    }

    /**
     * Update the specified project
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'subdomain' => 'required|string|max:255|unique:projects,subdomain,' . $id,
            'domain' => 'nullable|string|max:255',
            'status' => 'nullable|in:active,inactive',
        ]);

        $project->update([
            'name' => $request->name,
            'subdomain' => $request->subdomain,
            'domain' => $request->domain,
            'status' => $request->status,
        ]);

        $project->load(['users', 'folders']);
        return response()->json($project);
    }

    /**
     * Remove the specified project
     */
    public function destroy(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $project = Project::findOrFail($id);
        $project->delete();

        return response()->json(['message' => 'Project deleted successfully']);
    }
}

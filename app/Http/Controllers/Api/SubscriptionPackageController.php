<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SubscriptionPackage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionPackageController extends Controller
{
    private function checkAdministrator()
    {
        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Unauthorized. Administrator access required.');
        }
    }

    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        $this->checkAdministrator();
        $packages = SubscriptionPackage::with('folders')->get();
        return response()->json($packages);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $this->checkAdministrator();
        $request->validate([
            'name' => 'required|string|max:255',
            'max_concurrent_workflows' => 'required|integer|min:1|max:100',
            'max_user_workflows' => 'required|integer|min:0|max:1000',
            'description' => 'nullable|string',
            'duration_days' => 'nullable|integer|min:1',
            'price' => 'nullable|numeric|min:0',
            'badge_enabled' => 'nullable|boolean',
            'badge_text' => 'nullable|string|max:255',
            'folder_ids' => 'nullable|array',
            'folder_ids.*' => 'exists:folders,id',
        ]);

        $package = SubscriptionPackage::create([
            'name' => $request->name,
            'max_concurrent_workflows' => $request->max_concurrent_workflows,
            'max_user_workflows' => $request->max_user_workflows,
            'description' => $request->description,
            'duration_days' => $request->duration_days,
            'price' => $request->price,
            'badge_enabled' => $request->badge_enabled ?? false,
            'badge_text' => $request->badge_text,
        ]);

        if ($request->has('folder_ids')) {
            $package->folders()->sync($request->folder_ids);
        }

        $package->load('folders');
        return response()->json($package, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $package = SubscriptionPackage::with('folders')->findOrFail($id);
        return response()->json($package);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();
        $package = SubscriptionPackage::findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'max_concurrent_workflows' => 'required|integer|min:1|max:100',
            'max_user_workflows' => 'required|integer|min:0|max:1000',
            'description' => 'nullable|string',
            'duration_days' => 'nullable|integer|min:1',
            'price' => 'nullable|numeric|min:0',
            'badge_enabled' => 'nullable|boolean',
            'badge_text' => 'nullable|string|max:255',
            'folder_ids' => 'nullable|array',
            'folder_ids.*' => 'exists:folders,id',
        ]);

        $package->update([
            'name' => $request->name,
            'max_concurrent_workflows' => $request->max_concurrent_workflows,
            'max_user_workflows' => $request->max_user_workflows,
            'description' => $request->description,
            'duration_days' => $request->duration_days,
            'price' => $request->price,
            'badge_enabled' => $request->badge_enabled ?? false,
            'badge_text' => $request->badge_text,
        ]);

        if ($request->has('folder_ids')) {
            $package->folders()->sync($request->folder_ids);
        }

        $package->load('folders');
        return response()->json($package);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        $this->checkAdministrator();
        $package = SubscriptionPackage::findOrFail($id);
        
        // Check if package is being used by any projects
        if ($package->projects()->count() > 0) {
            return response()->json([
                'message' => 'Không thể xóa gói cước đang được sử dụng bởi các project'
            ], 422);
        }

        $package->delete();
        return response()->json(['message' => 'Gói cước đã được xóa thành công']);
    }
}

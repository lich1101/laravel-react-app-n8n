<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ManualPaymentOrder;
use App\Models\Project;
use App\Models\SubscriptionPackage;
use App\Http\Controllers\Api\ProjectController;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SubscriptionRenewalController extends Controller
{
    private function checkAdministrator()
    {
        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Unauthorized. Administrator access required.');
        }
    }

    /**
     * List all payment orders (for administrator)
     */
    public function index(Request $request): JsonResponse
    {
        $this->checkAdministrator();

        $status = $request->query('status'); // pending, approved, rejected

        $query = ManualPaymentOrder::with(['user', 'project', 'subscriptionPackage', 'approvedBy'])
            ->orderBy('created_at', 'desc');

        if ($status) {
            $query->where('status', $status);
        }

        $orders = $query->get();

        return response()->json($orders);
    }

    /**
     * Get a specific payment order
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();

        $order = ManualPaymentOrder::with(['user', 'project', 'subscriptionPackage', 'approvedBy'])
            ->findOrFail($id);

        return response()->json($order);
    }

    /**
     * Approve a payment order
     */
    public function approve(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();

        $order = ManualPaymentOrder::with(['user', 'project', 'subscriptionPackage'])
            ->findOrFail($id);

        if ($order->status !== 'pending') {
            return response()->json(['error' => 'Order đã được xử lý'], 400);
        }

        $user = auth()->user();
        $subscriptionPackage = $order->subscriptionPackage;

        // Update order status
        $order->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $user->id,
        ]);

        $orderType = $order->type ?? 'renewal';
        
        // For all types, we need a project
        if (!$order->project_id) {
            // If no project_id, try to find user's project
            $user = $order->user;
            $existingProject = Project::whereHas('users', function($query) use ($user) {
                $query->where('id', $user->id);
            })->first();
            
            if ($existingProject) {
                $order->update(['project_id' => $existingProject->id]);
            } else {
                return response()->json(['error' => 'Project not found. User cần tạo project trước khi đăng ký gói.'], 400);
            }
        }
        
        // Get project
        $project = $order->project;
        
        // Update subscription package for all types
        $project->update([
            'subscription_package_id' => $subscriptionPackage->id,
            'max_concurrent_workflows' => $subscriptionPackage->max_concurrent_workflows,
            'max_user_workflows' => $subscriptionPackage->max_user_workflows,
        ]);

        // Calculate expires_at based on order type
        if ($subscriptionPackage->duration_days) {
            \Log::info('SubscriptionRenewalController: Calculating expires_at', [
                'order_id' => $order->id,
                'order_type' => $orderType,
                'project_id' => $project->id,
                'current_expires_at' => $project->expires_at?->toIso8601String(),
                'duration_days' => $subscriptionPackage->duration_days,
            ]);
            
            if ($orderType === 'change') {
                // Đổi gói: cộng lại từ đầu (từ now())
                $newExpiresAt = now()->addDays($subscriptionPackage->duration_days);
                \Log::info('SubscriptionRenewalController: Change package - reset from now', [
                    'new_expires_at' => $newExpiresAt->toIso8601String(),
                ]);
            } else if ($orderType === 'new') {
                // Đăng ký mới: tính từ now()
                $newExpiresAt = now()->addDays($subscriptionPackage->duration_days);
                \Log::info('SubscriptionRenewalController: New subscription - reset from now', [
                    'new_expires_at' => $newExpiresAt->toIso8601String(),
                ]);
            } else {
                // Gia hạn (renewal): cộng vào số cũ
                // Nhưng nếu số cũ đã hết hạn (âm) thì cộng lại từ đầu
                $currentExpiresAt = $project->expires_at;
                
                if (!$currentExpiresAt || $currentExpiresAt->isPast()) {
                    // Đã hết hạn hoặc chưa có: cộng lại từ đầu
                    $newExpiresAt = now()->addDays($subscriptionPackage->duration_days);
                    \Log::info('SubscriptionRenewalController: Renewal - expired or no date, reset from now', [
                        'new_expires_at' => $newExpiresAt->toIso8601String(),
                    ]);
                } else {
                    // Còn hạn: cộng vào số cũ
                    $newExpiresAt = \Carbon\Carbon::parse($currentExpiresAt)->addDays($subscriptionPackage->duration_days);
                    \Log::info('SubscriptionRenewalController: Renewal - extend from current', [
                        'current_expires_at' => $currentExpiresAt->toIso8601String(),
                        'new_expires_at' => $newExpiresAt->toIso8601String(),
                    ]);
                }
            }
            
            $project->update(['expires_at' => $newExpiresAt]);
        }

        // If project hasn't been provisioned yet, trigger provisioning now
        if ($project->provisioning_status === 'pending' || !$project->provisioning_status) {
            // Get folder IDs from subscription package
            $folderIds = [];
            if ($subscriptionPackage) {
                $folderIds = $subscriptionPackage->folders->pluck('id')->toArray();
            }
            
            // Update provisioning status to 'provisioning'
            $project->update(['provisioning_status' => 'provisioning']);
            
            // Trigger provisioning job
            \App\Jobs\ProvisionProjectJob::dispatch($project->id, $folderIds);
            
            \Log::info('SubscriptionRenewalController: Triggered provisioning after order approval', [
                'project_id' => $project->id,
                'order_id' => $order->id,
            ]);
        }

        // Sync project to web clone (only when approved)
        // Reload project with relationships
        $project = Project::with(['folders', 'subscriptionPackage'])->findOrFail($project->id);
        $projectController = new ProjectController();
        // Use reflection to call protected syncProject method
        $reflection = new \ReflectionClass($projectController);
        $method = $reflection->getMethod('syncProject');
        $method->setAccessible(true);
        $syncResult = $method->invoke($projectController, $project);
        
        // Restart queue if config synced
        if ($syncResult['config_synced'] ?? false) {
            $restartMethod = $reflection->getMethod('restartProjectQueue');
            $restartMethod->setAccessible(true);
            $restartMethod->invoke($projectController, $project);
        }

        return response()->json([
            'message' => 'Order đã được duyệt và thời gian đã được cập nhật',
            'order' => $order->fresh(['user', 'project', 'subscriptionPackage', 'approvedBy']),
        ]);
    }

    /**
     * Reject a payment order
     */
    public function reject(Request $request, string $id): JsonResponse
    {
        $this->checkAdministrator();

        $order = ManualPaymentOrder::findOrFail($id);

        if ($order->status !== 'pending') {
            return response()->json(['error' => 'Order đã được xử lý'], 400);
        }

        $request->validate([
            'notes' => 'nullable|string',
        ]);

        $user = auth()->user();

        $order->update([
            'status' => 'rejected',
            'notes' => $request->notes,
            'approved_by' => $user->id,
        ]);

        return response()->json([
            'message' => 'Order đã bị từ chối',
            'order' => $order->fresh(['user', 'project', 'subscriptionPackage', 'approvedBy']),
        ]);
    }
}

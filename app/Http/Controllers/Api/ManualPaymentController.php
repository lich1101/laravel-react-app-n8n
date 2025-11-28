<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ManualPaymentOrder;
use App\Models\SubscriptionPackage;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class ManualPaymentController extends Controller
{
    /**
     * Generate QR code for manual payment order
     */
    private function generateQrCode(ManualPaymentOrder $manualPaymentOrder): string
    {
        $bankCode = '970422'; // MB Bank (mã NAPAS)
        $accountNumber = '0325896036';
        $amount = intval($manualPaymentOrder->amount); // VND
        $description = "DH {$manualPaymentOrder->uuid}";
        $accountName = 'DANG VAN BINH';

        $qrUrl = "https://img.vietqr.io/image/{$bankCode}-{$accountNumber}-print.png?amount={$amount}&addInfo=" . urlencode($description) . "&accountName=" . urlencode($accountName);

        return $qrUrl;
    }

    /**
     * Create a new payment order for subscription/renewal
     */
    public function createOrder(Request $request): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'user') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $request->validate([
            'subscription_package_id' => 'required|exists:subscription_packages,id',
            'project_id' => 'nullable|exists:projects,id',
            'type' => 'required|in:new,renewal,change', // new: đăng ký mới, renewal: gia hạn, change: đổi gói
        ]);

        $subscriptionPackage = SubscriptionPackage::findOrFail($request->subscription_package_id);
        
        if (!$subscriptionPackage->price) {
            return response()->json(['error' => 'Gói cước này chưa có giá'], 400);
        }

        // Check if user already has a project (for renewal/change)
        $project = null;
        if ($request->project_id) {
            $project = Project::where('id', $request->project_id)
                ->whereHas('users', function($query) use ($user) {
                    $query->where('id', $user->id);
                })
                ->first();
            
            if (!$project) {
                return response()->json(['error' => 'Project not found or not owned by user'], 404);
            }
        }

        // For new subscription, get user's project (if exists, it's blank - no package)
        if ($request->type === 'new') {
            $existingProject = Project::whereHas('users', function($query) use ($user) {
                $query->where('id', $user->id);
            })->first();
            
            if ($existingProject) {
                // User has a blank project, use it for the order
                $project = $existingProject;
            }
            // If no project, user needs to create one first (handled in frontend)
        }

        // Create payment order
        $order = ManualPaymentOrder::create([
            'user_id' => $user->id,
            'project_id' => $project?->id,
            'subscription_package_id' => $subscriptionPackage->id,
            'type' => $request->type,
            'amount' => $subscriptionPackage->price,
            'status' => 'pending',
        ]);

        // Generate QR code
        $qrCodeUrl = $this->generateQrCode($order);
        $order->update(['qr_code_url' => $qrCodeUrl]);

        return response()->json([
            'order' => $order->load(['subscriptionPackage', 'project']),
            'qr_code_url' => $qrCodeUrl,
        ], 201);
    }

    /**
     * Get user's payment orders
     */
    public function myOrders(Request $request): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'user') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $orders = ManualPaymentOrder::where('user_id', $user->id)
            ->with(['subscriptionPackage', 'project', 'approvedBy'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($orders);
    }

    /**
     * Get a specific payment order
     */
    public function show(Request $request, string $id): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'user') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $order = ManualPaymentOrder::where('id', $id)
            ->where('user_id', $user->id)
            ->with(['subscriptionPackage', 'project', 'approvedBy'])
            ->firstOrFail();

        return response()->json($order);
    }

    /**
     * Submit payment proof (user confirms payment)
     */
    public function submitPayment(Request $request, string $id): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'user') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $order = ManualPaymentOrder::where('id', $id)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($order->status !== 'pending') {
            return response()->json(['error' => 'Order đã được xử lý'], 400);
        }

        $request->validate([
            'payment_proof_url' => 'nullable|url',
        ]);

        // Update order with payment proof (if provided)
        $order->update([
            'payment_proof_url' => $request->payment_proof_url,
            // Status remains 'pending' - waiting for administrator approval
        ]);

        return response()->json([
            'message' => 'Đơn hàng đã được gửi vào hàng đợi chờ duyệt',
            'order' => $order->fresh(['subscriptionPackage', 'project']),
        ]);
    }
}

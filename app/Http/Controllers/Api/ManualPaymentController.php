<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ManualPaymentOrder;
use App\Models\SubscriptionPackage;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

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
     * Generate QR code preview URL (chưa tạo đơn)
     */
    private function generateQrCodePreviewUrl(float $amount, string $tempUuid = null): string
    {
        $bankCode = '970422'; // MB Bank (mã NAPAS)
        $accountNumber = '0325896036';
        $amountInt = intval($amount); // VND
        $description = $tempUuid ? "DH {$tempUuid}" : "DH PREVIEW";
        $accountName = 'DANG VAN BINH';

        $qrUrl = "https://img.vietqr.io/image/{$bankCode}-{$accountNumber}-print.png?amount={$amountInt}&addInfo=" . urlencode($description) . "&accountName=" . urlencode($accountName);

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
     * Generate QR code preview (chưa tạo đơn)
     */
    public function generateQrPreview(Request $request): JsonResponse
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
        ]);

        $subscriptionPackage = SubscriptionPackage::findOrFail($request->subscription_package_id);
        
        if (!$subscriptionPackage->price) {
            return response()->json(['error' => 'Gói cước này chưa có giá'], 400);
        }

        // Generate temporary UUID for preview
        $tempUuid = Str::uuid()->toString();
        
        // Generate QR code preview (chưa tạo đơn)
        $qrCodeUrl = $this->generateQrCodePreviewUrl($subscriptionPackage->price, $tempUuid);

        return response()->json([
            'qr_code_url' => $qrCodeUrl,
            'amount' => $subscriptionPackage->price,
            'package' => $subscriptionPackage,
            'temp_uuid' => $tempUuid,
        ]);
    }

    /**
     * Send email and create order (gửi email trước, sau đó tạo đơn)
     */
    public function sendEmailAndCreateOrder(Request $request): JsonResponse
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
            'type' => 'required|in:new,renewal,change',
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
                $project = $existingProject;
            }
        }

        try {
            // BƯỚC 1: Gửi email thông báo cho administrator
            // Lấy danh sách email từ bảng email_recipients (active) hoặc fallback về users table
            $adminEmails = \App\Models\EmailRecipient::where('is_active', true)
                ->pluck('email')
                ->toArray();
            
            // Nếu không có email trong email_recipients, fallback về users table
            if (empty($adminEmails)) {
                $adminEmails = \App\Models\User::where('role', 'administrator')
                    ->whereNotNull('email')
                    ->pluck('email')
                    ->toArray();
            }

            if (!empty($adminEmails)) {
                try {
                    Mail::to($adminEmails)
                        ->send(new \App\Mail\PaymentOrderNotification(
                            $user,
                            $subscriptionPackage,
                            $request->type,
                            $subscriptionPackage->price
                        ));
                    
                    // Lưu log email thành công cho mỗi recipient
                    foreach ($adminEmails as $recipientEmail) {
                        \App\Models\PaymentOrderEmail::create([
                            'user_id' => $user->id,
                            'subscription_package_id' => $subscriptionPackage->id,
                            'recipient_email' => $recipientEmail,
                            'subject' => 'Thông báo đơn hàng thanh toán gói cước - ' . $subscriptionPackage->name,
                            'customer_name' => $user->name,
                            'customer_email' => $user->email,
                            'customer_phone' => $user->phone ?? null,
                            'package_name' => $subscriptionPackage->name,
                            'amount' => $subscriptionPackage->price,
                            'order_type' => $request->type,
                            'status' => 'sent',
                        ]);
                    }
                    
                    Log::info('Payment order notification email sent', [
                        'user_id' => $user->id,
                        'user_email' => $user->email,
                        'package_id' => $subscriptionPackage->id,
                        'admin_emails' => $adminEmails,
                    ]);
                } catch (\Exception $emailException) {
                    // Lưu log email failed
                    foreach ($adminEmails as $recipientEmail) {
                        \App\Models\PaymentOrderEmail::create([
                            'user_id' => $user->id,
                            'subscription_package_id' => $subscriptionPackage->id,
                            'recipient_email' => $recipientEmail,
                            'subject' => 'Thông báo đơn hàng thanh toán gói cước - ' . $subscriptionPackage->name,
                            'customer_name' => $user->name,
                            'customer_email' => $user->email,
                            'customer_phone' => $user->phone ?? null,
                            'package_name' => $subscriptionPackage->name,
                            'amount' => $subscriptionPackage->price,
                            'order_type' => $request->type,
                            'status' => 'failed',
                            'error_message' => $emailException->getMessage(),
                        ]);
                    }
                    
                    Log::error('Payment order notification email failed', [
                        'user_id' => $user->id,
                        'error' => $emailException->getMessage(),
                    ]);
                    
                    // Vẫn tiếp tục tạo đơn dù email fail
                }
            }

            // BƯỚC 2: Tạo đơn hàng sau khi gửi email thành công
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

            // BƯỚC 3: Cập nhật email logs với order_id
            \App\Models\PaymentOrderEmail::whereNull('manual_payment_order_id')
                ->where('user_id', $user->id)
                ->where('subscription_package_id', $subscriptionPackage->id)
                ->where('order_type', $request->type)
                ->where('created_at', '>=', now()->subMinutes(5)) // Chỉ update emails gần đây (5 phút)
                ->update(['manual_payment_order_id' => $order->id]);

            // BƯỚC 4: Submit payment (đơn đã được tạo, chỉ cần update status)
            $order->update([
                'payment_proof_url' => $request->payment_proof_url ?? null,
                // Status remains 'pending' - waiting for administrator approval
            ]);

            return response()->json([
                'message' => 'Email đã được gửi và đơn hàng đã được tạo thành công',
                'order' => $order->load(['subscriptionPackage', 'project']),
            ], 201);
        } catch (\Exception $e) {
            Log::error('Error sending email and creating order', [
                'user_id' => $user->id,
                'package_id' => $subscriptionPackage->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Không thể gửi email hoặc tạo đơn hàng: ' . $e->getMessage()
            ], 500);
        }
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

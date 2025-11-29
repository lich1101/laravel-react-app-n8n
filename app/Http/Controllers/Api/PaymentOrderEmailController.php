<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentOrderEmail;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class PaymentOrderEmailController extends Controller
{
    /**
     * Get list of payment order emails (only for administrator in WEB_MANAGER_USER domain)
     */
    public function index(Request $request): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $emails = PaymentOrderEmail::with(['user', 'subscriptionPackage', 'manualPaymentOrder'])
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($emails);
    }

    /**
     * Get a specific payment order email
     */
    public function show(string $id): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $email = PaymentOrderEmail::with(['user', 'subscriptionPackage', 'manualPaymentOrder'])
            ->findOrFail($id);

        return response()->json($email);
    }
}

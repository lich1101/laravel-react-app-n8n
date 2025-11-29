<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailRecipient;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class EmailRecipientController extends Controller
{
    /**
     * Display a listing of the resource.
     * Only for administrator in WEB_MANAGER_USER domain
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

        $recipients = EmailRecipient::orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($recipients);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validator = Validator::make($request->all(), [
            'email' => 'required|email|unique:email_recipients,email',
            'name' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $recipient = EmailRecipient::create([
            'email' => $request->email,
            'name' => $request->name,
            'is_active' => $request->is_active ?? true,
            'notes' => $request->notes,
        ]);

        return response()->json($recipient, 201);
    }

    /**
     * Display the specified resource.
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

        $recipient = EmailRecipient::findOrFail($id);

        return response()->json($recipient);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $recipient = EmailRecipient::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'email' => 'required|email|unique:email_recipients,email,' . $id,
            'name' => 'nullable|string|max:255',
            'is_active' => 'boolean',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $recipient->update([
            'email' => $request->email,
            'name' => $request->name,
            'is_active' => $request->has('is_active') ? $request->is_active : $recipient->is_active,
            'notes' => $request->notes,
        ]);

        return response()->json($recipient);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        // Only allow in WEB_MANAGER_USER domain
        if (!\App\Helpers\DomainHelper::isWebManagerUserDomain()) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $user = auth()->user();
        if (!$user || $user->role !== 'administrator') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $recipient = EmailRecipient::findOrFail($id);
        $recipient->delete();

        return response()->json(['message' => 'Email recipient deleted successfully']);
    }
}

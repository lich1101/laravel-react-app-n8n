<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class SystemSettingController extends Controller
{
    /**
     * Get all system settings
     */
    public function index(): JsonResponse
    {
        $settings = SystemSetting::all();
        
        // Format settings for frontend
        $formatted = $settings->map(function ($setting) {
            return [
                'key' => $setting->key,
                'value' => SystemSetting::get($setting->key), // Get typed value
                'type' => $setting->type,
                'description' => $setting->description,
            ];
        });

        return response()->json($formatted);
    }

    /**
     * Update a setting
     */
    public function update(Request $request, string $key): JsonResponse
    {
        $request->validate([
            'value' => 'required',
        ]);

        $setting = SystemSetting::where('key', $key)->firstOrFail();
        
        // Validate based on type
        $value = $request->value;
        if ($setting->type === 'integer' && !is_numeric($value)) {
            return response()->json([
                'error' => 'Value must be a number'
            ], 400);
        }

        SystemSetting::set($key, $value, $setting->type);

        return response()->json([
            'message' => 'Setting updated successfully',
            'setting' => [
                'key' => $key,
                'value' => SystemSetting::get($key),
                'type' => $setting->type,
                'description' => $setting->description,
            ]
        ]);
    }
}

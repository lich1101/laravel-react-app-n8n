<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationRow;
use App\Models\AutomationTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;

class AutomationCallbackController extends Controller
{
    public function handle(Request $request, string $slug, string $path, string $uuid): JsonResponse
    {
        $table = AutomationTable::where('slug', $slug)->firstOrFail();
        $config = $table->config ?? [];
        $callback = $config['callback'] ?? [];

        if (empty($callback['path']) || trim($callback['path'], '/') !== $path) {
            abort(404);
        }

        $expectedMethod = strtoupper($callback['method'] ?? 'POST');
        if ($expectedMethod !== $request->method()) {
            return response()->json([
                'message' => 'Phương thức không được phép cho callback này.',
            ], 405);
        }

        if (!empty($callback['token'])) {
            $token = $request->header('X-Automation-Callback-Token') ?? $request->bearerToken();
            if ($token !== $callback['token']) {
                return response()->json([
                    'message' => 'Token không hợp lệ.',
                ], 403);
            }
        }

        $row = $table->rows()->where('uuid', $uuid)->firstOrFail();

        $payload = $request->input('data', $request->all());

        $inputUpdates = Arr::get($payload, 'input', []);
        $outputUpdates = Arr::get($payload, 'output', []);
        $metaUpdates = Arr::get($payload, 'meta', []);
        $statusPayload = Arr::get($payload, 'status');

        if (is_array($inputUpdates)) {
            $row->input_data = array_replace($row->input_data ?? [], $inputUpdates);
        }

        if (is_array($outputUpdates)) {
            $row->output_data = array_replace($row->output_data ?? [], $outputUpdates);
        }

        if (is_array($metaUpdates)) {
            $row->meta_data = array_replace($row->meta_data ?? [], $metaUpdates);
        }

        if (is_array($statusPayload)) {
            $status = null;
            if (!empty($statusPayload['value'])) {
                $status = $table->statuses()->where('value', $statusPayload['value'])->first();
            }
            if (!$status && !empty($statusPayload['label'])) {
                $status = $table->statuses()->where('label', $statusPayload['label'])->first();
            }
            if ($status) {
                $row->automation_status_id = $status->id;
            }
        }

        $row->is_pending_callback = false;
        $row->pending_since = null;
        $row->last_callback_at = Carbon::now();
        $row->last_callback_payload = $payload;
        $row->save();

        return response()->json([
            'message' => 'Callback processed successfully.',
            'row' => $row->fresh(['status']),
        ]);
    }
}

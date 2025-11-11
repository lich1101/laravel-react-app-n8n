<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationStatus;
use App\Models\AutomationTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AutomationStatusController extends Controller
{
    public function index(AutomationTable $automationTable): JsonResponse
    {
        return response()->json(
            $automationTable->statuses()->orderBy('sort_order')->get()
        );
    }

    public function store(Request $request, AutomationTable $automationTable): JsonResponse
    {
        $data = $this->validateStatus($request, $automationTable);
        $baseValue = $data['value'] ?? Str::slug($data['label']);
        $data['value'] = $this->generateUniqueValue($automationTable, $baseValue);

        $status = $automationTable->statuses()->create($data);
        $this->ensureSingleDefault($automationTable, $status);

        return response()->json($status, 201);
    }

    public function update(Request $request, AutomationTable $automationTable, AutomationStatus $automationStatus): JsonResponse
    {
        $this->ensureStatusBelongsToTable($automationTable, $automationStatus);

        $data = $this->validateStatus($request, $automationTable, $automationStatus);
        if (array_key_exists('value', $data)) {
            $baseValue = $data['value'] ?: Str::slug($data['label'] ?? $automationStatus->label);
            $data['value'] = $this->generateUniqueValue($automationTable, $baseValue, $automationStatus->id);
        }

        $automationStatus->update($data);
        $this->ensureSingleDefault($automationTable, $automationStatus);

        return response()->json($automationStatus->fresh());
    }

    public function destroy(AutomationTable $automationTable, AutomationStatus $automationStatus): JsonResponse
    {
        $this->ensureStatusBelongsToTable($automationTable, $automationStatus);

        if ($automationTable->rows()->where('automation_status_id', $automationStatus->id)->exists()) {
            return response()->json([
                'message' => 'Không thể xoá trạng thái đang được sử dụng bởi các dòng dữ liệu.',
            ], 409);
        }

        $automationStatus->delete();

        if (!$automationTable->statuses()->where('is_default', true)->exists()) {
            $automationTable->statuses()->orderBy('sort_order')->first()?->update(['is_default' => true]);
        }

        return response()->json(['message' => 'Đã xoá trạng thái thành công.']);
    }

    private function validateStatus(Request $request, AutomationTable $table, ?AutomationStatus $status = null): array
    {
        return $request->validate([
            'label' => ['required', 'string', 'max:255'],
            'value' => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
                Rule::unique('automation_statuses', 'value')
                    ->ignore($status?->id)
                    ->where(fn ($query) => $query->where('automation_table_id', $table->id)),
            ],
            'color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'is_default' => ['sometimes', 'boolean'],
            'is_terminal' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],
            'metadata' => ['sometimes', 'array'],
        ]);
    }

    private function ensureSingleDefault(AutomationTable $table, AutomationStatus $status): void
    {
        if ($status->is_default) {
            $table->statuses()
                ->where('id', '!=', $status->id)
                ->update(['is_default' => false]);
        } elseif (!$table->statuses()->where('is_default', true)->exists()) {
            $status->update(['is_default' => true]);
        }
    }

    private function ensureStatusBelongsToTable(AutomationTable $table, AutomationStatus $status): void
    {
        if ($status->automation_table_id !== $table->id) {
            abort(404, 'Trạng thái không thuộc về bảng này.');
        }
    }

    private function generateUniqueValue(AutomationTable $table, string $baseValue, ?int $ignoreId = null): string
    {
        $value = $baseValue ?: Str::random(8);
        $counter = 1;

        while (
            $table->statuses()
                ->where('value', $value)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $value = $baseValue . '-' . $counter;
            $counter++;
        }

        return $value;
    }
}

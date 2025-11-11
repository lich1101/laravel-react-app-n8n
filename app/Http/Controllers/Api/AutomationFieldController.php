<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationField;
use App\Models\AutomationTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AutomationFieldController extends Controller
{
    public function index(AutomationTable $automationTable): JsonResponse
    {
        return response()->json(
            $automationTable->fields()->orderBy('group')->orderBy('display_order')->get()
        );
    }

    public function store(Request $request, AutomationTable $automationTable): JsonResponse
    {
        $data = $this->validateField($request, $automationTable);

        $field = $automationTable->fields()->create($data);

        return response()->json($field, 201);
    }

    public function update(Request $request, AutomationTable $automationTable, AutomationField $automationField): JsonResponse
    {
        $this->ensureFieldBelongsToTable($automationTable, $automationField);

        $data = $this->validateField($request, $automationTable, $automationField);
        $automationField->update($data);

        return response()->json($automationField->fresh());
    }

    public function destroy(AutomationTable $automationTable, AutomationField $automationField): JsonResponse
    {
        $this->ensureFieldBelongsToTable($automationTable, $automationField);

        $automationField->delete();

        return response()->json(['message' => 'Đã xoá trường thành công.']);
    }

    private function validateField(Request $request, AutomationTable $table, ?AutomationField $field = null): array
    {
        return $request->validate([
            'label' => ['required', 'string', 'max:255'],
            'key' => [
                'required',
                'string',
                'max:255',
                Rule::unique('automation_fields', 'key')
                    ->ignore($field?->id)
                    ->where(fn ($query) => $query->where('automation_table_id', $table->id)),
            ],
            'group' => ['sometimes', 'in:input,output,meta'],
            'data_type' => ['sometimes', 'string', 'max:50'],
            'is_required' => ['sometimes', 'boolean'],
            'is_unique' => ['sometimes', 'boolean'],
            'options' => ['sometimes', 'array'],
            'validation_rules' => ['sometimes', 'array'],
            'display_order' => ['sometimes', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function ensureFieldBelongsToTable(AutomationTable $table, AutomationField $field): void
    {
        if ($field->automation_table_id !== $table->id) {
            abort(404, 'Trường không thuộc về bảng này.');
        }
    }
}

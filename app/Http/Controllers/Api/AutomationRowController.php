<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationRow;
use App\Models\AutomationStatus;
use App\Models\AutomationTable;
use App\Services\AutomationWebhookService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class AutomationRowController extends Controller
{
    public function __construct(private readonly AutomationWebhookService $webhookService)
    {
    }

    public function index(Request $request, AutomationTable $automationTable): JsonResponse
    {
        $perPage = min(100, (int) $request->integer('per_page', 25));

        $query = $automationTable->rows()
            ->with(['status', 'creator:id,name', 'updater:id,name'])
            ->latest();

        if ($statusValue = $request->string('status')->toString()) {
            $query->whereHas('status', fn (Builder $builder) => $builder->where('value', $statusValue));
        }

        if ($request->boolean('pending_only')) {
            $query->where('is_pending_callback', true);
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function (Builder $builder) use ($search) {
                $builder->where('external_reference', 'like', "%{$search}%")
                    ->orWhere('uuid', 'like', "%{$search}%");
            });
        }

        /** @var LengthAwarePaginator $paginator */
        $paginator = $query->paginate($perPage);

        return response()->json($paginator);
    }

    public function store(Request $request, AutomationTable $automationTable): JsonResponse
    {
        $data = $this->validateRow($request);

        $status = $this->resolveStatus($automationTable, $data['status_value'] ?? null, $data['status_id'] ?? null)
            ?? $automationTable->statuses()->where('is_default', true)->first();

        $row = DB::transaction(function () use ($request, $automationTable, $data, $status) {
            $row = $automationTable->rows()->create([
                'automation_status_id' => $status?->id,
                'created_by' => $request->user()?->id,
                'updated_by' => $request->user()?->id,
                'input_data' => $data['input_data'] ?? [],
                'output_data' => $data['output_data'] ?? [],
                'meta_data' => $data['meta_data'] ?? [],
                'external_reference' => $data['external_reference'] ?? null,
            ]);

            return $row->load(['status', 'creator:id,name', 'updater:id,name']);
        });

        return response()->json($row, 201);
    }

    public function update(Request $request, AutomationTable $automationTable, AutomationRow $automationRow): JsonResponse
    {
        $this->ensureRowBelongsToTable($automationTable, $automationRow);

        $data = $this->validateRow($request, isUpdate: true);

        $automationRow->fill([
            'input_data' => $data['input_data'] ?? $automationRow->input_data,
            'output_data' => $data['output_data'] ?? $automationRow->output_data,
            'meta_data' => $data['meta_data'] ?? $automationRow->meta_data,
            'external_reference' => $data['external_reference'] ?? $automationRow->external_reference,
        ]);
        $automationRow->updated_by = $request->user()?->id;
        $automationRow->save();

        return response()->json($automationRow->fresh(['status', 'creator:id,name', 'updater:id,name']));
    }

    public function destroy(AutomationTable $automationTable, AutomationRow $automationRow): JsonResponse
    {
        $this->ensureRowBelongsToTable($automationTable, $automationRow);
        $automationRow->delete();

        return response()->json(['message' => 'Đã xoá dòng thành công.']);
    }

    public function bulkDestroy(Request $request, AutomationTable $automationTable): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
        ]);

        $automationTable->rows()->whereIn('id', $validated['ids'])->delete();

        return response()->json(['message' => 'Đã xoá các dòng được chọn.']);
    }

    public function updateStatus(Request $request, AutomationTable $automationTable, AutomationRow $automationRow): JsonResponse
    {
        $this->ensureRowBelongsToTable($automationTable, $automationRow);

        $validated = $request->validate([
            'status_id' => ['sometimes', 'integer', 'exists:automation_statuses,id'],
            'status_value' => ['sometimes', 'string', 'max:255'],
        ]);

        $status = $this->resolveStatus(
            $automationTable,
            $validated['status_value'] ?? null,
            $validated['status_id'] ?? null
        );

        if (!$status) {
            return response()->json(['message' => 'Không tìm thấy trạng thái hợp lệ.'], 422);
        }

        $automationRow->automation_status_id = $status->id;
        $automationRow->updated_by = $request->user()?->id;
        $automationRow->save();

        $result = $this->webhookService->handleStatusChange($automationRow->fresh(['table', 'status']), $status);

        return response()->json([
            'row' => $automationRow->fresh(['status', 'creator:id,name', 'updater:id,name']),
            'webhook' => $result,
        ]);
    }

    public function resendWebhook(AutomationTable $automationTable, AutomationRow $automationRow): JsonResponse
    {
        $this->ensureRowBelongsToTable($automationTable, $automationRow);

        $status = $automationRow->status;
        if (!$status) {
            return response()->json([
                'message' => 'Dòng chưa có trạng thái để gửi webhook.',
            ], 422);
        }

        $result = $this->webhookService->handleStatusChange($automationRow->fresh(['table', 'status']), $status, force: true);

        return response()->json([
            'row' => $automationRow->fresh(['status', 'creator:id,name', 'updater:id,name']),
            'webhook' => $result,
        ]);
    }

    private function validateRow(Request $request, bool $isUpdate = false): array
    {
        $rules = [
            'input_data' => ['sometimes', 'array'],
            'output_data' => ['sometimes', 'array'],
            'meta_data' => ['sometimes', 'array'],
            'external_reference' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status_id' => ['sometimes', 'integer', 'exists:automation_statuses,id'],
            'status_value' => ['sometimes', 'string', 'max:255'],
        ];

        if (!$isUpdate) {
            $rules['input_data'][] = 'nullable';
            $rules['output_data'][] = 'nullable';
            $rules['meta_data'][] = 'nullable';
        }

        return $request->validate($rules);
    }

    private function ensureRowBelongsToTable(AutomationTable $table, AutomationRow $row): void
    {
        if ($row->automation_table_id !== $table->id) {
            abort(404, 'Dòng dữ liệu không thuộc về bảng này.');
        }
    }

    private function resolveStatus(AutomationTable $table, ?string $statusValue, ?int $statusId): ?AutomationStatus
    {
        if ($statusId) {
            return $table->statuses()->where('id', $statusId)->first();
        }

        if ($statusValue) {
            return $table->statuses()->where('value', $statusValue)->first();
        }

        return null;
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationField;
use App\Models\AutomationStatus;
use App\Models\AutomationTable;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AutomationTableController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AutomationTable::query()
            ->with([
                'topic:id,name,slug',
                'fields' => fn ($q) => $q->orderBy('group')->orderBy('display_order'),
                'statuses' => fn ($q) => $q->orderBy('sort_order'),
                'folders:id,name',
            ])
            ->orderBy('name');

        if ($topicId = $request->input('topic_id')) {
            $query->where('automation_topic_id', $topicId);
        }

        if ($topicSlug = $request->input('topic_slug')) {
            $query->whereHas('topic', fn ($q) => $q->where('slug', $topicSlug));
        }

        if ($request->boolean('only_active')) {
            $query->where('is_active', true);
        }

        if ($request->boolean('with_counts')) {
            $query->withCount('rows');
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        return DB::transaction(function () use ($request, $data) {
            $slug = $this->generateUniqueSlug($data['slug'] ?? null, $data['name']);

            $table = AutomationTable::create([
                'automation_topic_id' => $data['automation_topic_id'],
                'name' => $data['name'],
                'slug' => $slug,
                'description' => $data['description'] ?? null,
                'is_active' => $data['is_active'] ?? true,
                'created_by' => $request->user()?->id,
                'config' => $this->prepareConfig($data['config'] ?? []),
            ]);

            if (!empty($data['folder_ids'])) {
                $table->folders()->sync($data['folder_ids']);
            }

            $this->createStatuses($table, $data['statuses'] ?? []);
            $this->createFields($table, $data['fields'] ?? []);

            return response()->json(
                $table->load([
                    'topic:id,name,slug',
                    'fields' => fn ($q) => $q->orderBy('group')->orderBy('display_order'),
                    'statuses' => fn ($q) => $q->orderBy('sort_order'),
                    'folders:id,name',
                ]),
                201
            );
        });
    }

    public function show(AutomationTable $automationTable): JsonResponse
    {
        $automationTable->load([
            'topic:id,name,slug',
            'fields' => fn ($q) => $q->orderBy('group')->orderBy('display_order'),
            'statuses' => fn ($q) => $q->orderBy('sort_order'),
            'folders:id,name',
            'rows' => fn ($q) => $q->latest()->limit(20),
        ]);

        return response()->json($automationTable);
    }

    public function update(Request $request, AutomationTable $automationTable): JsonResponse
    {
        $data = $this->validatePayload($request, isUpdate: true);

        return DB::transaction(function () use ($automationTable, $data) {
            if (isset($data['automation_topic_id'])) {
                $automationTable->automation_topic_id = $data['automation_topic_id'];
            }
            if (isset($data['name'])) {
                $automationTable->name = $data['name'];
            }
            if (array_key_exists('description', $data)) {
                $automationTable->description = $data['description'];
            }
            if (array_key_exists('is_active', $data)) {
                $automationTable->is_active = (bool) $data['is_active'];
            }
            if (isset($data['slug'])) {
                $automationTable->slug = $this->generateUniqueSlug($data['slug'], $automationTable->name, $automationTable->id);
            }
            if (isset($data['config'])) {
                $automationTable->config = $this->prepareConfig($data['config']);
            }
            if (!empty($data['folder_ids'])) {
                $automationTable->folders()->sync($data['folder_ids']);
            } elseif (array_key_exists('folder_ids', $data)) {
                $automationTable->folders()->sync([]);
            }

            $automationTable->save();

            if (isset($data['statuses'])) {
                $this->syncStatuses($automationTable, $data['statuses']);
            }

            if (isset($data['fields'])) {
                $this->syncFields($automationTable, $data['fields']);
            }

            return response()->json($automationTable->fresh([
                'topic:id,name,slug',
                'fields' => fn ($q) => $q->orderBy('group')->orderBy('display_order'),
                'statuses' => fn ($q) => $q->orderBy('sort_order'),
                'folders:id,name',
            ]));
        });
    }

    public function destroy(AutomationTable $automationTable): JsonResponse
    {
        if ($automationTable->rows()->exists()) {
            return response()->json([
                'message' => 'Không thể xoá bảng khi vẫn còn dữ liệu dòng. Hãy xoá hoặc chuyển dữ liệu trước.',
            ], 409);
        }

        $automationTable->fields()->delete();
        $automationTable->statuses()->delete();
        $automationTable->folders()->detach();
        $automationTable->delete();

        return response()->json(['message' => 'Đã xoá bảng automation thành công.']);
    }

    private function validatePayload(Request $request, bool $isUpdate = false): array
    {
        $rules = [
            'automation_topic_id' => [$isUpdate ? 'sometimes' : 'required', 'integer', 'exists:automation_topics,id'],
            'name' => [$isUpdate ? 'sometimes' : 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
            'folder_ids' => ['sometimes', 'array'],
            'folder_ids.*' => ['integer', 'exists:folders,id'],
            'fields' => ['sometimes', 'array'],
            'fields.*.id' => ['sometimes', 'integer', 'exists:automation_fields,id'],
            'fields.*.label' => ['required_with:fields', 'string', 'max:255'],
            'fields.*.key' => ['required_with:fields', 'string', 'max:255'],
            'fields.*.group' => ['required_with:fields', 'in:input,output,meta'],
            'fields.*.data_type' => ['sometimes', 'nullable', 'string', 'max:50'],
            'fields.*.is_required' => ['sometimes', 'boolean'],
            'fields.*.is_unique' => ['sometimes', 'boolean'],
            'fields.*.options' => ['sometimes', 'nullable', 'array'],
            'fields.*.validation_rules' => ['sometimes', 'nullable', 'array'],
            'fields.*.display_order' => ['sometimes', 'integer'],
            'fields.*.is_active' => ['sometimes', 'boolean'],
            'statuses' => ['sometimes', 'array'],
            'statuses.*.id' => ['sometimes', 'integer', 'exists:automation_statuses,id'],
            'statuses.*.label' => ['required_with:statuses', 'string', 'max:255'],
            'statuses.*.value' => ['sometimes', 'nullable', 'string', 'max:255'],
            'statuses.*.color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'statuses.*.is_default' => ['sometimes', 'boolean'],
            'statuses.*.is_terminal' => ['sometimes', 'boolean'],
            'statuses.*.sort_order' => ['sometimes', 'integer'],
            'statuses.*.metadata' => ['sometimes', 'array'],
            'config' => ['sometimes', 'array'],
            'config.webhook' => ['sometimes', 'nullable', 'array'],
            'config.webhook.method' => ['sometimes', 'nullable', 'string', 'in:get,post'],
            'config.webhook.url' => ['sometimes', 'nullable', 'url'],
            'config.webhook.headers' => ['sometimes', 'nullable', 'array'],
            'config.webhook.headers.*' => ['string'],
            'config.webhook.authorization' => ['sometimes', 'nullable', 'array'],
            'config.webhook.authorization.type' => ['sometimes', 'nullable', 'string', 'in:none,bearer,basic,api_key_header,api_key_query'],
            'config.webhook.authorization.token' => ['sometimes', 'nullable', 'string'],
            'config.webhook.authorization.username' => ['sometimes', 'nullable', 'string'],
            'config.webhook.authorization.password' => ['sometimes', 'nullable', 'string'],
            'config.webhook.authorization.header_name' => ['sometimes', 'nullable', 'string'],
            'config.webhook.authorization.query_name' => ['sometimes', 'nullable', 'string'],
            'config.webhook.status_triggers' => ['sometimes', 'nullable', 'array'],
            'config.webhook.status_triggers.*' => ['string'],
            'config.webhook.fields' => ['sometimes', 'nullable', 'array'],
            'config.webhook.fields.input' => ['sometimes', 'nullable', 'array'],
            'config.webhook.fields.output' => ['sometimes', 'nullable', 'array'],
            'config.webhook.fields.include_status' => ['sometimes', 'boolean'],
            'config.callback' => ['sometimes', 'nullable', 'array'],
            'config.callback.method' => ['sometimes', 'nullable', 'string', 'in:get,post'],
            'config.callback.path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'config.callback.token' => ['sometimes', 'nullable', 'string', 'max:255'],
            'config.defaults' => ['sometimes', 'nullable', 'array'],
            'config.defaults.sets' => ['sometimes', 'array'],
            'config.defaults.sets.*.id' => ['sometimes', 'string', 'max:255'],
            'config.defaults.sets.*.name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'config.defaults.sets.*.values' => ['sometimes', 'array'],
            'config.defaults.sets.*.values.input' => ['sometimes', 'array'],
            'config.defaults.sets.*.values.output' => ['sometimes', 'array'],
            'config.defaults.sets.*.values.meta' => ['sometimes', 'array'],
            'config.defaults.active_set_id' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];

        return $request->validate($rules);
    }

    private function generateUniqueSlug(?string $slug, string $fallbackName, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($slug ?: $fallbackName);
        $candidate = $baseSlug;
        $counter = 1;

        while (
            AutomationTable::where('slug', $candidate)
                ->when($ignoreId, fn (Builder $query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $candidate = $baseSlug . '-' . $counter;
            $counter++;
        }

        return $candidate ?: Str::random(8);
    }

    private function prepareConfig(?array $config): array
    {
        $webhook = $config['webhook'] ?? [];
        $authorization = $webhook['authorization'] ?? [];
        $fields = $webhook['fields'] ?? [];
        $callback = $config['callback'] ?? [];
        $defaults = $config['defaults'] ?? [];
        $defaultSets = [];

        if (!empty($defaults['sets']) && is_array($defaults['sets'])) {
            foreach ($defaults['sets'] as $index => $set) {
                $values = $set['values'] ?? [];

                $defaultSets[] = [
                    'id' => (string) ($set['id'] ?? $set['key'] ?? Str::uuid()->toString()),
                    'name' => $set['name'] ?? 'Giá trị mặc định ' . ($index + 1),
                    'values' => [
                        'input' => isset($values['input']) && is_array($values['input']) ? $values['input'] : [],
                        'output' => isset($values['output']) && is_array($values['output']) ? $values['output'] : [],
                        'meta' => isset($values['meta']) && is_array($values['meta']) ? $values['meta'] : [],
                    ],
                ];
            }
        }

        $activeSetId = $defaults['active_set_id'] ?? null;
        if ($activeSetId && !collect($defaultSets)->contains(fn ($set) => $set['id'] === $activeSetId)) {
            $activeSetId = $defaultSets[0]['id'] ?? null;
        }

        return [
            'webhook' => [
                'method' => strtolower($webhook['method'] ?? 'post'),
                'url' => $webhook['url'] ?? null,
                'headers' => $webhook['headers'] ?? [],
                'authorization' => [
                    'type' => $authorization['type'] ?? 'none',
                    'token' => $authorization['token'] ?? null,
                    'username' => $authorization['username'] ?? null,
                    'password' => $authorization['password'] ?? null,
                    'header_name' => $authorization['header_name'] ?? 'X-API-Key',
                    'query_name' => $authorization['query_name'] ?? 'api_key',
                ],
                'status_triggers' => $webhook['status_triggers'] ?? ['completed'],
                'fields' => [
                    'input' => $fields['input'] ?? [],
                    'output' => $fields['output'] ?? [],
                    'include_status' => $fields['include_status'] ?? true,
                ],
            ],
            'callback' => [
                'method' => strtolower($callback['method'] ?? 'post'),
                'path' => $callback['path'] ?? null,
                'token' => $callback['token'] ?? null,
            ],
            'defaults' => [
                'sets' => $defaultSets,
                'active_set_id' => $activeSetId,
            ],
        ];
    }

    private function createStatuses(AutomationTable $table, array $statuses): void
    {
        if (empty($statuses)) {
            $statuses = [
                [
                    'label' => 'Hold',
                    'value' => 'hold',
                    'is_default' => true,
                    'is_terminal' => false,
                    'sort_order' => 0,
                    'color' => '#fbbf24',
                ],
                [
                    'label' => 'Completed',
                    'value' => 'completed',
                    'is_default' => false,
                    'is_terminal' => true,
                    'sort_order' => 1,
                    'color' => '#34d399',
                ],
            ];
        }

        $defaultAssigned = false;
        foreach ($statuses as $index => $status) {
            $value = $status['value'] ?? Str::slug($status['label']);
            $isDefault = $status['is_default'] ?? false;
            if (!$defaultAssigned && $isDefault) {
                $defaultAssigned = true;
            }

            $table->statuses()->create([
                'label' => $status['label'],
                'value' => $value,
                'color' => $status['color'] ?? null,
                'is_default' => $isDefault,
                'is_terminal' => $status['is_terminal'] ?? false,
                'sort_order' => $status['sort_order'] ?? $index,
                'metadata' => $status['metadata'] ?? [],
            ]);
        }

        if (!$defaultAssigned) {
            $table->statuses()->orderBy('sort_order')->first()?->update(['is_default' => true]);
        }
    }

    private function createFields(AutomationTable $table, array $fields): void
    {
        $fields = array_values($fields);

        foreach ($fields as $index => $field) {
            $table->fields()->create([
                'label' => $field['label'],
                'key' => $field['key'],
                'group' => $field['group'] ?? 'input',
                'data_type' => $field['data_type'] ?? 'string',
                'is_required' => $field['is_required'] ?? false,
                'is_unique' => $field['is_unique'] ?? false,
                'options' => $field['options'] ?? [],
                'validation_rules' => $field['validation_rules'] ?? [],
                'display_order' => $field['display_order'] ?? $index,
                'is_active' => $field['is_active'] ?? true,
            ]);
        }
    }

    private function syncStatuses(AutomationTable $table, array $statuses): void
    {
        $existingIds = $table->statuses()->pluck('id')->all();
        $incomingIds = collect($statuses)->pluck('id')->filter()->all();
        $toDelete = array_diff($existingIds, $incomingIds);

        if (!empty($toDelete)) {
            AutomationStatus::whereIn('id', $toDelete)->delete();
        }

        $defaultValue = null;

        foreach ($statuses as $index => $statusData) {
            $value = $statusData['value'] ?? Str::slug($statusData['label']);
            $shouldBeDefault = ($statusData['is_default'] ?? false) && $defaultValue === null;

            $payload = [
                'label' => $statusData['label'],
                'value' => $value,
                'color' => $statusData['color'] ?? null,
                'is_default' => $shouldBeDefault,
                'is_terminal' => $statusData['is_terminal'] ?? false,
                'sort_order' => $statusData['sort_order'] ?? $index,
                'metadata' => $statusData['metadata'] ?? [],
            ];

            if (!empty($statusData['id'])) {
                $status = $table->statuses()->where('id', $statusData['id'])->first();
                if ($status) {
                    $status->update($payload);
                } else {
                    $status = $table->statuses()->create($payload);
                }
            } else {
                $status = $table->statuses()->create($payload);
            }

            if ($shouldBeDefault) {
                $defaultValue = $status->value;
            }
        }

        if ($defaultValue === null) {
            $first = $table->statuses()->orderBy('sort_order')->first();
            if ($first) {
                $first->update(['is_default' => true]);
                $defaultValue = $first->value;
            }
        }

        $table->statuses()
            ->where('value', '!=', $defaultValue)
            ->update(['is_default' => false]);
    }

    private function syncFields(AutomationTable $table, array $fields): void
    {
        $existingIds = $table->fields()->pluck('id')->all();
        $incomingIds = collect($fields)->pluck('id')->filter()->all();
        $toDelete = array_diff($existingIds, $incomingIds);

        if (!empty($toDelete)) {
            AutomationField::whereIn('id', $toDelete)->delete();
        }

        foreach ($fields as $index => $fieldData) {
            $payload = [
                'label' => $fieldData['label'],
                'key' => $fieldData['key'],
                'group' => $fieldData['group'] ?? 'input',
                'data_type' => $fieldData['data_type'] ?? 'string',
                'is_required' => $fieldData['is_required'] ?? false,
                'is_unique' => $fieldData['is_unique'] ?? false,
                'options' => $fieldData['options'] ?? [],
                'validation_rules' => $fieldData['validation_rules'] ?? [],
                'display_order' => $fieldData['display_order'] ?? $index,
                'is_active' => $fieldData['is_active'] ?? true,
            ];

            if (!empty($fieldData['id'])) {
                $field = $table->fields()->where('id', $fieldData['id'])->first();
                if ($field) {
                    $field->update($payload);
                    continue;
                }
            }

            $table->fields()->create($payload);
        }
    }
}

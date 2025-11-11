<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationTopic;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AutomationTopicController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AutomationTopic::query()
            ->orderBy('display_order')
            ->orderBy('name');

        if ($request->boolean('with_tables')) {
            $query->with(['tables' => function ($q) use ($request) {
                $q->withCount('rows')
                    ->with(['statuses' => fn ($s) => $s->orderBy('sort_order')])
                    ->orderBy('name');

                if ($request->boolean('only_active')) {
                    $q->where('is_active', true);
                }
            }]);
        }

        if ($request->boolean('only_active')) {
            $query->where('is_active', true);
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateData($request);

        return DB::transaction(function () use ($request, $data) {
            $slug = $this->generateUniqueSlug($data['slug'] ?? null, $data['name']);

            $topic = AutomationTopic::create([
                'name' => $data['name'],
                'slug' => $slug,
                'description' => $data['description'] ?? null,
                'display_order' => $data['display_order'] ?? 0,
                'is_active' => $data['is_active'] ?? true,
                'created_by' => $request->user()?->id,
            ]);

            return response()->json($topic, 201);
        });
    }

    public function show(AutomationTopic $automationTopic): JsonResponse
    {
        $automationTopic->load(['tables' => function ($q) {
            $q->withCount('rows')->orderBy('name');
        }]);

        return response()->json($automationTopic);
    }

    public function update(Request $request, AutomationTopic $automationTopic): JsonResponse
    {
        $data = $this->validateData($request, isUpdate: true);

        return DB::transaction(function () use ($automationTopic, $data) {
            if (isset($data['name'])) {
                $automationTopic->name = $data['name'];
            }
            if (isset($data['slug'])) {
                $automationTopic->slug = $this->generateUniqueSlug($data['slug'], $automationTopic->name, $automationTopic->id);
            }
            if (array_key_exists('description', $data)) {
                $automationTopic->description = $data['description'];
            }
            if (array_key_exists('display_order', $data)) {
                $automationTopic->display_order = $data['display_order'];
            }
            if (array_key_exists('is_active', $data)) {
                $automationTopic->is_active = (bool) $data['is_active'];
            }

            $automationTopic->save();

            return response()->json($automationTopic->fresh());
        });
    }

    public function destroy(AutomationTopic $automationTopic): JsonResponse
    {
        if ($automationTopic->tables()->exists()) {
            return response()->json([
                'message' => 'Không thể xoá chủ đề khi vẫn còn automation table.',
            ], 409);
        }

        $automationTopic->delete();

        return response()->json([
            'message' => 'Đã xoá chủ đề automation thành công.',
        ]);
    }

    private function validateData(Request $request, bool $isUpdate = false): array
    {
        return $request->validate([
            'name' => [$isUpdate ? 'sometimes' : 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'display_order' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function generateUniqueSlug(?string $slug, string $fallback, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($slug ?: $fallback);
        $candidate = $baseSlug ?: Str::random(8);
        $counter = 1;

        while (
            AutomationTopic::where('slug', $candidate)
                ->when($ignoreId, fn (Builder $query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $candidate = $baseSlug . '-' . $counter;
            $counter++;
        }

        return $candidate;
    }
}

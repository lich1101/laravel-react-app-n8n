<?php

namespace App\Services;

use App\Models\AutomationRow;
use App\Models\AutomationStatus;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class AutomationWebhookService
{
    public function handleStatusChange(AutomationRow $row, AutomationStatus $status, bool $force = false): array
    {
        $table = $row->table()->with(['fields'])->first();
        if (!$table) {
            return ['sent' => false, 'reason' => 'table_not_found'];
        }

        $config = $table->config ?? [];
        $webhookConfig = $config['webhook'] ?? [];
        $shouldTrigger = $force || $this->shouldTrigger($webhookConfig, $status);

        if (!$shouldTrigger) {
            $row->forceFill([
                'is_pending_callback' => false,
                'pending_since' => null,
            ])->save();

            return ['sent' => false, 'reason' => 'status_not_configured'];
        }

        if (empty($webhookConfig['url'])) {
            $row->forceFill([
                'is_pending_callback' => false,
                'pending_since' => null,
            ])->save();

            return ['sent' => false, 'reason' => 'missing_webhook_url'];
        }

        $requiresCallback = $this->requiresCallback($config['callback'] ?? []);
        $payload = $this->buildPayload($row, $status, $webhookConfig, $config['callback'] ?? [], $requiresCallback);
        $method = strtoupper($webhookConfig['method'] ?? 'POST');

        $now = Carbon::now();

        try {
            $response = $this->sendRequest($method, $webhookConfig, $payload);
            $successful = $response->successful();

            if (!$successful) {
                Log::warning('Automation webhook trả về lỗi', [
                    'row_id' => $row->id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }

            $row->forceFill([
                'is_pending_callback' => $successful && $requiresCallback,
                'pending_since' => $successful && $requiresCallback ? $now : null,
                'last_webhook_at' => $now,
                'last_webhook_payload' => $payload,
            ])->save();

            return [
                'sent' => true,
                'success' => $successful,
                'status' => $response->status(),
                'requires_callback' => $successful && $requiresCallback,
                'pending_since' => $successful && $requiresCallback ? $now->toISOString() : null,
                'body' => $response->body(),
            ];
        } catch (Throwable $exception) {
            Log::error('Automation webhook gửi thất bại', [
                'row_id' => $row->id,
                'row_uuid' => $row->uuid,
                'table_id' => $row->automation_table_id,
                'exception' => $exception->getMessage(),
            ]);

            $row->forceFill([
                'is_pending_callback' => false,
                'pending_since' => null,
            ])->save();

            return [
                'sent' => false,
                'reason' => 'request_failed',
                'error' => $exception->getMessage(),
            ];
        }
    }

    private function shouldTrigger(array $webhookConfig, AutomationStatus $status): bool
    {
        $triggers = $webhookConfig['status_triggers'] ?? [];
        if (empty($triggers)) {
            return true;
        }

        return in_array($status->value, $triggers, true);
    }

    private function requiresCallback(array $callbackConfig): bool
    {
        return !empty($callbackConfig['path']);
    }

    private function buildPayload(AutomationRow $row, AutomationStatus $status, array $webhookConfig, array $callbackConfig, bool $requiresCallback): array
    {
        $table = $row->table;
        $fieldConfig = $webhookConfig['fields'] ?? [];

        $inputData = $this->filterData($row->input_data ?? [], $fieldConfig['input'] ?? []);
        $outputData = $this->filterData($row->output_data ?? [], $fieldConfig['output'] ?? []);

        $statusData = null;
        if (($fieldConfig['include_status'] ?? true) === true) {
            $statusData = [
                'label' => $status->label,
                'value' => $status->value,
                'is_terminal' => $status->is_terminal,
            ];
        }

        return [
            'data' => [
                'table' => [
                    'id' => $table->id,
                    'name' => $table->name,
                    'slug' => $table->slug,
                ],
                'row' => [
                    'id' => $row->id,
                    'uuid' => $row->uuid,
                    'pending_callback' => $requiresCallback,
                    'created_at' => $row->created_at?->toISOString(),
                    'updated_at' => $row->updated_at?->toISOString(),
                ],
                'input' => $inputData,
                'output' => $outputData,
                'meta' => $row->meta_data ?? [],
                'status' => $statusData,
                'callback' => $this->buildCallbackInfo($table->slug, $callbackConfig, $row->uuid, $requiresCallback),
            ],
        ];
    }

    private function filterData(array $data, array $allowedKeys): array
    {
        if (empty($allowedKeys)) {
            return $data;
        }

        return Arr::only($data, $allowedKeys);
    }

    private function buildCallbackInfo(string $slug, array $callbackConfig, string $uuid, bool $requiresCallback): ?array
    {
        if (!$requiresCallback) {
            return null;
        }

        $path = trim($callbackConfig['path'], '/');
        $callbackUrl = '/automation-' . $slug . '/' . $path . '/' . $uuid;

        return [
            'method' => strtoupper($callbackConfig['method'] ?? 'POST'),
            'path' => $path,
            'url' => $callbackUrl,
        ];
    }

    private function sendRequest(string $method, array $webhookConfig, array $payload)
    {
        $url = $webhookConfig['url'];
        $authorization = $webhookConfig['authorization'] ?? [];
        $headers = $this->normalizeHeaders($webhookConfig['headers'] ?? []);
        $client = Http::timeout(15);

        if (!empty($headers)) {
            $client = $client->withHeaders($headers);
        }

        switch ($authorization['type'] ?? 'none') {
            case 'bearer':
                $client = $client->withToken($authorization['token'] ?? '');
                break;
            case 'basic':
                $client = $client->withBasicAuth(
                    $authorization['username'] ?? '',
                    $authorization['password'] ?? ''
                );
                break;
            case 'api_key_header':
                $headerName = $authorization['header_name'] ?? 'X-API-Key';
                $client = $client->withHeaders([
                    $headerName => $authorization['token'] ?? '',
                ]);
                break;
            case 'api_key_query':
                $queryName = $authorization['query_name'] ?? 'api_key';
                $token = $authorization['token'] ?? '';
                $separator = str_contains($url, '?') ? '&' : '?';
                $url .= $separator . urlencode($queryName) . '=' . urlencode($token);
                break;
        }

        if ($method === 'GET') {
            return $client->get($url, $payload['data'] ?? []);
        }

        return $client->send($method, $url, ['json' => $payload]);
    }

    private function normalizeHeaders(array $headers): array
    {
        $normalized = [];

        foreach ($headers as $key => $value) {
            if (is_int($key)) {
                continue;
            }
            if ($value === null) {
                continue;
            }
            $normalized[$key] = $value;
        }

        return $normalized;
    }
}

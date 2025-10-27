<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\WorkflowNode;
use App\Models\WorkflowExecution;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    public function handle(Request $request, $path)
    {
        // Find active workflows with webhook nodes matching this path
        $webhookNodes = WorkflowNode::where('type', 'webhook')
            ->whereJsonContains('config->path', $path)
            ->whereHas('workflow', function ($query) {
                $query->where('active', true);
            })
            ->with('workflow')
            ->get();

        if ($webhookNodes->isEmpty()) {
            return response()->json([
                'message' => 'Webhook not found or workflow is inactive'
            ], 404);
        }

        // Process the webhook
        $responses = [];
        foreach ($webhookNodes as $webhookNode) {
            $workflow = $webhookNode->workflow;
            $config = $webhookNode->config ?? [];

            // Check webhook authentication if configured
            if (!empty($config['auth']) && $config['auth'] !== 'none') {
                if (!$this->validateWebhookAuth($request, $config)) {
                    // Return 401 Unauthorized if auth fails
                    return response()->json([
                        'message' => 'Unauthorized: Invalid authentication credentials'
                    ], 401);
                }
            }

            // Create execution record
            $execution = WorkflowExecution::create([
                'workflow_id' => $workflow->id,
                'trigger_type' => 'webhook',
                'status' => 'running',
                'input_data' => $request->all(),
                'started_at' => now(),
            ]);

            try {
                // Log the webhook request
                Log::info('Webhook triggered', [
                    'execution_id' => $execution->id,
                    'workflow_id' => $workflow->id,
                    'path' => $path,
                    'method' => $request->method(),
                    'data' => $request->all(),
                ]);

                // Execute the workflow
                $startTime = microtime(true);
                $nodeResults = $this->executeWorkflow($workflow, $request);
                $endTime = microtime(true);
                $duration = round(($endTime - $startTime) * 1000); // Convert to milliseconds

                // Get final output from the last node
                $finalOutput = null;
                if (!empty($nodeResults)) {
                    // Get the last node's output
                    $lastNodeResult = end($nodeResults);
                    $finalOutput = is_array($lastNodeResult) && isset($lastNodeResult['output'])
                        ? $lastNodeResult['output']
                        : $lastNodeResult;
                }

                // Update execution record with success
                $execution->update([
                    'status' => 'success',
                    'output_data' => $finalOutput,
                    'node_results' => $nodeResults,
                    'duration_ms' => $duration,
                    'finished_at' => now(),
                ]);

                $responses[] = [
                    'execution_id' => $execution->id,
                    'workflow_id' => $workflow->id,
                    'workflow_name' => $workflow->name,
                    'status' => 'completed',
                    'duration_ms' => $duration,
                ];
            } catch (\Exception $e) {
                // Update execution record with failure
                $execution->update([
                    'status' => 'failed',
                    'error_message' => $e->getMessage(),
                    'finished_at' => now(),
                ]);

                Log::error('Workflow execution failed', [
                    'execution_id' => $execution->id,
                    'workflow_id' => $workflow->id,
                    'error' => $e->getMessage(),
                ]);

                $responses[] = [
                    'execution_id' => $execution->id,
                    'workflow_id' => $workflow->id,
                    'workflow_name' => $workflow->name,
                    'status' => 'failed',
                    'error' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'message' => 'Webhook processed successfully',
            'processed_workflows' => $responses
        ]);
    }

    private function executeWorkflow($workflow, $webhookRequest)
    {
        $nodes = $workflow->nodes ?? [];
        $edges = $workflow->edges ?? [];

        // Load node configurations from database
        $nodeConfigs = WorkflowNode::where('workflow_id', $workflow->id)
            ->get()
            ->keyBy('node_id')
            ->toArray();

        // Merge configs from database into nodes array
        foreach ($nodes as &$node) {
            if (isset($nodeConfigs[$node['id']])) {
                $node['data']['config'] = $nodeConfigs[$node['id']]['config'];
            }
        }

        // Build execution order from edges
        $executionOrder = $this->buildExecutionOrder($nodes, $edges);

        // Node outputs indexed by node ID
        $nodeOutputs = [];
        // Store full execution details for each node
        $nodeResults = [];

        // Execute each node in order
        foreach ($executionOrder as $node) {
            try {
                // Get input data for this node
                $inputData = $this->getNodeInputData($node['id'], $edges, $nodeOutputs);

                Log::info('Executing node', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'node_type' => $node['type'],
                    'input_count' => count($inputData),
                    'input_preview' => json_encode(array_slice($inputData, 0, 1)),
                ]);

                // Execute the node
                $output = $this->executeNode($node, $inputData, $webhookRequest);

                // Store the output
                $nodeOutputs[$node['id']] = $output;

                // Store full execution details including input
                $nodeResults[$node['id']] = [
                    'input' => $inputData,
                    'output' => $output,
                ];

                Log::info('Node executed successfully', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'node_type' => $node['type'],
                    'input_count' => count($inputData),
                    'input_preview' => array_slice($inputData, 0, 2), // Preview first 2 inputs
                    'output_preview' => is_array($output) ? array_slice($output, 0, 5) : $output,
                ]);
            } catch (\Exception $e) {
                Log::error('Error executing node', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'error' => $e->getMessage(),
                ]);

                // Continue with other nodes or break on error
                $nodeOutputs[$node['id']] = [
                    'error' => $e->getMessage(),
                ];
                $nodeResults[$node['id']] = [
                    'input' => $inputData ?? [],
                    'output' => [
                        'error' => $e->getMessage(),
                    ],
                ];
            }
        }

        return $nodeResults;
    }

    private function buildExecutionOrder($nodes, $edges)
    {
        // Find starting nodes (no incoming edges)
        $startingNodes = collect($nodes)->filter(function ($node) use ($edges) {
            return !collect($edges)->contains('target', $node['id']);
        })->values()->toArray();

        // Build order using BFS
        $order = [];
        $visited = [];
        $queue = $startingNodes;

        while (!empty($queue)) {
            $node = array_shift($queue);

            if (isset($visited[$node['id']])) {
                continue;
            }

            $visited[$node['id']] = true;
            $order[] = $node;

            // Find connected nodes (outgoing edges)
            $nextNodes = collect($edges)
                ->filter(function ($edge) use ($node) {
                    return $edge['source'] === $node['id'];
                })
                ->map(function ($edge) use ($nodes) {
                    return collect($nodes)->firstWhere('id', $edge['target']);
                })
                ->filter()
                ->values()
                ->toArray();

            $queue = array_merge($queue, $nextNodes);
        }

        return $order;
    }

    private function getNodeInputData($nodeId, $edges, $nodeOutputs)
    {
        // Collect ALL upstream nodes using BFS (not just directly connected)
        $upstreamNodes = $this->collectAllUpstreamNodes($nodeId, $edges);

        // Get outputs from ALL upstream nodes
        $inputData = [];
        foreach ($upstreamNodes as $upstreamId) {
            if (isset($nodeOutputs[$upstreamId])) {
                $inputData[] = $nodeOutputs[$upstreamId];
            }
        }

        Log::info('Node input data collected', [
            'node_id' => $nodeId,
            'upstream_nodes' => $upstreamNodes,
            'input_count' => count($inputData),
        ]);

        return $inputData;
    }

    private function collectAllUpstreamNodes($nodeId, $edges)
    {
        $upstream = [];
        $visited = [];
        $queue = [$nodeId];

        while (!empty($queue)) {
            $current = array_shift($queue);

            if (isset($visited[$current])) {
                continue;
            }

            $visited[$current] = true;

            // Find all nodes that point to current node
            $incomingNodes = collect($edges)
                ->filter(function ($edge) use ($current) {
                    return $edge['target'] === $current;
                })
                ->map(function ($edge) {
                    return $edge['source'];
                })
                ->filter()
                ->toArray();

            foreach ($incomingNodes as $source) {
                $upstream[] = $source;
                if (!isset($visited[$source])) {
                    $queue[] = $source;
                }
            }
        }

        return $upstream;
    }

    private function executeNode($node, $inputData, $webhookRequest)
    {
        $type = $node['type'] ?? 'unknown';
        $config = $node['data']['config'] ?? [];

        switch ($type) {
            case 'webhook':
                // For webhook nodes, return the webhook request data
                return [
                    'body' => $webhookRequest->all(),
                    'headers' => $webhookRequest->headers->all(),
                    'method' => $webhookRequest->method(),
                    'url' => $webhookRequest->url(),
                ];

            case 'http':
                return $this->executeHttpNode($config, $inputData);

            case 'code':
                // For code nodes, you would execute custom code
                // This is a placeholder
                return ['message' => 'Code node executed', 'input' => $inputData];

            default:
                // Pass through input data
                return $inputData[0] ?? [];
        }
    }

    private function executeHttpNode($config, $inputData)
    {
        // Resolve variables in URL
        $originalUrl = $config['url'] ?? '';
        $url = $this->resolveVariables($originalUrl, $inputData);

        Log::info('URL resolution', [
            'original' => $originalUrl,
            'resolved' => $url,
        ]);

        // Build query parameters
        $queryParams = [];
        if (!empty($config['queryParams'])) {
            foreach ($config['queryParams'] as $param) {
                $name = $this->resolveVariables($param['name'] ?? '', $inputData);
                $value = $this->resolveVariables($param['value'] ?? '', $inputData);
                if ($name) {
                    $queryParams[$name] = $value;
                }
            }
            if (!empty($queryParams)) {
                $url .= '?' . http_build_query($queryParams);
            }
        }

        // Build headers
        $headers = [];
        if (!empty($config['headers'])) {
            foreach ($config['headers'] as $header) {
                $name = $this->resolveVariables($header['name'] ?? '', $inputData);
                $value = $this->resolveVariables($header['value'] ?? '', $inputData);
                if ($name) {
                    $headers[$name] = $value;
                }
            }
        }

        // Add authentication
        if (!empty($config['auth']) && $config['auth'] !== 'none') {
            $authType = $config['authType'] ?? 'bearer';

            switch ($authType) {
                case 'bearer':
                    if (!empty($config['apiKeyValue'])) {
                        $token = $this->resolveVariables($config['apiKeyValue'], $inputData);
                        $headers['Authorization'] = 'Bearer ' . $token;
                    }
                    break;

                case 'basic':
                    if (!empty($config['username']) && !empty($config['password'])) {
                        $username = $this->resolveVariables($config['username'], $inputData);
                        $password = $this->resolveVariables($config['password'], $inputData);
                        $credentials = base64_encode($username . ':' . $password);
                        $headers['Authorization'] = 'Basic ' . $credentials;
                    }
                    break;

                case 'digest':
                    if (!empty($config['username']) && !empty($config['password'])) {
                        $username = $this->resolveVariables($config['username'], $inputData);
                        $password = $this->resolveVariables($config['password'], $inputData);
                        // Digest auth requires challenge-response, simplified here
                        $headers['Authorization'] = 'Digest username="' . $username . '", password="' . $password . '"';
                    }
                    break;

                case 'oauth2':
                    if (!empty($config['apiKeyValue'])) {
                        $token = $this->resolveVariables($config['apiKeyValue'], $inputData);
                        $headers['Authorization'] = 'Bearer ' . $token;
                    }
                    break;

                case 'apiKey':
                    if (!empty($config['apiKeyName']) && !empty($config['apiKeyValue'])) {
                        $keyName = $this->resolveVariables($config['apiKeyName'], $inputData);
                        $keyValue = $this->resolveVariables($config['apiKeyValue'], $inputData);
                        $headers[$keyName] = $keyValue;
                    }
                    break;

                case 'custom':
                    if (!empty($config['customHeaderName']) && !empty($config['customHeaderValue'])) {
                        $headerName = $this->resolveVariables($config['customHeaderName'], $inputData);
                        $headerValue = $this->resolveVariables($config['customHeaderValue'], $inputData);
                        $headers[$headerName] = $headerValue;
                    }
                    break;
            }

            // Backward compatibility with old credential field
            if (!empty($config['credential'])) {
                $credential = $this->resolveVariables($config['credential'], $inputData);

                if ($config['auth'] === 'header') {
                    $headers['Authorization'] = 'Bearer ' . $credential;
                } elseif ($config['auth'] === 'query') {
                    // Query auth would be handled separately in URL
                }
            }
        }

        // Build body for POST, PUT, PATCH
        $body = null;
        if (in_array(strtoupper($config['method'] ?? 'GET'), ['POST', 'PUT', 'PATCH'])) {
            if (!empty($config['bodyContent'])) {
                $bodyContent = $this->resolveVariables($config['bodyContent'], $inputData);

                if (!empty($config['bodyType']) && $config['bodyType'] === 'json') {
                    $body = json_encode(json_decode($bodyContent, true) ?: $bodyContent);
                    $headers['Content-Type'] = 'application/json';
                } else {
                    $body = $bodyContent;
                }
            }
        }

        try {
            // Make HTTP request
            $method = strtoupper($config['method'] ?? 'GET');

            $response = Http::withHeaders($headers)->send($method, $url, [
                'body' => $body,
            ]);

            $responseBody = $response->body();
            try {
                $responseData = json_decode($responseBody, true);
            } catch (\Exception $e) {
                $responseData = $responseBody;
            }

            return [
                'status' => $response->status(),
                'headers' => $response->headers(),
                'body' => $responseData,
            ];
        } catch (\Exception $e) {
            Log::error('HTTP Request failed', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);

            return [
                'error' => 'HTTP request failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    private function resolveVariables($template, $inputData)
    {
        if (!is_string($template)) {
            return $template;
        }

        // Replace {{variable}} patterns
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($inputData) {
            $path = $matches[1];
            $value = $this->getValueFromPath($path, $inputData);

            Log::info('Resolving variable', [
                'path' => $path,
                'value' => $value,
                'resolved' => $value !== null ? $value : $matches[0],
            ]);

            return $value !== null ? $value : $matches[0];
        }, $template);
    }

    private function getValueFromPath($path, $inputData)
    {
        if (empty($inputData) || !is_array($inputData)) {
            return null;
        }

        Log::info('Getting value from path', [
            'path' => $path,
            'inputData_keys' => array_keys($inputData),
            'inputData_sample' => isset($inputData[0]) ? array_keys($inputData[0] ?? []) : [],
        ]);

        // Handle paths like "input-0.headers.content-length"
        $parts = explode('.', $path);

        if (isset($parts[0]) && strpos($parts[0], 'input-') === 0) {
            $index = (int) str_replace('input-', '', $parts[0]);

            if (isset($inputData[$index])) {
                $value = $inputData[$index];

                // Navigate through the object path
                for ($i = 1; $i < count($parts); $i++) {
                    Log::info('Navigating path', [
                        'current_path' => $parts[$i],
                        'value_is_array' => is_array($value),
                        'available_keys' => is_array($value) ? array_keys($value) : [],
                    ]);

                    if (is_array($value) && isset($value[$parts[$i]])) {
                        $value = $value[$parts[$i]];
                        // Handle array values (e.g., Laravel headers are arrays)
                        if (is_array($value) && count($value) === 1 && isset($value[0])) {
                            $value = $value[0];
                        }
                    } else {
                        // Try case-insensitive matching for headers
                        if (is_array($value) && $i === count($parts) - 1) { // Only for last part
                            foreach ($value as $key => $val) {
                                if (strtolower($key) === strtolower($parts[$i])) {
                                    $value = $val;
                                    if (is_array($value) && count($value) === 1 && isset($value[0])) {
                                        $value = $value[0];
                                    }
                                    break;
                                }
                            }
                        } else {
                            return null;
                        }
                    }
                }

                return $value;
            }
        }

        // Try to find in any input
        foreach ($inputData as $input) {
            $value = $input;
            foreach ($parts as $part) {
                if (is_array($value) && isset($value[$part])) {
                    $value = $value[$part];
                    // Handle array values (e.g., Laravel headers are arrays)
                    if (is_array($value) && count($value) === 1 && isset($value[0])) {
                        $value = $value[0];
                    }
                } else {
                    $value = null;
                    break;
                }
            }
            if ($value !== null) {
                return $value;
            }
        }

        return null;
    }

    /**
     * Validate webhook authentication
     */
    private function validateWebhookAuth(Request $request, $config)
    {
        $authType = $config['authType'] ?? 'bearer';

        switch ($authType) {
            case 'bearer':
                $expectedToken = $config['apiKeyValue'] ?? '';
                // Remove "Bearer " prefix if present in stored token
                $expectedToken = str_replace('Bearer ', '', $expectedToken);

                $authHeader = $request->header('Authorization', '');
                $providedToken = str_replace('Bearer ', '', $authHeader);
                return !empty($expectedToken) && hash_equals($expectedToken, $providedToken);

            case 'basic':
                $expectedUsername = $config['username'] ?? '';
                $expectedPassword = $config['password'] ?? '';
                $authHeader = $request->header('Authorization', '');

                if (strpos($authHeader, 'Basic ') !== 0) {
                    return false;
                }

                $credentials = base64_decode(str_replace('Basic ', '', $authHeader));
                list($username, $password) = explode(':', $credentials, 2);

                return hash_equals($expectedUsername, $username) &&
                       hash_equals($expectedPassword, $password);

            case 'apiKey':
                $keyName = $config['apiKeyName'] ?? '';
                $expectedKeyValue = $config['apiKeyValue'] ?? '';
                $providedKeyValue = $request->header($keyName, '');

                if (empty($providedKeyValue)) {
                    $providedKeyValue = $request->input($keyName, '');
                }

                return !empty($expectedKeyValue) && hash_equals($expectedKeyValue, $providedKeyValue);

            case 'custom':
                $headerName = $config['customHeaderName'] ?? '';
                $expectedHeaderValue = $config['customHeaderValue'] ?? '';
                $providedHeaderValue = $request->header($headerName, '');

                return !empty($expectedHeaderValue) && hash_equals($expectedHeaderValue, $providedHeaderValue);

            case 'oauth2':
                $expectedToken = $config['apiKeyValue'] ?? '';
                $authHeader = $request->header('Authorization', '');
                $providedToken = str_replace('Bearer ', '', $authHeader);
                return !empty($expectedToken) && hash_equals($expectedToken, $providedToken);

            case 'digest':
                // Digest auth requires a challenge-response mechanism
                // For simplicity, we'll validate username/password from the request
                $expectedUsername = $config['username'] ?? '';
                $expectedPassword = $config['password'] ?? '';

                // Try to get credentials from various sources
                $username = $request->input('username', '');
                $password = $request->input('password', '');

                // If not in request body, try headers
                if (empty($username)) {
                    $authHeader = $request->header('Authorization', '');
                    // Parse Digest header if present
                    if (strpos($authHeader, 'Digest ') === 0) {
                        // This is a simplified check - real Digest auth is more complex
                        return hash_equals($expectedUsername, 'username') && hash_equals($expectedPassword, 'password');
                    }
                }

                return !empty($expectedUsername) && hash_equals($expectedUsername, $username) &&
                       !empty($expectedPassword) && hash_equals($expectedPassword, $password);

            default:
                return false; // Unknown auth type
        }
    }

    /**
     * Start listening for webhook test
     */
    public function startTestListen(Request $request, $workflowId)
    {
        $testRunId = uniqid('test_', true);

        // Store test listening state in cache for 5 minutes
        \Illuminate\Support\Facades\Cache::put("webhook_test_listening_{$testRunId}", [
            'workflow_id' => $workflowId,
            'node_id' => $request->input('node_id'),
            'path' => $request->input('path'),
            'method' => $request->input('method'),
            'auth' => $request->input('auth'),
            'auth_type' => $request->input('auth_type'),
            'auth_config' => $request->input('auth_config'),
            'started_at' => now(),
        ], now()->addMinutes(5));

        // Track this test run ID
        $cacheKeys = \Illuminate\Support\Facades\Cache::get('webhook_test_keys', []);
        $cacheKeys[] = $testRunId;
        \Illuminate\Support\Facades\Cache::put('webhook_test_keys', $cacheKeys, now()->addMinutes(10));

        return response()->json([
            'test_run_id' => $testRunId,
            'message' => 'Listening for webhook requests'
        ]);
    }

    /**
     * Get test webhook status
     */
    public function getTestStatus(Request $request, $workflowId, $testRunId)
    {
        // Check if stopped
        $stopped = \Illuminate\Support\Facades\Cache::get("webhook_test_stopped_{$testRunId}");
        if ($stopped) {
            return response()->json([
                'status' => 'stopped',
                'message' => 'Test stopped by user'
            ]);
        }

        $cacheKey = "webhook_test_listening_{$testRunId}";
        $listeningData = \Illuminate\Support\Facades\Cache::get($cacheKey);

        if (!$listeningData) {
            return response()->json([
                'status' => 'not_found',
                'message' => 'Test session not found'
            ], 404);
        }

        // Check if data was received (don't delete yet, keep it for polling)
        $receivedDataKey = "webhook_test_received_{$testRunId}";
        $receivedData = \Illuminate\Support\Facades\Cache::get($receivedDataKey);

        if ($receivedData) {
            return response()->json([
                'status' => 'received',
                'data' => $receivedData
            ]);
        }

        // Check for timeout
        $startedAt = \Carbon\Carbon::parse($listeningData['started_at']);
        if ($startedAt->addMinutes(2)->isPast()) {
            \Illuminate\Support\Facades\Cache::forget($cacheKey);

            return response()->json([
                'status' => 'timeout',
                'message' => 'Test timeout'
            ]);
        }

        return response()->json([
            'status' => 'listening',
            'message' => 'Waiting for webhook request'
        ]);
    }

    /**
     * Stop webhook test listening
     */
    public function stopTestListen(Request $request, $workflowId, $testRunId)
    {
        // Mark as stopped (set a flag)
        \Illuminate\Support\Facades\Cache::put("webhook_test_stopped_{$testRunId}", true, now()->addMinutes(1));

        $cacheKey = "webhook_test_listening_{$testRunId}";
        \Illuminate\Support\Facades\Cache::forget($cacheKey);

        $receivedDataKey = "webhook_test_received_{$testRunId}";
        \Illuminate\Support\Facades\Cache::forget($receivedDataKey);

        // Remove from tracked keys
        $cacheKeys = \Illuminate\Support\Facades\Cache::get('webhook_test_keys', []);
        $cacheKeys = array_filter($cacheKeys, fn($key) => $key !== $testRunId);
        \Illuminate\Support\Facades\Cache::put('webhook_test_keys', array_values($cacheKeys), now()->addMinutes(10));

        return response()->json([
            'message' => 'Stopped listening'
        ]);
    }

    /**
     * Validate test webhook authentication
     */
    private function validateTestWebhookAuth(Request $request, $listeningData)
    {
        $authType = $listeningData['auth_type'] ?? 'bearer';
        $authConfig = $listeningData['auth_config'] ?? [];

        switch ($authType) {
            case 'bearer':
                $expectedToken = $authConfig['apiKeyValue'] ?? '';
                $expectedToken = str_replace('Bearer ', '', $expectedToken);
                $authHeader = $request->header('Authorization', '');
                $providedToken = str_replace('Bearer ', '', $authHeader);
                return !empty($expectedToken) && hash_equals($expectedToken, $providedToken);

            case 'basic':
                $expectedUsername = $authConfig['username'] ?? '';
                $expectedPassword = $authConfig['password'] ?? '';
                $authHeader = $request->header('Authorization', '');

                if (strpos($authHeader, 'Basic ') !== 0) {
                    return false;
                }

                $credentials = base64_decode(str_replace('Basic ', '', $authHeader));
                list($username, $password) = explode(':', $credentials, 2);

                return hash_equals($expectedUsername, $username) &&
                       hash_equals($expectedPassword, $password);

            case 'apiKey':
                $keyName = $authConfig['apiKeyName'] ?? '';
                $expectedKeyValue = $authConfig['apiKeyValue'] ?? '';
                $providedKeyValue = $request->header($keyName, '');

                if (empty($providedKeyValue)) {
                    $providedKeyValue = $request->input($keyName, '');
                }

                return !empty($expectedKeyValue) && hash_equals($expectedKeyValue, $providedKeyValue);

            case 'custom':
                $headerName = $authConfig['customHeaderName'] ?? '';
                $expectedHeaderValue = $authConfig['customHeaderValue'] ?? '';
                $providedHeaderValue = $request->header($headerName, '');

                return !empty($expectedHeaderValue) && hash_equals($expectedHeaderValue, $providedHeaderValue);

            default:
                return true;
        }
    }

    /**
     * Handle test webhook requests
     */
    public function handleTest(Request $request, $path)
    {
        // Check if this is a test webhook request (check all test runs)
        $cacheKeys = \Illuminate\Support\Facades\Cache::get('webhook_test_keys', []);

        foreach ($cacheKeys as $testRunId) {
            $listeningData = \Illuminate\Support\Facades\Cache::get("webhook_test_listening_{$testRunId}");

            if ($listeningData && $listeningData['path'] === $path) {
                // Validate method and auth
                if ($listeningData['method'] !== $request->method()) {
                    continue;
                }

                // Check auth
                if (!empty($listeningData['auth']) && $listeningData['auth'] !== 'none') {
                    if (!$this->validateTestWebhookAuth($request, $listeningData)) {
                        continue;
                    }
                }

                // Check if data was already received (prevent duplicate processing)
                $receivedDataKey = "webhook_test_received_{$testRunId}";
                if (!\Illuminate\Support\Facades\Cache::has($receivedDataKey)) {
                    // Store received data for test
                    \Illuminate\Support\Facades\Cache::put($receivedDataKey, [
                        'method' => $request->method(),
                        'headers' => $request->headers->all(),
                        'body' => $request->all(),
                        'query' => $request->query(),
                        'received_at' => now(),
                    ], now()->addMinutes(1));
                }

                return response()->json([
                    'message' => 'Test webhook received',
                    'test_mode' => true
                ]);
            }
        }

        return response()->json([
            'message' => 'No active test listener for this path'
        ], 404);
    }
}

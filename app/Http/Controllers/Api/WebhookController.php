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

            // Create execution record với snapshot của workflow
            $execution = WorkflowExecution::create([
                'workflow_id' => $workflow->id,
                'trigger_type' => 'webhook',
                'status' => 'running',
                'input_data' => $request->all(),
                'workflow_snapshot' => [
                    'nodes' => $workflow->nodes ?? [],
                    'edges' => $workflow->edges ?? [],
                ],
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
                $executionResult = $this->executeWorkflow($workflow, $request);
                $endTime = microtime(true);
                $duration = round(($endTime - $startTime) * 1000); // Convert to milliseconds

                $nodeResults = $executionResult['node_results'] ?? [];
                $executionOrder = $executionResult['execution_order'] ?? [];

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
                    'execution_order' => $executionOrder,
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
        // Store If node results (true/false) for branch routing
        $ifResults = [];
        // Store full execution details for each node
        $nodeResults = [];
        // Store execution order để hiển thị đúng thứ tự trong History
        $executionOrderList = [];

        // Execute each node in order
        foreach ($executionOrder as $index => $node) {
            try {
                // Get input data for this node (with If branch filtering)
                $inputData = $this->getNodeInputData($node['id'], $edges, $nodeOutputs, $ifResults, $nodes);

                Log::info('Executing node', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'node_type' => $node['type'],
                    'input_count' => count($inputData),
                    'input_preview' => json_encode(array_slice($inputData, 0, 1)),
                ]);

                // Execute the node
                $output = $this->executeNode($node, $inputData, $webhookRequest);

                // If this is an If node, store the result for branch routing
                if ($node['type'] === 'if' && isset($output['result'])) {
                    $ifResults[$node['id']] = $output['result'];
                    Log::info('If node result stored', [
                        'node_id' => $node['id'],
                        'result' => $output['result'] ? 'TRUE' : 'FALSE',
                    ]);
                }

                // Store the output
                $nodeOutputs[$node['id']] = $output;

                // Store full execution details including input
                $nodeResults[$node['id']] = [
                    'input' => $inputData,
                    'output' => $output,
                    'execution_index' => $index, // Thứ tự thực thi
                ];
                
                // Lưu thứ tự thực thi
                $executionOrderList[] = $node['id'];

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
                    'execution_index' => $index,
                ];
                
                // Vẫn lưu vào execution order ngay cả khi lỗi
                $executionOrderList[] = $node['id'];
            }
        }

        return [
            'node_results' => $nodeResults,
            'execution_order' => $executionOrderList,
        ];
    }

    private function buildExecutionOrder($nodes, $edges)
    {
        // Build dependency graph: node_id => [parent_node_ids]
        $dependencies = [];
        $nodeMap = [];
        
        foreach ($nodes as $node) {
            $nodeMap[$node['id']] = $node;
            $dependencies[$node['id']] = [];
        }
        
        // Populate dependencies from edges
        foreach ($edges as $edge) {
            $targetId = $edge['target'];
            $sourceId = $edge['source'];
            
            if (!isset($dependencies[$targetId])) {
                $dependencies[$targetId] = [];
            }
            
            $dependencies[$targetId][] = $sourceId;
        }
        
        Log::info('Dependency graph', [
            'dependencies' => $dependencies,
        ]);
        
        // Topological sort with dependency tracking
        $order = [];
        $completed = [];
        $maxIterations = count($nodes) * 10; // Prevent infinite loop
        $iteration = 0;
        
        while (count($order) < count($nodes) && $iteration < $maxIterations) {
            $iteration++;
            $addedInThisIteration = false;
            
            foreach ($nodes as $node) {
                $nodeId = $node['id'];
                
                // Skip if already in order
                if (in_array($nodeId, $completed)) {
                    continue;
                }
                
                // Check if ALL dependencies are completed
                $allDependenciesCompleted = true;
                foreach ($dependencies[$nodeId] as $depId) {
                    if (!in_array($depId, $completed)) {
                        $allDependenciesCompleted = false;
                        break;
                    }
                }
                
                // If all dependencies are met, add to order
                if ($allDependenciesCompleted) {
                    $order[] = $node;
                    $completed[] = $nodeId;
                    $addedInThisIteration = true;
                    
                    Log::info('Node ready for execution', [
                        'node_id' => $nodeId,
                        'node_type' => $node['type'],
                        'dependencies_met' => $dependencies[$nodeId],
                        'execution_position' => count($order),
                    ]);
                }
            }
            
            // Detect circular dependency
            if (!$addedInThisIteration && count($order) < count($nodes)) {
                Log::error('Circular dependency detected or unreachable nodes', [
                    'completed_nodes' => count($order),
                    'total_nodes' => count($nodes),
                    'remaining' => array_diff(array_column($nodes, 'id'), $completed),
                ]);
                break;
            }
        }
        
        Log::info('Execution order built', [
            'total_nodes' => count($order),
            'order' => array_map(function($n) { 
                return ['id' => $n['id'], 'type' => $n['type']]; 
            }, $order),
        ]);
        
        return $order;
    }

    private function getNodeInputData($nodeId, $edges, $nodeOutputs, $ifResults = [], $nodes = [])
    {
        // Get DIRECT parent edges (with sourceHandle info for If nodes)
        $parentEdges = collect($edges)
            ->filter(function ($edge) use ($nodeId) {
                return $edge['target'] === $nodeId;
            })
            ->values()
            ->toArray();

        // Build node map: id => customName
        $nodeMap = [];
        foreach ($nodes as $node) {
            $nodeMap[$node['id']] = $node['data']['customName'] ?? $node['data']['label'] ?? $node['type'];
        }

        // Collect outputs from parent nodes, filtering by If branch
        $inputData = [];
        foreach ($parentEdges as $edge) {
            $parentId = $edge['source'];
            $sourceHandle = $edge['sourceHandle'] ?? null;

            // Check if output exists
            if (!isset($nodeOutputs[$parentId])) {
                Log::warning('Parent node output not found', [
                    'node_id' => $nodeId,
                    'parent_id' => $parentId,
                ]);
                continue;
            }

            // If parent is an If node, check branch routing
            if (isset($ifResults[$parentId])) {
                $ifResult = $ifResults[$parentId];
                $expectedHandle = $ifResult ? 'true' : 'false';

                // Only add input if sourceHandle matches the If result
                if ($sourceHandle === $expectedHandle) {
                    // For If nodes, pass the 'output' field, not the whole result
                    $output = $nodeOutputs[$parentId];
                    $inputData[] = isset($output['output']) ? $output['output'] : $output;
                    
                    Log::info('If node branch matched', [
                        'node_id' => $nodeId,
                        'parent_id' => $parentId,
                        'if_result' => $ifResult,
                        'source_handle' => $sourceHandle,
                        'branch' => $expectedHandle,
                    ]);
                } else {
                    Log::info('If node branch skipped', [
                        'node_id' => $nodeId,
                        'parent_id' => $parentId,
                        'if_result' => $ifResult,
                        'source_handle' => $sourceHandle,
                        'expected_handle' => $expectedHandle,
                    ]);
                }
            } else {
                // Normal node (not If), just add output
                $inputData[] = $nodeOutputs[$parentId];
            }
        }

        // IMPORTANT: Build a map of nodeName => output for resolving {{NodeName.field}} references
        // This should include ALL upstream nodes, not just direct parents
        $namedInputs = [];
        
        // Get ALL upstream nodes using BFS
        $allUpstreamIds = $this->collectAllUpstreamNodes($nodeId, $edges);
        
        foreach ($allUpstreamIds as $upstreamId) {
            if (isset($nodeOutputs[$upstreamId]) && isset($nodeMap[$upstreamId])) {
                $nodeName = $nodeMap[$upstreamId];
                $namedInputs[$nodeName] = $nodeOutputs[$upstreamId];
            }
        }

        Log::info('Node input data collected', [
            'node_id' => $nodeId,
            'parent_edges_count' => count($parentEdges),
            'input_count' => count($inputData),
            'all_upstream_count' => count($allUpstreamIds),
            'named_inputs' => array_keys($namedInputs),
            'input_preview' => array_map(function($input) {
                if (is_array($input)) {
                    return '[array with ' . count($input) . ' keys: ' . implode(', ', array_slice(array_keys($input), 0, 5)) . ']';
                }
                return gettype($input);
            }, $inputData),
        ]);

        // Merge named inputs into inputData for backward compatibility
        // inputData now contains: [0 => output1, 1 => output2, 'NodeName' => output1, 'OtherNode' => output2]
        // Named inputs include ALL upstream nodes for {{NodeName.field}} resolution
        return array_merge($inputData, $namedInputs);
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

            case 'perplexity':
                return $this->executePerplexityNode($config, $inputData);

            case 'code':
                return $this->executeCodeNode($config, $inputData);

            case 'escape':
                return $this->executeEscapeNode($config, $inputData);

            case 'if':
                return $this->executeIfNode($config, $inputData);

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
            // First try to load credential from database if credentialId is provided
            if (!empty($config['credentialId'])) {
                try {
                    $credential = \App\Models\Credential::find($config['credentialId']);
                    
                    if ($credential) {
                        Log::info('Using credential from database', [
                            'credential_id' => $credential->id,
                            'credential_type' => $credential->type,
                        ]);
                        
                        // Apply credential based on type
                        switch ($credential->type) {
                            case 'bearer':
                                if (!empty($credential->data['token'])) {
                                    $token = $this->resolveVariables($credential->data['token'], $inputData);
                                    $headers['Authorization'] = 'Bearer ' . $token;
                                }
                                break;

                            case 'api_key':
                                if (!empty($credential->data['key']) && !empty($credential->data['headerName'])) {
                                    $keyName = $credential->data['headerName'];
                                    $keyValue = $this->resolveVariables($credential->data['key'], $inputData);
                                    $headers[$keyName] = $keyValue;
                                }
                                break;

                            case 'basic':
                                if (!empty($credential->data['username']) && !empty($credential->data['password'])) {
                                    $username = $this->resolveVariables($credential->data['username'], $inputData);
                                    $password = $this->resolveVariables($credential->data['password'], $inputData);
                                    $credentials = base64_encode($username . ':' . $password);
                                    $headers['Authorization'] = 'Basic ' . $credentials;
                                }
                                break;

                            case 'custom':
                                if (!empty($credential->data['headerName']) && !empty($credential->data['headerValue'])) {
                                    $headerName = $credential->data['headerName'];
                                    $headerValue = $this->resolveVariables($credential->data['headerValue'], $inputData);
                                    $headers[$headerName] = $headerValue;
                                }
                                break;

                            case 'oauth2':
                                if (!empty($credential->data['accessToken'])) {
                                    $token = $this->resolveVariables($credential->data['accessToken'], $inputData);
                                    $headers['Authorization'] = 'Bearer ' . $token;
                                }
                                break;
                        }
                    }
                } catch (\Exception $e) {
                    Log::error('Error loading credential', [
                        'credential_id' => $config['credentialId'],
                        'error' => $e->getMessage(),
                    ]);
                }
            } else {
                // Fallback to old inline auth config
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
        }

        // Build body for POST, PUT, PATCH
        $body = null;
        if (in_array(strtoupper($config['method'] ?? 'GET'), ['POST', 'PUT', 'PATCH'])) {
            if (!empty($config['bodyContent'])) {
                $originalBody = $config['bodyContent'];

                Log::info('Body resolution', [
                    'original' => substr($originalBody, 0, 200),
                    'has_variables' => strpos($originalBody, '{{') !== false,
                ]);

                if (!empty($config['bodyType']) && $config['bodyType'] === 'json') {
                    // For JSON body, use special resolution that preserves JSON validity
                    $bodyContent = $this->resolveVariablesInJSON($originalBody, $inputData);
                    $body = $bodyContent;
                    $headers['Content-Type'] = 'application/json';
                } else {
                    // For non-JSON body, use normal resolution
                    $bodyContent = $this->resolveVariables($originalBody, $inputData);
                    $body = $bodyContent;
                }
                
                Log::info('Final body', [
                    'body_preview' => substr($body, 0, 300),
                ]);
            }
        }

        try {
            // Make HTTP request with timeout
            $method = strtoupper($config['method'] ?? 'GET');
            $timeout = isset($config['timeout']) ? (int)$config['timeout'] : 30;

            // Set socket timeout context if needed (to override PHP default_socket_timeout = 60)
            $originalTimeout = ini_get('default_socket_timeout');
            if ($timeout > 60) {
                ini_set('default_socket_timeout', $timeout);
            }

            try {
                $response = Http::withHeaders($headers)
                    ->timeout($timeout)
                    ->send($method, $url, [
                        'body' => $body,
                    ]);
            } finally {
                // Restore original timeout setting
                if ($timeout > 60) {
                    ini_set('default_socket_timeout', $originalTimeout);
                }
            }

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

    private function executeEscapeNode($config, $inputData)
    {
        try {
            // Get fields configuration
            $fields = $config['fields'] ?? [];
            
            if (empty($fields)) {
                return ['error' => 'No fields configured'];
            }

            Log::info('Executing Escape node', [
                'fields_count' => count($fields),
                'input_count' => count($inputData),
            ]);

            // Build output object
            $result = [];
            
            foreach ($fields as $field) {
                $fieldName = $field['name'] ?? '';
                $fieldValue = $field['value'] ?? '';
                
                if (empty($fieldName) || empty($fieldValue)) {
                    continue;
                }
                
                // STEP 1: Resolve variables in value
                $resolvedValue = $this->resolveVariables($fieldValue, $inputData);
                
                // STEP 2: Escape the resolved value
                $escapedValue = $this->escapeText($resolvedValue);
                
                Log::info('Field processing', [
                    'name' => $fieldName,
                    'original' => substr($fieldValue, 0, 100),
                    'resolved' => substr($resolvedValue, 0, 100),
                    'escaped' => substr($escapedValue, 0, 100),
                ]);
                
                // STEP 3: Set nested field (support a.b.c format)
                $parts = explode('.', $fieldName);
                $current = &$result;
                
                for ($i = 0; $i < count($parts) - 1; $i++) {
                    if (!isset($current[$parts[$i]])) {
                        $current[$parts[$i]] = [];
                    }
                    $current = &$current[$parts[$i]];
                }
                
                $current[$parts[count($parts) - 1]] = $escapedValue;
            }

            Log::info('Escape node output', [
                'output_keys' => array_keys($result),
            ]);

            return $result;
        } catch (\Exception $e) {
            Log::error('Escape node execution failed', [
                'error' => $e->getMessage(),
            ]);

            return [
                'error' => 'Escape node failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Escape text with the specified rules
     */
    private function escapeText($text)
    {
        if (!is_string($text)) {
            return $text;
        }

        return trim(preg_replace('/\s+/', ' ', str_replace(
            ["\t", "\r", "\n", '"', '\\'],
            ['\\t', '\\r', '\\n', '\\"', '\\\\'],
            $text
        )));
    }

    private function executeIfNode($config, $inputData)
    {
        try {
            $conditions = $config['conditions'] ?? [];
            
            if (empty($conditions)) {
                return [
                    'result' => false,
                    'output' => $inputData[0] ?? [],
                    'error' => 'No conditions configured',
                ];
            }

            Log::info('Executing If node', [
                'conditions_count' => count($conditions),
                'combine_operation' => $config['combineOperation'] ?? 'AND',
            ]);

            $conditionResults = [];

            foreach ($conditions as $condition) {
                $dataType = $condition['dataType'] ?? 'string';
                $operator = $condition['operator'] ?? 'equal';
                
                // Resolve value1
                $value1 = $this->resolveVariables($condition['value1'] ?? '', $inputData);
                
                // Resolve value2 if needed
                $value2 = !in_array($operator, ['exists', 'notExists', 'isEmpty', 'isNotEmpty', 'true', 'false'])
                    ? $this->resolveVariables($condition['value2'] ?? '', $inputData)
                    : null;

                // Convert types
                if ($dataType === 'number') {
                    $value1 = is_numeric($value1) ? floatval($value1) : 0;
                    $value2 = is_numeric($value2) ? floatval($value2) : 0;
                } elseif ($dataType === 'boolean') {
                    $value1 = filter_var($value1, FILTER_VALIDATE_BOOLEAN);
                    $value2 = filter_var($value2, FILTER_VALIDATE_BOOLEAN);
                } elseif ($dataType === 'dateTime') {
                    try {
                        $value1 = new \DateTime($value1);
                        $value2 = $value2 ? new \DateTime($value2) : null;
                    } catch (\Exception $e) {
                        Log::error('DateTime conversion failed', ['error' => $e->getMessage()]);
                        $value1 = null;
                        $value2 = null;
                    }
                }

                // Evaluate operator
                $result = $this->evaluateCondition($value1, $operator, $value2, $dataType);
                $conditionResults[] = $result;

                Log::info('Condition evaluated', [
                    'dataType' => $dataType,
                    'operator' => $operator,
                    'value1' => is_object($value1) ? get_class($value1) : $value1,
                    'value2' => is_object($value2) ? get_class($value2) : $value2,
                    'result' => $result,
                ]);
            }

            // Combine results
            $combineOp = $config['combineOperation'] ?? 'AND';
            $finalResult = $combineOp === 'OR'
                ? in_array(true, $conditionResults, true)
                : !in_array(false, $conditionResults, true);

            Log::info('If node result', [
                'final_result' => $finalResult,
                'condition_results' => $conditionResults,
                'combine_operation' => $combineOp,
            ]);

            return [
                'result' => $finalResult,
                'conditionResults' => $conditionResults,
                'output' => $inputData[0] ?? [],
            ];
        } catch (\Exception $e) {
            Log::error('If node execution failed', [
                'error' => $e->getMessage(),
            ]);

            return [
                'result' => false,
                'output' => $inputData[0] ?? [],
                'error' => 'If node failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    private function evaluateCondition($value1, $operator, $value2, $dataType)
    {
        switch ($operator) {
            case 'exists':
                return $value1 !== null && $value1 !== '';
            case 'notExists':
                return $value1 === null || $value1 === '';
            case 'isEmpty':
                return empty($value1) || 
                       (is_string($value1) && trim($value1) === '') ||
                       (is_array($value1) && count($value1) === 0) ||
                       (is_object($value1) && count((array)$value1) === 0);
            case 'isNotEmpty':
                return !empty($value1) && 
                       !(is_string($value1) && trim($value1) === '') &&
                       !(is_array($value1) && count($value1) === 0) &&
                       !(is_object($value1) && count((array)$value1) === 0);
            case 'equal':
                return $value1 == $value2;
            case 'notEqual':
                return $value1 != $value2;
            case 'contains':
                return is_string($value1) && is_string($value2) && str_contains($value1, $value2);
            case 'notContains':
                return is_string($value1) && is_string($value2) && !str_contains($value1, $value2);
            case 'startsWith':
                return is_string($value1) && is_string($value2) && str_starts_with($value1, $value2);
            case 'notStartsWith':
                return is_string($value1) && is_string($value2) && !str_starts_with($value1, $value2);
            case 'endsWith':
                return is_string($value1) && is_string($value2) && str_ends_with($value1, $value2);
            case 'notEndsWith':
                return is_string($value1) && is_string($value2) && !str_ends_with($value1, $value2);
            case 'regex':
                return is_string($value1) && is_string($value2) && preg_match('/' . $value2 . '/', $value1);
            case 'notRegex':
                return is_string($value1) && is_string($value2) && !preg_match('/' . $value2 . '/', $value1);
            case 'gt':
                return $value1 > $value2;
            case 'lt':
                return $value1 < $value2;
            case 'gte':
                return $value1 >= $value2;
            case 'lte':
                return $value1 <= $value2;
            case 'after':
                return $value1 > $value2;
            case 'before':
                return $value1 < $value2;
            case 'afterOrEqual':
                return $value1 >= $value2;
            case 'beforeOrEqual':
                return $value1 <= $value2;
            case 'true':
                return $value1 === true;
            case 'false':
                return $value1 === false;
            case 'lengthEqual':
                return is_array($value1) && count($value1) == $value2;
            case 'lengthNotEqual':
                return is_array($value1) && count($value1) != $value2;
            case 'lengthGt':
                return is_array($value1) && count($value1) > $value2;
            case 'lengthLt':
                return is_array($value1) && count($value1) < $value2;
            case 'lengthGte':
                return is_array($value1) && count($value1) >= $value2;
            case 'lengthLte':
                return is_array($value1) && count($value1) <= $value2;
            default:
                return false;
        }
    }

    private function executeCodeNode($config, $inputData)
    {
        try {
            // Get JavaScript code
            $code = $config['code'] ?? '';
            
            if (empty($code)) {
                return ['error' => 'No code provided'];
            }

            Log::info('Executing Code node', [
                'code_length' => strlen($code),
                'input_count' => count($inputData),
            ]);

            // STEP 1: Pre-resolve {{variable}} syntax in code
            // This allows drag-drop from INPUT to work
            $resolvedCode = $this->resolveVariablesInCode($code, $inputData);
            
            Log::info('Code after variable resolution', [
                'original_preview' => substr($code, 0, 200),
                'resolved_preview' => substr($resolvedCode, 0, 200),
            ]);

            // STEP 2: Prepare input data for JavaScript $input helper
            $inputJson = json_encode($inputData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            
            // STEP 3: Create wrapper code that provides $input helper
            $wrapperCode = <<<JS
(async function() {
    const inputData = $inputJson;
    
    const \$input = {
        first: function() {
            return inputData && inputData.length > 0 ? inputData[0] : null;
        },
        all: function() {
            return inputData || [];
        },
        item: function(index) {
            return inputData && inputData[index] ? inputData[index] : null;
        }
    };
    
    try {
        // User code (with variables already resolved) wrapped in async function
        const userFunction = async function() {
            $resolvedCode
        };
        
        const result = await userFunction();
        
        // Output result as JSON
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(JSON.stringify({
            error: error.message,
            stack: error.stack
        }));
        process.exit(1);
    }
})();
JS;

            // Save code to temporary file (safer than passing via -e for complex code)
            $tempFile = tempnam(sys_get_temp_dir(), 'code_node_');
            file_put_contents($tempFile, $wrapperCode);
            
            // Execute JavaScript using Node.js
            $command = sprintf('node %s 2>&1', escapeshellarg($tempFile));
            
            Log::info('Executing Node.js command', [
                'temp_file' => $tempFile,
                'code_preview' => substr($code, 0, 200),
            ]);
            
            $output = shell_exec($command);
            
            // Clean up temp file
            @unlink($tempFile);
            
            if ($output === null || trim($output) === '') {
                throw new \Exception('No output from JavaScript execution');
            }
            
            Log::info('Node.js raw output', [
                'output' => $output,
            ]);
            
            // Parse JSON output
            $result = json_decode(trim($output), true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                // Check if it's an error output
                if (strpos($output, '"error"') !== false) {
                    throw new \Exception('JavaScript error: ' . $output);
                }
                // If not valid JSON, return as string
                $result = ['result' => trim($output)];
            }
            
            Log::info('Code execution successful', [
                'result_preview' => is_array($result) ? array_keys($result) : gettype($result),
            ]);
            
            return $result;
        } catch (\Exception $e) {
            Log::error('Code node execution failed', [
                'error' => $e->getMessage(),
                'code_preview' => substr($config['code'] ?? '', 0, 200),
            ]);

            return [
                'error' => 'Code execution failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    private function executePerplexityNode($config, $inputData)
    {
        try {
            // Build messages array
            $messages = [];
            
            // Add system message if enabled
            if (!empty($config['systemMessageEnabled']) && !empty($config['systemMessage'])) {
                $systemMessage = $this->resolveVariables($config['systemMessage'], $inputData);
                if ($systemMessage) {
                    $messages[] = [
                        'role' => 'system',
                        'content' => $systemMessage
                    ];
                }
            }

            // Add all user/assistant messages
            if (!empty($config['messages']) && is_array($config['messages'])) {
                foreach ($config['messages'] as $msg) {
                    $content = $this->resolveVariables($msg['content'] ?? '', $inputData);
                    if (!empty($content)) { // Only add non-empty messages
                        $messages[] = [
                            'role' => $msg['role'] ?? 'user',
                            'content' => $content
                        ];
                    }
                }
            }

            // Get credential
            $credentialId = $config['credentialId'] ?? null;
            if (!$credentialId) {
                throw new \Exception('Perplexity API credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential || !isset($credential->data['headerValue'])) {
                throw new \Exception('Invalid Perplexity credential configuration');
            }

            // Build request body
            $requestBody = [
                'model' => $config['model'] ?? 'sonar',
                'messages' => $messages,
            ];

            // Add advanced options if any
            if (!empty($config['advancedOptions']) && is_array($config['advancedOptions'])) {
                foreach ($config['advancedOptions'] as $key => $value) {
                    // Convert value types appropriately
                    if (is_numeric($value)) {
                        $requestBody[$key] = strpos($value, '.') !== false 
                            ? floatval($value) 
                            : intval($value);
                    } else {
                        $requestBody[$key] = $value;
                    }
                }
            }

            Log::info('Perplexity API Request', [
                'model' => $requestBody['model'],
                'messages_count' => count($messages),
                'has_advanced_options' => !empty($config['advancedOptions']),
            ]);

            // Build headers
            $headers = [
                'Content-Type' => 'application/json',
                $credential->data['headerName'] ?? 'Authorization' => $credential->data['headerValue'],
            ];

            // Get timeout from config (check both config.timeout and advancedOptions.timeout)
            $timeout = 60; // Default
            if (isset($config['timeout'])) {
                $timeout = (int)$config['timeout'];
            } elseif (!empty($config['advancedOptions']['timeout'])) {
                $timeout = (int)$config['advancedOptions']['timeout'];
            }

            Log::info('Perplexity timeout', [
                'config_timeout' => $config['timeout'] ?? null,
                'advanced_timeout' => $config['advancedOptions']['timeout'] ?? null,
                'final_timeout' => $timeout,
            ]);

            // Make HTTP request to Perplexity API with timeout
            // Set socket timeout context to ensure it works even if PHP default_socket_timeout is limiting
            $originalTimeout = ini_get('default_socket_timeout');
            if ($timeout > 60) {
                ini_set('default_socket_timeout', $timeout);
            }

            try {
                $response = Http::withHeaders($headers)
                    ->timeout($timeout)
                    ->post('https://api.perplexity.ai/chat/completions', $requestBody);
            } finally {
                // Restore original timeout setting
                if ($timeout > 60) {
                    ini_set('default_socket_timeout', $originalTimeout);
                }
            }

            if (!$response->successful()) {
                Log::error('Perplexity API Error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                
                throw new \Exception('Perplexity API error: ' . $response->body());
            }

            $result = $response->json();

            Log::info('Perplexity API Response', [
                'model' => $result['model'] ?? 'unknown',
                'has_choices' => isset($result['choices']),
                'choices_count' => isset($result['choices']) ? count($result['choices']) : 0,
            ]);

            return $result;
        } catch (\Exception $e) {
            Log::error('Perplexity node execution failed', [
                'error' => $e->getMessage(),
                'config' => $config,
            ]);

            return [
                'error' => 'Perplexity request failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    private function resolveVariables($template, $inputData, $workflow = null)
    {
        if (!is_string($template)) {
            return $template;
        }

        Log::info('Resolving template', [
            'template_preview' => substr($template, 0, 200),
            'input_data_structure' => array_map(function($item) {
                if (is_array($item)) {
                    return '[array with ' . count($item) . ' items]';
                } elseif (is_object($item)) {
                    return '{object}';
                } else {
                    return gettype($item);
                }
            }, $inputData),
        ]);

        // First, replace n8n syntax: {{ $('NodeName').item.json.field }}
        $template = preg_replace_callback('/\{\{\s*\$\(\'([^\']+)\'\)\.item\.json\.([^}]+)\s*\}\}/', function ($matches) use ($inputData, $workflow) {
            $nodeName = trim($matches[1]);
            $path = trim($matches[2]);
            $fullPath = $nodeName . '.' . $path;
            
            $value = $this->getValueFromPath($fullPath, $inputData, $workflow);
            
            Log::info('n8n syntax resolution', [
                'original' => $matches[0],
                'node_name' => $nodeName,
                'path' => $path,
                'value' => $value,
            ]);
            
            return $value !== null ? $value : $matches[0];
        }, $template);

        // Then, replace {{variable}} patterns (preg_replace_callback replaces ALL matches)
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($inputData, $workflow) {
            $path = trim($matches[1]);
            $value = $this->getValueFromPath($path, $inputData, $workflow);

            Log::info('Variable resolution', [
                'original' => $matches[0],
                'path' => $path,
                'found' => $value !== null,
                'value_preview' => $value !== null ? (is_string($value) ? substr($value, 0, 100) : gettype($value)) : 'NULL',
                'resolved_to' => $value !== null ? (is_string($value) ? substr($value, 0, 100) : $value) : $matches[0],
            ]);

            return $value !== null ? $value : $matches[0];
        }, $template);
    }

    /**
     * Resolve variables in JSON body with proper JSON escaping
     */
    private function resolveVariablesInJSON($jsonTemplate, $inputData)
    {
        if (!is_string($jsonTemplate)) {
            return $jsonTemplate;
        }

        // Try to parse as JSON first
        $decoded = json_decode($jsonTemplate, true);
        
        if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
            // Not valid JSON, fallback to normal resolution
            Log::warning('Body is not valid JSON, using normal resolution');
            return $this->resolveVariables($jsonTemplate, $inputData);
        }

        // Recursively resolve variables in the decoded structure
        $resolved = $this->resolveVariablesInArray($decoded, $inputData);
        
        // Encode back to JSON with proper escaping
        return json_encode($resolved, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * Recursively resolve variables in array/object structure
     */
    private function resolveVariablesInArray($data, $inputData)
    {
        if (is_array($data)) {
            $result = [];
            foreach ($data as $key => $value) {
                $result[$key] = $this->resolveVariablesInArray($value, $inputData);
            }
            return $result;
        }
        
        if (is_string($data)) {
            // Check if this string contains {{variable}} patterns
            if (strpos($data, '{{') !== false) {
                // Resolve all variables in this string
                return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($inputData) {
                    $path = trim($matches[1]);
                    $value = $this->getValueFromPath($path, $inputData);
                    
                    // Return the actual value (will be JSON-encoded properly when building final JSON)
                    return $value !== null ? $value : $matches[0];
                }, $data);
            }
        }
        
        return $data;
    }

    /**
     * Resolve variables in JavaScript code with proper escaping
     */
    private function resolveVariablesInCode($code, $inputData)
    {
        if (!is_string($code)) {
            return $code;
        }

        // Replace {{variable}} patterns with JSON-encoded values
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($inputData) {
            $path = $matches[1];
            $value = $this->getValueFromPath($path, $inputData);

            if ($value !== null) {
                // Encode value as JSON for safe JavaScript insertion
                if (is_string($value)) {
                    // String: wrap in quotes and escape
                    return json_encode($value, JSON_UNESCAPED_UNICODE);
                } elseif (is_numeric($value) || is_bool($value)) {
                    // Number/Boolean: direct value
                    return json_encode($value);
                } elseif (is_array($value) || is_object($value)) {
                    // Object/Array: encode as JSON
                    return json_encode($value, JSON_UNESCAPED_UNICODE);
                } else {
                    return 'null';
                }
            }

            // If not found, keep the template (will cause error - user will know variable is invalid)
            return $matches[0];
        }, $code);
    }

    private function getValueFromPath($path, $inputData, $workflow = null)
    {
        if (empty($inputData) || !is_array($inputData)) {
            return null;
        }

        Log::info('Getting value from path', [
            'path' => $path,
            'inputData_keys' => array_keys($inputData),
            'inputData_sample' => isset($inputData[0]) ? array_keys($inputData[0] ?? []) : [],
        ]);

        $parts = explode('.', $path);

        // PRIORITY 1: Try to resolve by node customName (e.g., "Webhook1.body.content")
        // Check if first part is a string key (customName) in inputData
        if (isset($parts[0]) && isset($inputData[$parts[0]]) && !is_numeric($parts[0])) {
            $nodeName = $parts[0];
            $value = $inputData[$nodeName];
            
            Log::info('Found node by customName', [
                'node_name' => $nodeName,
                'remaining_path' => array_slice($parts, 1),
            ]);
            
            // Navigate through the remaining path
            for ($i = 1; $i < count($parts); $i++) {
                $currentPart = $parts[$i];
                
                // Check if this part contains array index like "choices[0]"
                if (preg_match('/^([^\[]+)\[(\d+)\]$/', $currentPart, $matches)) {
                    $key = $matches[1];
                    $arrayIndex = (int) $matches[2];
                    
                    if (is_array($value) && isset($value[$key]) && is_array($value[$key]) && isset($value[$key][$arrayIndex])) {
                        $value = $value[$key][$arrayIndex];
                    } else {
                        return null;
                    }
                } else {
                    // Normal key access
                    if (is_array($value) && isset($value[$currentPart])) {
                        $value = $value[$currentPart];
                        // Handle array values (e.g., Laravel headers are arrays)
                        if (is_array($value) && count($value) === 1 && isset($value[0])) {
                            $value = $value[0];
                        }
                    } else {
                        return null;
                    }
                }
            }
            
            return $value;
        }

        // PRIORITY 2: Handle paths like "input-0.headers.content-length" or "input-0.choices[0].message.content" or "input-0[0].test"
        if (isset($parts[0]) && strpos($parts[0], 'input-') === 0) {
            // Check if first part has array index like "input-0[0]"
            if (preg_match('/^input-(\d+)\[(\d+)\]$/', $parts[0], $matches)) {
                $inputIndex = (int) $matches[1];
                $arrayIndex = (int) $matches[2];
                
                Log::info('Path starts with input array index', [
                    'original' => $parts[0],
                    'input_index' => $inputIndex,
                    'array_index' => $arrayIndex,
                ]);
                
                if (isset($inputData[$inputIndex]) && is_array($inputData[$inputIndex]) && isset($inputData[$inputIndex][$arrayIndex])) {
                    $value = $inputData[$inputIndex][$arrayIndex];
                } else {
                    return null;
                }
            } else {
                // Normal input-X without array index
                $index = (int) str_replace('input-', '', $parts[0]);

                if (isset($inputData[$index])) {
                    $value = $inputData[$index];
                } else {
                    return null;
                }
            }

            if ($value !== null) {

                // Navigate through the object path
                for ($i = 1; $i < count($parts); $i++) {
                    $currentPart = $parts[$i];
                    
                    // Check if this part contains array index like "choices[0]"
                    if (preg_match('/^([^\[]+)\[(\d+)\]$/', $currentPart, $matches)) {
                        $key = $matches[1];
                        $arrayIndex = (int) $matches[2];
                        
                        Log::info('Navigating path with array index', [
                            'original_part' => $currentPart,
                            'key' => $key,
                            'array_index' => $arrayIndex,
                            'value_is_array' => is_array($value),
                            'available_keys' => is_array($value) ? array_keys($value) : [],
                        ]);
                        
                        // First access the key, then the array index
                        if (is_array($value) && isset($value[$key])) {
                            $value = $value[$key];
                            if (is_array($value) && isset($value[$arrayIndex])) {
                                $value = $value[$arrayIndex];
                            } else {
                                return null;
                            }
                        } else {
                            return null;
                        }
                    } else {
                        // Normal key access
                        Log::info('Navigating path', [
                            'current_path' => $currentPart,
                            'value_is_array' => is_array($value),
                            'available_keys' => is_array($value) ? array_keys($value) : [],
                        ]);

                        if (is_array($value) && isset($value[$currentPart])) {
                            $value = $value[$currentPart];
                            // Handle array values (e.g., Laravel headers are arrays)
                            if (is_array($value) && count($value) === 1 && isset($value[0])) {
                                $value = $value[0];
                            }
                        } else {
                            // Try case-insensitive matching for headers
                            if (is_array($value) && $i === count($parts) - 1) { // Only for last part
                                foreach ($value as $key => $val) {
                                    if (strtolower($key) === strtolower($currentPart)) {
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
                }

                return $value;
            }
        }

        // Try to find in any input
        foreach ($inputData as $input) {
            $value = $input;
            foreach ($parts as $part) {
                // Check if this part contains array index
                if (preg_match('/^([^\[]+)\[(\d+)\]$/', $part, $matches)) {
                    $key = $matches[1];
                    $arrayIndex = (int) $matches[2];
                    
                    if (is_array($value) && isset($value[$key]) && is_array($value[$key]) && isset($value[$key][$arrayIndex])) {
                        $value = $value[$key][$arrayIndex];
                    } else {
                        $value = null;
                        break;
                    }
                } else {
                    // Normal key access
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
     * Check if webhook path is duplicate in active workflows
     */
    public function checkPathDuplicate(Request $request)
    {
        $path = $request->input('path');
        $currentWorkflowId = $request->input('workflow_id');
        $currentNodeId = $request->input('node_id');

        if (empty($path)) {
            return response()->json([
                'duplicate' => false,
                'message' => 'Path is empty'
            ]);
        }

        // Find active workflows with webhook nodes matching this path
        $duplicateNodes = WorkflowNode::where('type', 'webhook')
            ->whereJsonContains('config->path', $path)
            ->whereHas('workflow', function ($query) {
                $query->where('active', true);
            })
            ->with(['workflow', 'workflow.user'])
            ->get();

        // Filter out the current node being edited
        $duplicateNodes = $duplicateNodes->filter(function ($node) use ($currentWorkflowId, $currentNodeId) {
            // If it's the same workflow and same node, it's not a duplicate
            if ($node->workflow_id == $currentWorkflowId && $node->node_id == $currentNodeId) {
                return false;
            }
            return true;
        });

        if ($duplicateNodes->isNotEmpty()) {
            $duplicateWorkflow = $duplicateNodes->first()->workflow;
            $owner = $duplicateWorkflow->user;
            
            $ownerInfo = $owner ? "{$owner->name} ({$owner->email})" : "Unknown user";
            
            return response()->json([
                'duplicate' => true,
                'message' => "Path '{$path}' đã được sử dụng trong workflow '{$duplicateWorkflow->name}' (ID: {$duplicateWorkflow->id}) của {$ownerInfo} đang active",
                'workflow_name' => $duplicateWorkflow->name,
                'workflow_id' => $duplicateWorkflow->id,
                'owner_name' => $owner?->name,
                'owner_email' => $owner?->email
            ]);
        }

        return response()->json([
            'duplicate' => false,
            'message' => 'Path is available'
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

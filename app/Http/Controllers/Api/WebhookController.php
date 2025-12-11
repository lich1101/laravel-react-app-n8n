<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\WorkflowNode;
use App\Models\WorkflowExecution;
use App\Models\SystemSetting;
use App\Jobs\ExecuteWorkflowJob;
use App\Jobs\DeleteFileJob;
use App\Services\MemoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Exceptions\WorkflowCancelledException;
use Illuminate\Support\Facades\Queue;

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
            // Create snapshot of workflow at execution time
            $workflowSnapshot = [
                'nodes' => $workflow->nodes ?? [],
                'edges' => $workflow->edges ?? [],
            ];
            
            Log::info('Creating execution with workflow snapshot', [
                'workflow_id' => $workflow->id,
                'nodes_count' => count($workflowSnapshot['nodes']),
                'edges_count' => count($workflowSnapshot['edges']),
            ]);
            
            $execution = WorkflowExecution::create([
                'workflow_id' => $workflow->id,
                'trigger_type' => 'webhook',
                'status' => 'queued',
                'input_data' => $request->all(),
                'workflow_snapshot' => $workflowSnapshot,
                'started_at' => now(),
            ]);

            // Log webhook trigger
            Log::info('Webhook triggered - dispatching to queue', [
                'execution_id' => $execution->id,
                'workflow_id' => $workflow->id,
                'path' => $path,
                'method' => $request->method(),
            ]);

            // Parse request body - handle JSON and form data
            $body = [];
            $contentType = $request->header('Content-Type', '');
            
            // Try to get all data first (works for form data)
            $allData = $request->all();
            
            // If Content-Type is JSON, parse JSON body separately
            if (strpos($contentType, 'application/json') !== false) {
                $rawContent = $request->getContent();
                if (!empty($rawContent)) {
                    $jsonBody = json_decode($rawContent, true);
                    if (json_last_error() === JSON_ERROR_NONE && is_array($jsonBody)) {
                        $body = $jsonBody;
                        // Merge JSON body into allData
                        $allData = array_merge($allData, $body);
                    }
                }
            } else {
                // For form data, body is already in all()
                $body = $allData;
            }
            
            // Log webhook request data
            $webhookData = [
                'all' => $allData,
                'body' => $body,
                'headers' => $request->headers->all(),
                'method' => $request->method(),
                'url' => $request->url(),
            ];
            
            Log::info('Webhook request data before dispatch', [
                'all_count' => count($webhookData['all']),
                'body_count' => count($webhookData['body']),
                'all_data' => $webhookData['all'],
                'body_data' => $webhookData['body'],
                'content_type' => $contentType,
                'raw_content' => $request->getContent(),
            ]);
            
            // Dispatch job to execute workflow asynchronously
            // Concurrency limit will be checked in the Job itself
            $job = new ExecuteWorkflowJob(
                $execution,
                $workflow,
                $webhookData
            );

            $jobId = Queue::push($job);

            if ($jobId) {
                $execution->update([
                    'queue_job_id' => $jobId,
                ]);
            }

            // Return response immediately
            $responses[] = [
                'execution_id' => $execution->id,
                'workflow_id' => $workflow->id,
                'workflow_name' => $workflow->name,
                'status' => 'queued',
                'message' => 'Workflow execution queued successfully',
            ];
        }

        // Check if custom response is enabled
        $firstNode = $webhookNodes->first();
        if ($firstNode && !empty($firstNode->config['customResponseEnabled']) && !empty($firstNode->config['customResponse'])) {
            $customResponse = $this->buildCustomResponse($firstNode->config['customResponse'], $request, $responses);
            return response()->json($customResponse);
        }

        return response()->json([
            'message' => 'Webhook processed successfully',
            'processed_workflows' => $responses
        ]);
    }

    // Public wrapper for Job to call
    public function executeWorkflowPublic($workflow, $webhookRequestData, $triggerType = 'webhook', $existingExecution = null, ?array $resumeContext = null)
    {
        Log::info('executeWorkflowPublic called', [
            'trigger_type' => $triggerType,
            'webhook_data_keys' => array_keys($webhookRequestData),
            'workflow_id' => $workflow->id,
        ]);
        
        if ($existingExecution instanceof WorkflowExecution) {
            $execution = $existingExecution;

            if ($execution->trigger_type !== $triggerType) {
                $execution->update(['trigger_type' => $triggerType]);
            }

            Log::info('Using existing execution record', [
                'execution_id' => $execution->id,
                'trigger_type' => $triggerType,
            ]);
        } else {
            $workflowSnapshot = [
                'nodes' => is_array($workflow->nodes) ? $workflow->nodes : json_decode($workflow->nodes, true),
                'edges' => is_array($workflow->edges) ? $workflow->edges : json_decode($workflow->edges, true),
            ];
            
            $execution = WorkflowExecution::create([
                'workflow_id' => $workflow->id,
                'trigger_type' => $triggerType,
                'status' => 'running',
                'input_data' => $webhookRequestData,
                'workflow_snapshot' => $workflowSnapshot,
                'started_at' => now(),
            ]);
            
            Log::info('Execution record created', [
                'execution_id' => $execution->id,
                'trigger_type' => $triggerType,
            ]);
        }
        
        // Merge body into all if body exists and is different
        $requestData = $webhookRequestData['all'] ?? [];
        $bodyData = $webhookRequestData['body'] ?? [];
        
        // If body exists and is different from all, merge it
        if (!empty($bodyData) && is_array($bodyData)) {
            $requestData = array_merge($requestData, $bodyData);
        }
        
        // Create a mock request object from array
        $request = Request::create(
            $webhookRequestData['url'] ?? '/',
            $webhookRequestData['method'] ?? 'POST',
            $requestData
        );
        
        // Set headers FIRST
        if (isset($webhookRequestData['headers'])) {
            foreach ($webhookRequestData['headers'] as $key => $value) {
                $headerValue = is_array($value) ? $value[0] : $value;
                $request->headers->set($key, $headerValue);
            }
        }
        
        // If Content-Type is JSON and we have body data, set JSON content
        $contentType = $request->header('Content-Type', '');
        if (strpos($contentType, 'application/json') !== false && !empty($bodyData)) {
            // Set JSON content directly
            $request->headers->set('Content-Type', 'application/json');
            // Merge JSON body into request
            $request->merge($bodyData);
            // Also set as input
            foreach ($bodyData as $key => $value) {
                $request->request->set($key, $value);
            }
        }
        
        try {
            $execution->refresh();

            if ($execution->cancel_requested_at || $execution->status === 'cancelled') {
                throw new WorkflowCancelledException('Workflow execution was cancelled before start');
            }

            $result = $this->executeWorkflow($workflow, $request, $execution, $resumeContext);
            
            // Extract execution details from result
            $nodeResults = $result['node_results'] ?? [];
            $executionOrder = $result['execution_order'] ?? [];
            $errorNode = $result['error_node'] ?? null;
            $hasError = $result['has_error'] ?? false;
            
            // Update execution as completed with all details
            $execution->update([
                'status' => $hasError ? 'error' : 'completed',
                'output_data' => $result,
                'node_results' => $nodeResults,
                'execution_order' => $executionOrder,
                'error_node' => $errorNode,
                'finished_at' => now(),
                'duration_ms' => $execution->started_at->diffInMilliseconds(now()),
            ]);
            
            Log::info('Workflow execution completed', [
                'execution_id' => $execution->id,
                'node_results_count' => count($nodeResults),
                'execution_order_count' => count($executionOrder),
                'has_error' => $hasError,
            ]);
            
            return $result;
            
        } catch (WorkflowCancelledException $e) {
            $execution->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'finished_at' => now(),
                'duration_ms' => $execution->started_at
                    ? $execution->started_at->diffInMilliseconds(now())
                    : 0,
            ]);

            Log::info('Workflow execution cancelled by user request', [
                'execution_id' => $execution->id,
                'message' => $e->getMessage(),
            ]);

            throw $e;
        } catch (\Exception $e) {
            // Update execution as failed
            $execution->update([
                'status' => 'error',
                'output_data' => [
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ],
                'error_message' => $e->getMessage(),
                'finished_at' => now(),
                'duration_ms' => $execution->started_at->diffInMilliseconds(now()),
            ]);
            
            throw $e;
        }
    }

    private function executeWorkflow($workflow, $webhookRequest, ?WorkflowExecution $executionRecord = null, ?array $resumeContext = null)
    {
        $nodes = $workflow->nodes ?? [];
        $edges = $workflow->edges ?? [];

        // Load node configurations from database
        // Lấy record mới nhất cho TẤT CẢ các node nếu có duplicate node_id
        // Sắp xếp theo updated_at DESC để record mới nhất lên đầu
        // Chỉ lấy record đầu tiên cho mỗi node_id (record mới nhất)
        $allNodes = WorkflowNode::where('workflow_id', $workflow->id)
            ->orderBy('updated_at', 'desc')
            ->get();
        
        $nodeConfigs = collect();
        foreach ($allNodes as $node) {
            // Chỉ lấy record đầu tiên (mới nhất) cho mỗi node_id
            if (!$nodeConfigs->has($node->node_id)) {
                $nodeConfigs->put($node->node_id, $node);
            }
        }

        $nodeTypeMap = [];
        foreach ($nodes as &$node) {
            $nodeId = $node['id'] ?? null;
            
            // Chỉ dùng config từ workflow_nodes table
            if ($nodeId && $nodeConfigs->has($nodeId)) {
                $workflowNode = $nodeConfigs->get($nodeId);
                
                // DEBUG: Log để kiểm tra config có được load không
                if ($node['type'] === 'gemini') {
                    Log::error('Gemini: DEBUG - Loading config from DB', [
                        'node_id' => $nodeId,
                        'workflow_node_id' => $workflowNode->id ?? 'N/A',
                        'config_is_null' => is_null($workflowNode->config),
                        'config_is_array' => is_array($workflowNode->config),
                        'config_type' => gettype($workflowNode->config),
                        'config_keys' => is_array($workflowNode->config) ? array_keys($workflowNode->config) : 'NOT_ARRAY',
                        'has_credentialId' => is_array($workflowNode->config) && isset($workflowNode->config['credentialId']),
                        'credentialId_value' => is_array($workflowNode->config) ? ($workflowNode->config['credentialId'] ?? 'NOT_SET') : 'NOT_ARRAY',
                        'has_messages' => is_array($workflowNode->config) && isset($workflowNode->config['messages']),
                        'messages_count' => is_array($workflowNode->config) && isset($workflowNode->config['messages']) ? count($workflowNode->config['messages']) : 0,
                        'raw_config' => $workflowNode->config,
                    ]);
                }
                
                $config = $workflowNode->config ?? [];
                $node['data']['config'] = $config;
            } else {
                // Không có trong DB
                $node['data']['config'] = [];
            }
            $nodeTypeMap[$nodeId] = $node['type'] ?? null;
        }
        unset($node);

        // Build execution order from edges
        $executionOrder = $this->buildExecutionOrder($nodes, $edges);

        // Node outputs indexed by node ID
        $nodeOutputs = [];
        // Store If node results (true/false) for branch routing
        $ifResults = [];
        // Store Switch node results (matched output index) for branch routing
        $switchResults = [];
        // Store full execution details for each node
        $nodeResults = [];
        // Store execution order để hiển thị đúng thứ tự trong History
        $executionOrderList = [];
        $prefilledOrder = [];
        // Track error
        $errorNode = null;
        $hasError = false;

        $resumeMode = is_array($resumeContext) && !empty($resumeContext);
        $resumeStartNodeId = $resumeMode ? ($resumeContext['start_node_id'] ?? null) : null;
        $resumeSourceExecutionId = $resumeMode ? ($resumeContext['source_execution_id'] ?? null) : null;
        $resumeSkipNodes = [];

        if ($resumeMode) {
            $previousResults = $resumeContext['node_results'] ?? [];
            $startNodeIndex = null;
            if ($resumeStartNodeId && isset($previousResults[$resumeStartNodeId])) {
                $startNodeIndex = $previousResults[$resumeStartNodeId]['execution_index'] ?? null;
            }

            if (is_array($previousResults)) {
                uasort($previousResults, function ($a, $b) {
                    $indexA = $a['execution_index'] ?? -1;
                    $indexB = $b['execution_index'] ?? -1;
                    return $indexA <=> $indexB;
                });

                foreach ($previousResults as $prevNodeId => $result) {
                    $status = $result['status'] ?? null;
                    if ($status !== 'success') {
                        continue;
                    }

                    $prefilledOrder[] = $prevNodeId;
                    $executionIndex = $result['execution_index'] ?? null;

                    $nodeOutputs[$prevNodeId] = $result['output'] ?? [];
                    $nodeResults[$prevNodeId] = [
                        'input' => $result['input'] ?? [],
                        'output' => $result['output'] ?? [],
                        'execution_index' => $executionIndex,
                        'status' => 'success',
                        'resume_carried' => true,
                        'resume_source_execution_id' => $resumeSourceExecutionId,
                    ];

                    if ($resumeStartNodeId && $prevNodeId !== $resumeStartNodeId) {
                        if ($startNodeIndex !== null && $executionIndex !== null) {
                            if ($executionIndex < $startNodeIndex) {
                                $resumeSkipNodes[$prevNodeId] = true;
                            }
                        } else {
                            $resumeSkipNodes[$prevNodeId] = true;
                        }
                    }

                    $nodeType = $nodeTypeMap[$prevNodeId] ?? null;
                    $nodeOutput = $result['output'] ?? [];

                    if ($nodeType === 'if' && is_array($nodeOutput) && array_key_exists('result', $nodeOutput)) {
                        $ifResults[$prevNodeId] = $nodeOutput['result'];
                    }

                    if ($nodeType === 'switch' && is_array($nodeOutput) && array_key_exists('matchedOutput', $nodeOutput)) {
                        $switchResults[$prevNodeId] = $nodeOutput['matchedOutput'];
                    }
                }
            }

            Log::info('Resume context prepared', [
                'workflow_id' => $workflow->id,
                'execution_id' => $executionRecord?->id,
                'resume_start_node_id' => $resumeStartNodeId,
                'prefilled_nodes' => $prefilledOrder,
            ]);
        }

        // Execute each node in order
        foreach ($executionOrder as $index => $node) {
            if ($executionRecord) {
                $executionRecord->refresh();

                if ($executionRecord->cancel_requested_at || $executionRecord->status === 'cancelled') {
                    Log::info('Cancellation detected during node execution', [
                        'workflow_id' => $workflow->id,
                        'execution_id' => $executionRecord->id,
                        'node_id' => $node['id'],
                    ]);

                    throw new WorkflowCancelledException('Workflow execution cancelled during processing');
                }
            }

            if ($resumeMode && isset($resumeSkipNodes[$node['id']])) {
                Log::info('Skipping node due to resume context', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'reason' => 'previously completed before resume',
                ]);
                continue;
            }

            try {
                // Get input data for this node (with If/Switch branch filtering)
                $inputData = $this->getNodeInputData($node['id'], $edges, $nodeOutputs, $ifResults, $nodes, $switchResults);

                Log::info('Executing node', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'node_type' => $node['type'],
                    'input_count' => count($inputData),
                    'input_preview' => json_encode(array_slice($inputData, 0, 1)),
                ]);

                // Determine if node should execute (skip branches without matched input)
                $hasParentEdges = collect($edges)
                    ->contains(function ($edge) use ($node) {
                        return $edge['target'] === $node['id'];
                    });

                $positionalInputCount = 0;
                foreach ($inputData as $key => $value) {
                    if (is_int($key)) {
                        $positionalInputCount++;
                    }
                }

                if ($hasParentEdges && $positionalInputCount === 0) {
                    Log::info('Skipping node due to no matched branch input', [
                        'workflow_id' => $workflow->id,
                        'node_id' => $node['id'],
                        'node_type' => $node['type'] ?? 'unknown',
                    ]);

                    continue;
                }

                // Execute the node
                $output = $this->executeNode($node, $inputData, $webhookRequest);

                // Check if output contains error
                if (is_array($output) && isset($output['error'])) {
                    throw new \Exception($output['error'] . (isset($output['message']) ? ': ' . $output['message'] : ''));
                }

                // If this is an If node, store the result for branch routing
                if ($node['type'] === 'if' && isset($output['result'])) {
                    $ifResults[$node['id']] = $output['result'];
                    Log::info('If node result stored', [
                        'node_id' => $node['id'],
                        'result' => $output['result'] ? 'TRUE' : 'FALSE',
                    ]);
                }

                // If this is a Switch node, store the matched output for branch routing
                if ($node['type'] === 'switch' && isset($output['matchedOutput'])) {
                    $switchResults[$node['id']] = $output['matchedOutput'];
                    Log::info('Switch node result stored', [
                        'node_id' => $node['id'],
                        'matched_output' => $output['matchedOutput'],
                        'output_name' => $output['outputName'] ?? 'unknown',
                    ]);
                }

                // Store the output
                $nodeOutputs[$node['id']] = $output;

                // Store full execution details including input
                $nodeResults[$node['id']] = [
                    'input' => $inputData,
                    'output' => $output,
                    'execution_index' => $index,
                    'status' => 'success',
                ];
                
                // Lưu thứ tự thực thi
                $executionOrderList[] = $node['id'];

                Log::info('Node executed successfully', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'node_type' => $node['type'],
                ]);
            } catch (\Exception $e) {
                Log::error('Error executing node - STOPPING execution', [
                    'workflow_id' => $workflow->id,
                    'node_id' => $node['id'],
                    'node_type' => $node['type'] ?? 'unknown',
                    'error' => $e->getMessage(),
                ]);

                // Store error node
                $errorNode = $node['id'];
                $hasError = true;

                // Store error in results
                $nodeOutputs[$node['id']] = [
                    'error' => $e->getMessage(),
                ];
                $nodeResults[$node['id']] = [
                    'input' => $inputData ?? [],
                    'output' => [
                        'error' => $e->getMessage(),
                    ],
                    'execution_index' => $index,
                    'status' => 'error',
                    'error_message' => $e->getMessage(),
                ];
                
                // Lưu vào execution order
                $executionOrderList[] = $node['id'];
                
                // STOP execution - không chạy các node tiếp theo
                break;
            }
        }

        if (!empty($prefilledOrder)) {
            $executionOrderList = array_values(array_unique(array_merge($prefilledOrder, $executionOrderList)));
        }

        return [
            'node_results' => $nodeResults,
            'execution_order' => $executionOrderList,
            'error_node' => $errorNode,
            'has_error' => $hasError,
        ];
    }

    private function buildExecutionOrder($nodes, $edges)
    {
        // Find trigger node (starting point) - ưu tiên schedule, nếu không có thì dùng webhook
        $scheduleNode = collect($nodes)->first(fn($n) => $n['type'] === 'schedule');
        $webhookNode = collect($nodes)->first(fn($n) => $n['type'] === 'webhook');
        
        // Chọn trigger node: schedule có ưu tiên cao hơn
        $triggerNode = $scheduleNode ?? $webhookNode;
        
        // If no trigger node, find starting node (node with no incoming edges)
        if (!$triggerNode) {
            Log::info('No trigger node (webhook or schedule) found, looking for starting node');
            
            // Find all nodes that have incoming edges
            $nodesWithIncomingEdges = [];
            foreach ($edges as $edge) {
                $targetId = $edge['target'];
                if (!in_array($targetId, $nodesWithIncomingEdges)) {
                    $nodesWithIncomingEdges[] = $targetId;
                }
            }
            
            // Find nodes that don't have incoming edges (starting nodes)
            $startingNodes = collect($nodes)->filter(function($node) use ($nodesWithIncomingEdges) {
                return !in_array($node['id'], $nodesWithIncomingEdges);
            })->values()->all();
            
            if (empty($startingNodes)) {
                Log::warning('No starting node found in workflow (all nodes have incoming edges or workflow is empty)');
                return [];
            }
            
            // Use the first starting node (or could use all if multiple)
            $triggerNode = $startingNodes[0];
            Log::info('Starting node found (no incoming edges)', [
                'node_id' => $triggerNode['id'],
                'node_type' => $triggerNode['type'] ?? 'unknown',
                'total_starting_nodes' => count($startingNodes),
            ]);
        }
        
        $triggerType = $triggerNode['type'] === 'schedule' ? 'schedule' : ($triggerNode['type'] === 'webhook' ? 'webhook' : 'manual');
        Log::info('Starting node found', [
            'trigger_type' => $triggerType,
            'node_id' => $triggerNode['id'],
            'node_type' => $triggerNode['type'] ?? 'unknown',
        ]);

        // Build adjacency graph: node_id => [connected_node_ids]
        $graph = [];
        $nodeMap = [];
        
        foreach ($nodes as $node) {
            $nodeMap[$node['id']] = $node;
            $graph[$node['id']] = [];
        }
        
        // Build graph from edges (source -> targets)
        foreach ($edges as $edge) {
            $sourceId = $edge['source'];
            $targetId = $edge['target'];
            
            if (!isset($graph[$sourceId])) {
                $graph[$sourceId] = [];
            }
            $graph[$sourceId][] = $targetId;
        }

        // Find all reachable nodes from trigger node using BFS
        $reachableNodes = [$triggerNode['id']];
        $visited = [$triggerNode['id'] => true];
        $queue = [$triggerNode['id']];
        
        while (!empty($queue)) {
            $currentId = array_shift($queue);
            
            foreach ($graph[$currentId] ?? [] as $targetId) {
                if (!isset($visited[$targetId])) {
                    $visited[$targetId] = true;
                    $reachableNodes[] = $targetId;
                    $queue[] = $targetId;
                }
            }
        }

        Log::info('Reachable nodes from starting node', [
            'trigger_type' => $triggerType,
            'starting_node' => $triggerNode['id'],
            'node_type' => $triggerNode['type'] ?? 'unknown',
            'reachable_count' => count($reachableNodes),
            'reachable_nodes' => $reachableNodes,
        ]);

        // Build dependency graph for reachable nodes only
        $dependencies = [];
        foreach ($reachableNodes as $nodeId) {
            $dependencies[$nodeId] = [];
        }
        
        foreach ($edges as $edge) {
            $targetId = $edge['target'];
            $sourceId = $edge['source'];
            
            // Only add dependency if both nodes are reachable
            if (isset($dependencies[$targetId]) && isset($dependencies[$sourceId])) {
                $dependencies[$targetId][] = $sourceId;
            }
        }
        
        // Topological sort - only on reachable nodes
        $order = [];
        $completed = [];
        $maxIterations = count($reachableNodes) * 10;
        $iteration = 0;
        
        while (count($order) < count($reachableNodes) && $iteration < $maxIterations) {
            $iteration++;
            $addedInThisIteration = false;
            
            foreach ($reachableNodes as $nodeId) {
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
                    $order[] = $nodeMap[$nodeId];
                    $completed[] = $nodeId;
                    $addedInThisIteration = true;
                    
                    Log::info('Node ready for execution', [
                        'node_id' => $nodeId,
                        'node_type' => $nodeMap[$nodeId]['type'],
                        'execution_position' => count($order),
                    ]);
                }
            }
            
            // Detect circular dependency
            if (!$addedInThisIteration && count($order) < count($reachableNodes)) {
                Log::error('Circular dependency detected', [
                    'completed_nodes' => count($order),
                    'reachable_nodes' => count($reachableNodes),
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

    private function getNodeInputData($nodeId, $edges, $nodeOutputs, $ifResults = [], $nodes = [], $switchResults = [])
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

            // If parent is a Switch node, check branch routing
            if (isset($switchResults[$parentId])) {
                $matchedOutput = $switchResults[$parentId];
                
                // Determine expected handle based on matched output
                // output0, output1, output2, ... or 'fallback'
                $expectedHandle = $matchedOutput >= 0 ? "output{$matchedOutput}" : 'fallback';

                // Only add input if sourceHandle matches the Switch result
                if ($sourceHandle === $expectedHandle) {
                    $output = $nodeOutputs[$parentId];
                    $inputData[] = isset($output['output']) ? $output['output'] : $output;
                    
                    Log::info('Switch node branch matched', [
                        'node_id' => $nodeId,
                        'parent_id' => $parentId,
                        'matched_output' => $matchedOutput,
                        'source_handle' => $sourceHandle,
                        'expected_handle' => $expectedHandle,
                    ]);
                } else {
                    Log::info('Switch node branch skipped', [
                        'node_id' => $nodeId,
                        'parent_id' => $parentId,
                        'matched_output' => $matchedOutput,
                        'source_handle' => $sourceHandle,
                        'expected_handle' => $expectedHandle,
                    ]);
                }
            }
            // If parent is an If node, check branch routing
            elseif (isset($ifResults[$parentId])) {
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
                // Normal node (not If/Switch), just add output
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

            case 'schedule':
                // For schedule trigger nodes, return trigger info
                return $this->executeScheduleTriggerNode($config, $inputData);

            case 'http':
                return $this->executeHttpNode($config, $inputData);

            case 'perplexity':
                return $this->executePerplexityNode($config, $inputData);

            case 'claude':
                return $this->executeClaudeNode($config, $inputData);

            case 'openai':
                return $this->executeOpenAINode($config, $inputData);

            case 'code':
                return $this->executeCodeNode($config, $inputData);

            case 'escape':
                return $this->executeEscapeNode($config, $inputData);

            case 'if':
                return $this->executeIfNode($config, $inputData);

            case 'switch':
                return $this->executeSwitchNode($config, $inputData);

            case 'googledocs':
                return $this->executeGoogleDocsNode($config, $inputData);

            case 'googlesheets':
                return $this->executeGoogleSheetsNode($config, $inputData);

            case 'googledrivefolder':
                return $this->executeGoogleDriveFolderNode($config, $inputData);

            case 'gemini':
                Log::error('Gemini: DEBUG - About to call executeGeminiNode', [
                    'node_id' => $node['id'] ?? 'unknown',
                    'config_keys' => array_keys($config),
                    'credentialId_in_config' => $config['credentialId'] ?? 'NOT_SET',
                ]);
                return $this->executeGeminiNode($config, $inputData);

            case 'kling':
                return $this->executeKlingNode($config, $inputData);

            case 'convert':
                return $this->executeConvertNode($config, $inputData);

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
            // Check if sendBody is enabled OR if bodyContent/bodyParams exists (backward compat)
            $shouldSendBody = !empty($config['sendBody']) || 
                             !empty($config['bodyContent']) || 
                             !empty($config['bodyParams']);
            
            if ($shouldSendBody) {
                // Priority 1: Use bodyParams (key-value fields) if available
                if (!empty($config['bodyParams']) && is_array($config['bodyParams'])) {
                    $bodyData = [];
                    
                    foreach ($config['bodyParams'] as $param) {
                        $name = $this->resolveVariables($param['name'] ?? '', $inputData);
                        $value = $this->resolveVariables($param['value'] ?? '', $inputData);
                        
                        if ($name !== '') {
                            $bodyData[$name] = $value;
                        }
                    }
                    
                    Log::info('Body built from params', [
                        'params_count' => count($config['bodyParams']),
                        'body_keys' => array_keys($bodyData),
                    ]);
                    
                    // Convert to JSON
                    $body = json_encode($bodyData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    $headers['Content-Type'] = 'application/json';
                }
                // Priority 2: Use bodyContent (raw string) if bodyParams not available
                elseif (!empty($config['bodyContent'])) {
                    $originalBody = $config['bodyContent'];

                    Log::info('Body resolution from content', [
                        'original' => substr($originalBody, 0, 200),
                        'has_variables' => strpos($originalBody, '{{') !== false,
                        'bodyType' => $config['bodyType'] ?? 'none',
                    ]);

                    // If body looks like JSON (starts with { or [), always use JSON resolution
                    // This ensures proper escaping of newlines, quotes, etc.
                    $trimmedBody = trim($originalBody);
                    $isJsonFormat = (!empty($trimmedBody) && ($trimmedBody[0] === '{' || $trimmedBody[0] === '[')) ||
                                   (!empty($config['bodyType']) && $config['bodyType'] === 'json');
                    
                    if ($isJsonFormat) {
                        // For JSON body, use special resolution that preserves JSON validity
                        $bodyContent = $this->resolveVariablesInJSON($originalBody, $inputData);
                        $body = $bodyContent;
                        $headers['Content-Type'] = 'application/json';
                    } else {
                        // For non-JSON body (plain text, form data, etc.), use normal resolution
                        $bodyContent = $this->resolveVariables($originalBody, $inputData);
                        $body = $bodyContent;
                    }
                }
                
                if ($body) {
                    Log::info('Final body', [
                        'body_preview' => substr($body, 0, 300),
                    ]);
                }
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

    private function executeGoogleDocsNode($config, $inputData)
    {
        // CRITICAL DEBUG: Log inputData structure  
        Log::info('🔍 executeGoogleDocsNode START', [
            'operation' => $config['operation'] ?? 'unknown',
            'inputData_keys' => is_array($inputData) ? array_keys($inputData) : 'NOT ARRAY',
            'inputData_type' => gettype($inputData),
            'has_Google_Docs' => is_array($inputData) && isset($inputData['Google Docs']),
            'Google_Docs_sample' => is_array($inputData) && isset($inputData['Google Docs']) ? $inputData['Google Docs'] : 'NOT FOUND',
        ]);
        
        try {
            $credentialId = $config['credentialId'] ?? null;
            if (!$credentialId) {
                throw new \Exception('Google Docs credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential || $credential->type !== 'oauth2') {
                throw new \Exception('Invalid Google Docs OAuth2 credential');
            }

            $operation = $config['operation'] ?? 'create';
            
            if ($operation === 'create') {
                return $this->createGoogleDoc($config, $inputData, $credential);
            } elseif ($operation === 'update') {
                return $this->updateGoogleDoc($config, $inputData, $credential);
            } elseif ($operation === 'get') {
                return $this->getGoogleDoc($config, $inputData, $credential);
            }

            throw new \Exception('Unsupported operation: ' . $operation);
        } catch (\Exception $e) {
            Log::error('Google Docs node execution failed', [
                'error' => $e->getMessage(),
            ]);

            return [
                'error' => 'Google Docs request failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    private function createGoogleDoc($config, $inputData, $credential)
    {
        $title = $this->resolveVariables($config['title'] ?? 'Untitled', $inputData);
        $folderId = $this->resolveVariables($config['folderId'] ?? '', $inputData);

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        // Create document using Drive API (allows specifying folder from the start)
        $metadata = [
            'name' => $title,
            'mimeType' => 'application/vnd.google-apps.document'
        ];

        // Add parent folder if specified
        if ($folderId) {
            $metadata['parents'] = [$folderId];
        }

        $response = Http::withToken($accessToken)
            ->post('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', $metadata);

        if (!$response->successful()) {
            throw new \Exception('Failed to create document: ' . $response->body());
        }

        $driveFile = $response->json();
        $documentId = $driveFile['id'] ?? null;

        if (!$documentId) {
            throw new \Exception('Document ID not returned from Google Drive API');
        }

        // Get the full document details from Docs API
        $docResponse = Http::withToken($accessToken)
            ->get("https://docs.googleapis.com/v1/documents/{$documentId}");

        $result = $docResponse->successful() ? $docResponse->json() : $driveFile;

        Log::info('Google Doc created', [
            'document_id' => $documentId,
            'title' => $title,
            'folder_id' => $folderId ?: 'My Drive root',
        ]);

        return [
            'id' => $documentId,
            'title' => $title,
            'url' => "https://docs.google.com/document/d/{$documentId}/edit",
            'folder_id' => $folderId ?: null,
            'document' => $result,
        ];
    }

    private function updateGoogleDoc($config, $inputData, $credential)
    {
        $originalDocId = $config['documentId'] ?? '';
        
        Log::info('Update Google Doc - resolving documentId', [
            'original_documentId' => $originalDocId,
            'inputData_keys' => array_keys($inputData),
            'inputData_node_names' => array_filter(array_keys($inputData), function($k) { return !is_numeric($k); }),
        ]);
        
        $documentId = $this->resolveVariables($originalDocId, $inputData);
        
        Log::info('Document ID after resolution', [
            'original' => $originalDocId,
            'resolved' => $documentId,
            'was_resolved' => $documentId !== $originalDocId,
        ]);
        
        if (!$documentId) {
            throw new \Exception('Document ID is required for update operation');
        }
        
        // Check if still a template (not resolved)
        if (strpos($documentId, '{{') !== false) {
            throw new \Exception('Document ID variable not resolved: ' . $documentId . '. Make sure the Google Docs create node is connected to this update node.');
        }

        // Extract doc ID from URL if needed
        if (strpos($documentId, 'docs.google.com') !== false) {
            preg_match('/\/d\/([a-zA-Z0-9-_]+)/', $documentId, $matches);
            $documentId = $matches[1] ?? $documentId;
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        // Build requests for batch update
        $requests = [];
        $actions = $config['actions'] ?? [];

        Log::info('Processing Google Docs update actions', [
            'document_id' => $documentId,
            'actions_count' => count($actions),
        ]);

        foreach ($actions as $index => $action) {
            $text = $this->resolveVariables($action['text'] ?? '', $inputData);
            
            // Unescape special characters (convert \n to actual newline, etc.)
            // This allows users to use escape sequences in their text
            $text = $this->unescapeText($text);
            
            Log::info("Action {$index} - resolved text", [
                'original' => $action['text'] ?? '',
                'resolved' => substr($text, 0, 200),
                'length' => strlen($text),
            ]);
            
            // Skip empty text
            if (empty($text) || trim($text) === '') {
                Log::warning("Action {$index} - skipping empty text");
                continue;
            }
            
            if ($action['action'] === 'insert') {
                $location = $action['insertLocation'] ?? 'end';
                
                // Get document to find insert position
                if ($location === 'end') {
                    $docResponse = Http::withToken($accessToken)
                        ->get("https://docs.googleapis.com/v1/documents/{$documentId}");
                    
                    if ($docResponse->successful()) {
                        $doc = $docResponse->json();
                        $endIndex = $doc['body']['content'][count($doc['body']['content']) - 1]['endIndex'] ?? 1;
                        
                        $requests[] = [
                            'insertText' => [
                                'location' => ['index' => $endIndex - 1],
                                'text' => $text
                            ]
                        ];
                    } else {
                        Log::error('Failed to get document for finding end index', [
                            'document_id' => $documentId,
                            'error' => $docResponse->body()
                        ]);
                    }
                } else {
                    $requests[] = [
                        'insertText' => [
                            'location' => ['index' => 1],
                            'text' => $text
                        ]
                    ];
                }
            }
        }

        if (empty($requests)) {
            throw new \Exception('No valid actions to perform. Make sure your text fields are not empty and variables are correctly resolved from upstream nodes.');
        }

        // Execute batch update
        $response = Http::withToken($accessToken)
            ->post("https://docs.googleapis.com/v1/documents/{$documentId}:batchUpdate", [
                'requests' => $requests
            ]);

        if (!$response->successful()) {
            throw new \Exception('Failed to update document: ' . $response->body());
        }

        $result = $response->json();

        Log::info('Google Doc updated', [
            'document_id' => $documentId,
            'actions_count' => count($requests),
        ]);

        return [
            'id' => $documentId,
            'url' => "https://docs.google.com/document/d/{$documentId}/edit",
            'result' => $result,
        ];
    }

    /**
     * Get Google Doc content
     */
    private function getGoogleDoc($config, $inputData, $credential)
    {
        $originalDocId = $config['documentId'] ?? '';
        
        Log::info('Get Google Doc - resolving documentId', [
            'original_documentId' => $originalDocId,
            'inputData_keys' => array_keys($inputData),
        ]);
        
        $documentId = $this->resolveVariables($originalDocId, $inputData);
        
        Log::info('Document ID after resolution', [
            'original' => $originalDocId,
            'resolved' => $documentId,
            'was_resolved' => $documentId !== $originalDocId,
        ]);
        
        if (!$documentId) {
            throw new \Exception('Document ID is required for get operation');
        }
        
        // Check if still a template (not resolved)
        if (strpos($documentId, '{{') !== false) {
            throw new \Exception('Document ID variable not resolved: ' . $documentId . '. Make sure the document ID is provided correctly.');
        }

        // Extract doc ID from URL if needed
        if (strpos($documentId, 'docs.google.com') !== false) {
            preg_match('/\/d\/([a-zA-Z0-9-_]+)/', $documentId, $matches);
            $documentId = $matches[1] ?? $documentId;
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        // Get document content from Google Docs API
        $response = Http::withToken($accessToken)
            ->get("https://docs.googleapis.com/v1/documents/{$documentId}");

        if (!$response->successful()) {
            throw new \Exception('Failed to get document: ' . $response->body());
        }

        $doc = $response->json();
        
        // Extract plain text content from document structure
        $content = $this->extractTextFromDocument($doc);
        
        // Check if simplify option is enabled (default: true)
        $simplify = $config['simplify'] ?? true;
        
        Log::info('Google Doc retrieved', [
            'document_id' => $documentId,
            'title' => $doc['title'] ?? 'Untitled',
            'simplify' => $simplify,
            'content_length' => strlen($content),
        ]);

        // Return simplified format if simplify is enabled
        if ($simplify) {
            return [
                'id' => $documentId,
                'title' => $doc['title'] ?? 'Untitled',
                'url' => "https://docs.google.com/document/d/{$documentId}/edit",
                'content' => $content,
                'simpleText' => $content, // For backward compatibility
            ];
        }

        // Return full document structure
        return [
            'id' => $documentId,
            'title' => $doc['title'] ?? 'Untitled',
            'url' => "https://docs.google.com/document/d/{$documentId}/edit",
            'document' => $doc,
            'content' => $content,
            'simpleText' => $content,
        ];
    }

    /**
     * Extract plain text from Google Docs document structure
     */
    private function extractTextFromDocument($doc)
    {
        $text = '';
        
        if (!isset($doc['body']['content'])) {
            return $text;
        }

        foreach ($doc['body']['content'] as $element) {
            if (isset($element['paragraph'])) {
                $text .= $this->extractTextFromParagraph($element['paragraph']) . "\n";
            } elseif (isset($element['table'])) {
                $text .= $this->extractTextFromTable($element['table']) . "\n";
            }
        }

        return trim($text);
    }

    /**
     * Extract text from paragraph element
     */
    private function extractTextFromParagraph($paragraph)
    {
        $text = '';
        
        if (!isset($paragraph['elements'])) {
            return $text;
        }

        foreach ($paragraph['elements'] as $element) {
            if (isset($element['textRun'])) {
                $text .= $element['textRun']['content'] ?? '';
            } elseif (isset($element['inlineObjectElement'])) {
                // Skip inline objects (images, etc.)
                continue;
            }
        }

        return $text;
    }

    /**
     * Extract text from table element
     */
    private function extractTextFromTable($table)
    {
        $text = '';
        
        if (!isset($table['tableRows'])) {
            return $text;
        }

        foreach ($table['tableRows'] as $row) {
            $rowText = [];
            if (isset($row['tableCells'])) {
                foreach ($row['tableCells'] as $cell) {
                    if (isset($cell['content'])) {
                        $cellText = '';
                        foreach ($cell['content'] as $element) {
                            if (isset($element['paragraph'])) {
                                $cellText .= $this->extractTextFromParagraph($element['paragraph']);
                            }
                        }
                        $rowText[] = trim($cellText);
                    }
                }
            }
            $text .= implode(' | ', $rowText) . "\n";
        }

        return $text;
    }

    /**
     * Unescape special characters in text
     * Converts literal \n, \t, \r to actual newline, tab, carriage return
     */
    private function unescapeText($text)
    {
        if (!is_string($text)) {
            return $text;
        }

        // Convert escape sequences to actual characters
        $text = str_replace('\\n', "\n", $text);  // Newline
        $text = str_replace('\\r', "\r", $text);  // Carriage return
        $text = str_replace('\\t', "\t", $text);  // Tab
        $text = str_replace('\\\\', "\\", $text); // Backslash (do this last)
        
        return $text;
    }

    private function executeSwitchNode($config, $inputData)
    {
        try {
            $rules = $config['rules'] ?? [];
            
            if (empty($rules)) {
                return [
                    'matchedOutput' => -1, // -1 = fallback
                    'outputName' => $config['fallbackOutput'] ?? 'No Match',
                    'output' => $inputData[0] ?? [],
                ];
            }

            Log::info('Executing Switch node', [
                'rules_count' => count($rules),
            ]);

            // Evaluate each rule in order
            foreach ($rules as $index => $rule) {
                $operator = $rule['operator'] ?? 'equal';
                
                // Resolve value - catch variable not found errors
                try {
                    $value = $this->resolveVariables($rule['value'] ?? '', $inputData);
                } catch (\Exception $e) {
                    // Variable not found - skip this rule (don't match)
                    if (strpos($e->getMessage(), 'Variable not found') !== false) {
                        Log::info('Switch node rule variable not found - skipping rule', [
                            'rule_index' => $index,
                            'variable' => $rule['value'] ?? '',
                            'operator' => $operator,
                        ]);
                        continue; // Skip to next rule
                    }
                    // Re-throw other exceptions
                    throw $e;
                }
                
                // Resolve value2 if needed - catch variable not found errors
                $value2 = null;
                if (!in_array($operator, ['exists', 'notExists', 'isEmpty', 'isNotEmpty'])) {
                    try {
                        $value2 = $this->resolveVariables($rule['value2'] ?? '', $inputData);
                    } catch (\Exception $e) {
                        // Variable not found - use null/empty for comparison
                        if (strpos($e->getMessage(), 'Variable not found') !== false) {
                            $value2 = null;
                            Log::info('Switch node value2 variable not found - using null', [
                                'variable' => $rule['value2'] ?? '',
                            ]);
                        } else {
                            // Re-throw other exceptions
                            throw $e;
                        }
                    }
                }

                // Evaluate condition
                $result = $this->evaluateSwitchCondition($value, $operator, $value2);

                Log::info('Switch rule evaluated', [
                    'rule_index' => $index,
                    'value' => $value,
                    'operator' => $operator,
                    'value2' => $value2,
                    'result' => $result,
                ]);

                // If rule matches, return this output
                if ($result) {
                    return [
                        'matchedOutput' => $index,
                        'outputName' => $rule['outputName'] ?? "Output $index",
                        'output' => $inputData[0] ?? [],
                    ];
                }
            }

            // No rule matched - use fallback
            return [
                'matchedOutput' => -1,
                'outputName' => $config['fallbackOutput'] ?? 'No Match',
                'output' => $inputData[0] ?? [],
            ];
        } catch (\Exception $e) {
            // Check if this is a "variable not found" error - treat as fallback, not error
            $errorMessage = $e->getMessage();
            if (strpos($errorMessage, 'Variable not found') !== false) {
                Log::info('Switch node variable not found - using fallback', [
                    'error' => $errorMessage,
                ]);
                
                // Return fallback output (not error) so workflow continues
                return [
                    'matchedOutput' => -1,
                    'outputName' => $config['fallbackOutput'] ?? 'No Match',
                    'output' => $inputData[0] ?? [],
                ];
            }
            
            // For other errors, log and return fallback (don't stop workflow)
            Log::error('Switch node execution failed', [
                'error' => $errorMessage,
            ]);

            // Return fallback output (not error) so workflow continues
            return [
                'matchedOutput' => -1,
                'outputName' => $config['fallbackOutput'] ?? 'No Match',
                'output' => $inputData[0] ?? [],
            ];
        }
    }

    private function evaluateSwitchCondition($value1, $operator, $value2)
    {
        // Reuse If node evaluation logic
        return $this->evaluateCondition($value1, $operator, $value2, 'string');
    }

    private function executeIfNode($config, $inputData)
    {
        try {
            $conditions = $config['conditions'] ?? [];
            
            if (empty($conditions)) {
                return [
                    'result' => false,
                    'output' => $inputData[0] ?? [],
                    'conditionResults' => [],
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
                
                // Resolve value1 - catch variable not found errors
                // Use getValueFromPathWithExists directly to avoid exception from resolveVariables
                $value1Raw = $condition['value1'] ?? '';
                $value1 = null;
                
                // Check if it's a variable (has {{ }})
                if (preg_match('/\{\{([^}]+)\}\}/', $value1Raw, $matches)) {
                    $value1Path = trim($matches[1]);
                    // Remove quotes if present
                    $value1Path = trim($value1Path, ' "\'');
                    
                    // Check if this looks like a variable path
                    $isVariablePath = strpos($value1Path, '.') !== false || 
                                      preg_match('/^(input-\d+|Webhook|Schedule|HttpRequest|Code|If|Switch|Convert|Claude|OpenAI|Perplexity|Gemini|Kling|GoogleDocs|GoogleSheets|Escape)/', $value1Path);
                    
                    if ($isVariablePath) {
                        $value1Result = $this->getValueFromPathWithExists($value1Path, $inputData);
                        if (!$value1Result['exists'] && !in_array($operator, ['exists', 'notExists'])) {
                            // Variable doesn't exist - treat condition as false
                            $conditionResults[] = false;
                            Log::info('If node condition variable not found - treating as false', [
                                'variable' => $value1Path,
                                'operator' => $operator,
                            ]);
                            continue;
                        }
                        $value1 = $value1Result['value'];
                    } else {
                        // Not a variable path, treat as literal
                        $value1 = $value1Path;
                    }
                } else {
                    // No variable syntax, treat as literal
                    try {
                        $value1 = $this->resolveVariables($value1Raw, $inputData);
                    } catch (\Exception $e) {
                        // If resolveVariables fails, treat as literal value
                        $value1 = $value1Raw;
                    }
                }
                
                // Resolve value2 if needed - use getValueFromPathWithExists directly
                $value2 = null;
                if (!in_array($operator, ['exists', 'notExists', 'isEmpty', 'isNotEmpty', 'true', 'false'])) {
                    $value2Raw = $condition['value2'] ?? '';
                    
                    // Check if it's a variable (has {{ }})
                    if (preg_match('/\{\{([^}]+)\}\}/', $value2Raw, $matches)) {
                        $value2Path = trim($matches[1]);
                        // Remove quotes if present
                        $value2Path = trim($value2Path, ' "\'');
                        
                        // Check if this looks like a variable path
                        $isVariablePath = strpos($value2Path, '.') !== false || 
                                          preg_match('/^(input-\d+|Webhook|Schedule|HttpRequest|Code|If|Switch|Convert|Claude|OpenAI|Perplexity|Gemini|Kling|GoogleDocs|GoogleSheets|Escape)/', $value2Path);
                        
                        if ($isVariablePath) {
                            $value2Result = $this->getValueFromPathWithExists($value2Path, $inputData);
                            $value2 = $value2Result['value']; // Use null if not exists
                        } else {
                            // Not a variable path, treat as literal
                            $value2 = $value2Path;
                        }
                    } else {
                        // No variable syntax, treat as literal
                        try {
                            $value2 = $this->resolveVariables($value2Raw, $inputData);
                        } catch (\Exception $e) {
                            // If resolveVariables fails, treat as literal value
                            $value2 = $value2Raw;
                        }
                    }
                }

                // Convert types
                if ($dataType === 'number') {
                    $value1 = is_numeric($value1) ? floatval($value1) : 0;
                    $value2 = is_numeric($value2) ? floatval($value2) : 0;
                } elseif ($dataType === 'boolean') {
                    $value1 = filter_var($value1, FILTER_VALIDATE_BOOLEAN);
                    $value2 = filter_var($value2, FILTER_VALIDATE_BOOLEAN);
                } elseif ($dataType === 'dateTime') {
                    try {
                        // Try multiple date formats (Vietnamese format first, then ISO)
                        $formats = [
                            'd/m/Y H:i:s',  // Vietnamese format: 06/11/2025 09:18:14
                            'd/m/Y H:i',    // Vietnamese format without seconds: 05/12/2025 14:21
                            'Y-m-d H:i:s',  // ISO format: 2025-11-06 09:18:14
                            'Y-m-d\TH:i:s', // ISO with T: 2025-11-06T09:18:14
                            'Y-m-d\TH:i:s.uP', // ISO with microseconds: 2025-11-05T07:21:42.000000Z
                        ];
                        
                        $value1 = $this->parseDateTime($value1, $formats);
                        $value2 = $value2 ? $this->parseDateTime($value2, $formats) : null;
                    } catch (\Exception $e) {
                        Log::error('DateTime conversion failed', ['error' => $e->getMessage()]);
                        $value1 = null;
                        $value2 = null;
                    }
                }

                // Evaluate operator - wrap in try-catch to prevent any exceptions
                try {
                    $result = $this->evaluateCondition($value1, $operator, $value2, $dataType);
                    $conditionResults[] = $result;

                    Log::info('Condition evaluated', [
                        'dataType' => $dataType,
                        'operator' => $operator,
                        'value1' => is_object($value1) ? get_class($value1) : $value1,
                        'value2' => is_object($value2) ? get_class($value2) : $value2,
                        'result' => $result,
                    ]);
                } catch (\Exception $e) {
                    // If evaluation fails, treat as false
                    $conditionResults[] = false;
                    Log::warning('Condition evaluation failed - treating as false', [
                        'dataType' => $dataType,
                        'operator' => $operator,
                        'error' => $e->getMessage(),
                    ]);
                }
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
            // Catch ALL exceptions and treat as false (don't stop workflow)
            $errorMessage = $e->getMessage();
            $errorClass = get_class($e);
            
            Log::warning('If node exception caught - treating as false to continue workflow', [
                'error_class' => $errorClass,
                'error_message' => $errorMessage,
                'error_trace' => $e->getTraceAsString(),
            ]);
            
            // ALWAYS return false result (not error) so workflow continues to false branch
            // This ensures workflow never stops, even if there's an unexpected error
            return [
                'result' => false,
                'output' => $inputData[0] ?? [],
                'conditionResults' => [],
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

    /**
     * Test Schedule Trigger node (public method for API endpoint)
     */
    public function testScheduleTriggerNode($config, $inputData)
    {
        return $this->executeScheduleTriggerNode($config, $inputData);
    }

    /**
     * Test Code node (public method for API endpoint)
     */
    public function testCodeNode($config, $inputData)
    {
        return $this->executeCodeNode($config, $inputData);
    }

    /**
     * Test HTTP Request node (public method for API endpoint)
     */
    public function testHttpNode($config, $inputData)
    {
        return $this->executeHttpNode($config, $inputData);
    }

    /**
     * Test If node (public method for API endpoint)
     */
    public function testIfNode($config, $inputData)
    {
        return $this->executeIfNode($config, $inputData);
    }

    /**
     * Test Switch node (public method for API endpoint)
     */
    public function testSwitchNode($config, $inputData)
    {
        return $this->executeSwitchNode($config, $inputData);
    }

    /**
     * Test Escape & Set node (public method for API endpoint)
     */
    public function testEscapeNode($config, $inputData)
    {
        return $this->executeEscapeNode($config, $inputData);
    }

    /**
     * Parse datetime string with multiple format support
     * Try Vietnamese format first (d/m/Y), then ISO formats
     */
    private function parseDateTime($dateString, $formats)
    {
        if (!is_string($dateString)) {
            return null;
        }
        
        // Try each format
        foreach ($formats as $format) {
            $date = \DateTime::createFromFormat($format, $dateString);
            if ($date !== false) {
                Log::info('DateTime parsed successfully', [
                    'input' => $dateString,
                    'format' => $format,
                    'result' => $date->format('Y-m-d H:i:s'),
                ]);
                return $date;
            }
        }
        
        // Fallback: try default PHP parsing (may cause issues with d/m/Y format)
        try {
            $date = new \DateTime($dateString);
            Log::warning('DateTime parsed with fallback method', [
                'input' => $dateString,
                'result' => $date->format('Y-m-d H:i:s'),
            ]);
            return $date;
        } catch (\Exception $e) {
            Log::error('All DateTime parsing attempts failed', [
                'input' => $dateString,
                'tried_formats' => $formats,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    private function executeScheduleTriggerNode($config, $inputData)
    {
        // Schedule trigger nodes return trigger information
        // This is called when workflow is triggered by scheduler
        return [
            'triggeredAt' => now('Asia/Ho_Chi_Minh')->toIso8601String(),
            'timezone' => $config['timezone'] ?? 'Asia/Ho_Chi_Minh',
            'schedule' => $this->getScheduleDescription($config),
            'triggerType' => $config['triggerType'] ?? 'interval',
        ];
    }

    /**
     * Get human-readable schedule description
     */
    private function getScheduleDescription($config)
    {
        $triggerType = $config['triggerType'] ?? 'interval';
        
        if ($triggerType === 'cron') {
            return $config['cronExpression'] ?? '0 * * * *';
        }
        
        $interval = $config['interval'] ?? 'hours';
        $intervalValue = $config['intervalValue'] ?? 1;
        
        $labels = [
            'minutes' => 'phút',
            'hours' => 'giờ',
            'days' => 'ngày',
            'weeks' => 'tuần',
            'months' => 'tháng',
        ];
        
        $label = $labels[$interval] ?? $interval;
        
        if (in_array($interval, ['days', 'weeks', 'months'])) {
            $hour = $config['triggerAt']['hour'] ?? 0;
            $minute = $config['triggerAt']['minute'] ?? 0;
            return sprintf('Mỗi %d %s lúc %02d:%02d', $intervalValue, $label, $hour, $minute);
        }
        
        return sprintf('Mỗi %d %s', $intervalValue, $label);
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

    // Public wrapper for testing Claude node
    public function testClaudeNode($config, $inputData)
    {
        return $this->executeClaudeNode($config, $inputData);
    }

    // Public wrapper for testing Perplexity node
    public function testPerplexityNode($config, $inputData)
    {
        return $this->executePerplexityNode($config, $inputData);
    }

    public function testGeminiNode($config, $inputData)
    {
        return $this->executeGeminiNode($config, $inputData);
    }
    // Public wrapper for testing Kling node
    public function testKlingNode($config, $inputData)
    {
        return $this->executeKlingNode($config, $inputData);
    }

    // Public wrapper for testing Convert node
    public function testConvertNode($config, $inputData)
    {
        return $this->executeConvertNode($config, $inputData);
    }


    // Public wrapper for testing OpenAI node
    public function testOpenAINode($config, $inputData)
    {
        return $this->executeOpenAINode($config, $inputData);
    }

    // Public wrapper for testing Google Docs node
    public function testGoogleDocsNode($config, $inputData)
    {
        return $this->executeGoogleDocsNode($config, $inputData);
    }

    public function testGoogleSheetsNode($config, $inputData)
    {
        return $this->executeGoogleSheetsNode($config, $inputData);
    }

    public function testGoogleDriveFolderNode($config, $inputData)
    {
        return $this->executeGoogleDriveFolderNode($config, $inputData);
    }

    private function executeClaudeNode($config, $inputData)
    {
        try {
            // Build messages array (Claude không hỗ trợ system trong messages array)
            $messages = [];
            
            // Load memory from cache if enabled
            $memoryService = app(MemoryService::class);
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                $memories = $memoryService->getMemory($config['memoryId'], $memoryLimit);
                $memoryMessages = $memoryService->memoriesToMessages($memories);
                
                // Thêm memory messages vào đầu
                $messages = array_merge($messages, $memoryMessages);
                
                Log::info('Claude memory loaded', [
                    'memory_id' => $config['memoryId'],
                    'memory_count' => count($memories),
                    'memory_messages_count' => count($memoryMessages),
                ]);
            }
            
            // Add all user/assistant messages from config
            if (!empty($config['messages']) && is_array($config['messages'])) {
                foreach ($config['messages'] as $msg) {
                    $content = $this->resolveVariables($msg['content'] ?? '', $inputData);
                    if (!empty($content)) {
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
                throw new \Exception('Claude API credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential) {
                throw new \Exception('Claude credential not found');
            }

            // Get API key from credential based on type
            $apiKey = null;
            if ($credential->type === 'claude') {
                $apiKey = $credential->data['key'] ?? null;
            } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
                // Backward compatibility with old custom header credentials
                $apiKey = $credential->data['headerValue'];
            }

            if (!$apiKey) {
                throw new \Exception('Invalid Claude credential configuration');
            }

            // Build request body
            $requestBody = [
                'model' => $config['model'] ?? 'claude-3-5-sonnet-20241022',
                'messages' => $messages,
            ];

            if (!empty($config['thinkingEnabled'])) {
                $rawBudget = $config['thinkingBudget'] ?? null;
                $normalizedBudget = null;

                if (is_numeric($rawBudget)) {
                    $normalizedBudget = (int) $rawBudget;
                } elseif (is_string($rawBudget) && trim($rawBudget) !== '') {
                    $normalizedBudget = (int) trim($rawBudget);
                }

                if ($normalizedBudget === null || $normalizedBudget <= 0) {
                    $normalizedBudget = 10000;
                }

                $requestBody['thinking'] = [
                    'type' => 'enabled',
                    'budget_tokens' => $normalizedBudget,
                ];
            }

            $allowedClaudeOptions = ['max_tokens', 'temperature', 'top_k', 'top_p'];
            $requestBody = array_merge(
                $requestBody,
                $this->extractAllowedOptions($config, $allowedClaudeOptions)
            );

            // Add system message if enabled (Claude uses separate system parameter)
            if (!empty($config['systemMessageEnabled']) && !empty($config['systemMessage'])) {
                $systemMessage = $this->resolveVariables($config['systemMessage'], $inputData);
                if ($systemMessage) {
                    $requestBody['system'] = $systemMessage;
                }
            }

            // No extra advanced options beyond allowed list for Claude

            Log::info('Claude API Request', [
                'model' => $requestBody['model'],
                'messages_count' => count($messages),
                'has_system' => isset($requestBody['system']),
            ]);

            // Build headers
            $headers = [
                'Content-Type' => 'application/json',
                'anthropic-version' => '2023-06-01',
                'x-api-key' => $apiKey,
            ];

            // Get timeout - prioritize advancedOptions over config
            $timeout = 60;
            $configTimeout = isset($config['timeout']) ? (int)$config['timeout'] : null;
            $advancedTimeout = !empty($config['advancedOptions']['timeout']) ? (int)$config['advancedOptions']['timeout'] : null;
            
            // Use the larger timeout value (advancedOptions takes priority if both exist)
            if ($advancedTimeout !== null) {
                $timeout = $advancedTimeout;
            } elseif ($configTimeout !== null) {
                $timeout = $configTimeout;
            }

            Log::info('Claude timeout setting', [
                'config_timeout' => $configTimeout,
                'advanced_timeout' => $advancedTimeout,
                'final_timeout' => $timeout,
            ]);

            // Increase PHP execution time limit for long requests
            $originalMaxExecutionTime = ini_get('max_execution_time');
            if ($timeout > 60) {
                set_time_limit($timeout + 30); // Add 30s buffer
            }

            // Make HTTP request to Claude API
            $originalTimeout = ini_get('default_socket_timeout');
            if ($timeout > 60) {
                ini_set('default_socket_timeout', $timeout);
            }

            try {
                $response = Http::withHeaders($headers)
                    ->timeout($timeout)
                    ->withOptions([
                        'connect_timeout' => 30,
                        'timeout' => $timeout,
                        'read_timeout' => $timeout,
                    ])
                    ->post('https://api.anthropic.com/v1/messages', $requestBody);
            } finally {
                if ($timeout > 60) {
                    ini_set('default_socket_timeout', $originalTimeout);
                    set_time_limit($originalMaxExecutionTime);
                }
            }

            if (!$response->successful()) {
                Log::error('Claude API Error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                
                throw new \Exception('Claude API error: ' . $response->body());
            }

            $result = $response->json();

            Log::info('Claude API Response', [
                'model' => $result['model'] ?? 'unknown',
                'has_content' => isset($result['content']),
            ]);

            // Save memory if enabled (run in background)
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                try {
                    // Extract user message and assistant response
                    $userMessage = '';
                    $assistantMessage = '';
                    
                    // Get last user message from config messages
                    if (!empty($config['messages']) && is_array($config['messages'])) {
                        $lastUserMsg = null;
                        foreach (array_reverse($config['messages']) as $msg) {
                            if (($msg['role'] ?? '') === 'user') {
                                $lastUserMsg = $this->resolveVariables($msg['content'] ?? '', $inputData);
                                break;
                            }
                        }
                        if ($lastUserMsg) {
                            $userMessage = $lastUserMsg;
                        }
                    }
                    
                    // Get assistant response from result using dynamic path
                    $assistantPath = $config['assistantMessagePath'] ?? 'content[0].text';
                    $assistantMessage = $this->extractValueFromPath($result, $assistantPath);
                    
                    // Fallback if custom path doesn't work
                    if (empty($assistantMessage) && isset($result['content'][0]['text'])) {
                        $assistantMessage = $result['content'][0]['text'];
                    }
                    
                    // Save memory - lưu trực tiếp (không dispatch) để đảm bảo memory được lưu
                    if (!empty($userMessage) && !empty($assistantMessage)) {
                        // Resolve memoryId before saving (it might be a variable template)
                        $resolvedMemoryId = $this->resolveVariables($config['memoryId'], $inputData);
                        
                        if (empty($resolvedMemoryId)) {
                            Log::warning('Claude: Cannot save memory - memoryId resolved to empty', [
                                'original_memoryId' => $config['memoryId'],
                            ]);
                        } else {
                            $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                            $credentialId = $config['credentialId'] ?? null;
                            $modelName = $config['model'] ?? null;
                            
                            // Summarize before saving using the same AI model
                            $assistantPath = $config['assistantMessagePath'] ?? 'content[0].text';
                            $summarized = $memoryService->summarizeMemory(
                                $userMessage, 
                                $assistantMessage,
                                'claude',
                                $credentialId,
                                $modelName,
                                $assistantPath
                            );
                            
                            // Save to cache - lưu trực tiếp
                            try {
                                $result = $memoryService->saveMemory(
                                    $resolvedMemoryId,
                                    $summarized['user'],
                                    $summarized['assistant'],
                                    $memoryLimit
                                );
                                
                                Log::info('Claude memory saved', [
                                    'memory_id' => $resolvedMemoryId,
                                    'save_result' => $result,
                                ]);
                            } catch (\Exception $e) {
                                Log::error('Claude: Exception saving memory', [
                                    'memory_id' => $resolvedMemoryId,
                                    'error' => $e->getMessage(),
                                    'trace' => $e->getTraceAsString(),
                                ]);
                            }
                        }
                    }
                } catch (\Exception $e) {
                    // Don't fail the request if memory save fails
                    Log::error('Failed to save Claude memory', [
                        'error' => $e->getMessage(),
                        'memory_id' => $config['memoryId'] ?? null,
                    ]);
                }
            }

            return $result;
        } catch (\Exception $e) {
            Log::error('Claude node execution failed', [
                'error' => $e->getMessage(),
                'config' => $config,
            ]);

            return [
                'error' => 'Claude request failed',
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

            // Load memory from cache if enabled
            $memoryService = app(MemoryService::class);
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                $memories = $memoryService->getMemory($config['memoryId'], $memoryLimit);
                $memoryMessages = $memoryService->memoriesToMessages($memories);
                
                // Thêm memory messages vào đầu (sau system message)
                $messages = array_merge($messages, $memoryMessages);
                
                Log::info('Perplexity memory loaded', [
                    'memory_id' => $config['memoryId'],
                    'memory_count' => count($memories),
                    'memory_messages_count' => count($memoryMessages),
                ]);
            }

            // Add all user/assistant messages from config
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
            if (!$credential) {
                throw new \Exception('Perplexity credential not found');
            }

            // Get API key from credential based on type
            $apiKey = null;
            if ($credential->type === 'perplexity') {
                $apiKey = $credential->data['key'] ?? null;
            } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
                // Backward compatibility with old custom header credentials
                $apiKey = $credential->data['headerValue'];
            } elseif ($credential->type === 'bearer' && isset($credential->data['token'])) {
                // Backward compatibility with bearer token credentials
                $apiKey = $credential->data['token'];
            }

            if (!$apiKey) {
                throw new \Exception('Invalid Perplexity credential configuration');
            }

            // Build request body
            $requestBody = [
                'model' => $config['model'] ?? 'sonar',
                'messages' => $messages,
            ];

            $allowedPerplexityOptions = ['temperature', 'max_tokens', 'stream', 'seed'];
            $requestBody = array_merge(
                $requestBody,
                $this->extractAllowedOptions($config, $allowedPerplexityOptions)
            );

            Log::info('Perplexity API Request', [
                'model' => $requestBody['model'],
                'messages_count' => count($messages),
                'has_advanced_options' => !empty($config['advancedOptions']),
            ]);

            // Build headers
            $headers = [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $apiKey,
            ];

            // Get timeout - prioritize advancedOptions over config
            $timeout = 60;
            $configTimeout = isset($config['timeout']) ? (int)$config['timeout'] : null;
            $advancedTimeout = !empty($config['advancedOptions']['timeout']) ? (int)$config['advancedOptions']['timeout'] : null;
            
            // Use the larger timeout value (advancedOptions takes priority if both exist)
            if ($advancedTimeout !== null) {
                $timeout = $advancedTimeout;
            } elseif ($configTimeout !== null) {
                $timeout = $configTimeout;
            }

            Log::info('Perplexity timeout setting', [
                'config_timeout' => $configTimeout,
                'advanced_timeout' => $advancedTimeout,
                'final_timeout' => $timeout,
            ]);

            // Increase PHP execution time limit for long requests
            $originalMaxExecutionTime = ini_get('max_execution_time');
            if ($timeout > 60) {
                set_time_limit($timeout + 30); // Add 30s buffer
            }

            // Make HTTP request to Perplexity API with timeout
            // Set socket timeout context to ensure it works even if PHP default_socket_timeout is limiting
            $originalTimeout = ini_get('default_socket_timeout');
            if ($timeout > 60) {
                ini_set('default_socket_timeout', $timeout);
            }

            try {
                $response = Http::withHeaders($headers)
                    ->timeout($timeout)
                    ->withOptions([
                        'connect_timeout' => 30,
                        'timeout' => $timeout,
                        'read_timeout' => $timeout,
                    ])
                    ->post('https://api.perplexity.ai/chat/completions', $requestBody);
            } finally {
                // Restore original timeout setting
                if ($timeout > 60) {
                    ini_set('default_socket_timeout', $originalTimeout);
                    set_time_limit($originalMaxExecutionTime);
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

            // Save memory if enabled (run in background)
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                try {
                    // Extract user message and assistant response
                    $userMessage = '';
                    $assistantMessage = '';
                    
                    // Get last user message from config messages
                    if (!empty($config['messages']) && is_array($config['messages'])) {
                        $lastUserMsg = null;
                        foreach (array_reverse($config['messages']) as $msg) {
                            if (($msg['role'] ?? '') === 'user') {
                                $lastUserMsg = $this->resolveVariables($msg['content'] ?? '', $inputData);
                                break;
                            }
                        }
                        if ($lastUserMsg) {
                            $userMessage = $lastUserMsg;
                        }
                    }
                    
                    // Get assistant response from result using dynamic path
                    $assistantPath = $config['assistantMessagePath'] ?? 'choices[0].message.content';
                    $assistantMessage = $this->extractValueFromPath($result, $assistantPath);
                    
                    // Fallback if custom path doesn't work
                    if (empty($assistantMessage) && isset($result['choices'][0]['message']['content'])) {
                        $assistantMessage = $result['choices'][0]['message']['content'];
                    }
                    
                    // Save memory - lưu trực tiếp (không dispatch) để đảm bảo memory được lưu
                    if (!empty($userMessage) && !empty($assistantMessage)) {
                        // Resolve memoryId before saving (it might be a variable template)
                        $resolvedMemoryId = $this->resolveVariables($config['memoryId'], $inputData);
                        
                        if (empty($resolvedMemoryId)) {
                            Log::warning('Perplexity: Cannot save memory - memoryId resolved to empty', [
                                'original_memoryId' => $config['memoryId'],
                            ]);
                        } else {
                            $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                            $credentialId = $config['credentialId'] ?? null;
                            $modelName = $config['model'] ?? null;
                            
                            // Summarize before saving using the same AI model
                            $assistantPath = $config['assistantMessagePath'] ?? 'choices[0].message.content';
                            $summarized = $memoryService->summarizeMemory(
                                $userMessage, 
                                $assistantMessage,
                                'perplexity',
                                $credentialId,
                                $modelName,
                                $assistantPath
                            );
                            
                            // Save to cache - lưu trực tiếp
                            try {
                                $result = $memoryService->saveMemory(
                                    $resolvedMemoryId,
                                    $summarized['user'],
                                    $summarized['assistant'],
                                    $memoryLimit
                                );
                                
                                Log::info('Perplexity memory saved', [
                                    'memory_id' => $resolvedMemoryId,
                                    'save_result' => $result,
                                ]);
                            } catch (\Exception $e) {
                                Log::error('Perplexity: Exception saving memory', [
                                    'memory_id' => $resolvedMemoryId,
                                    'error' => $e->getMessage(),
                                    'trace' => $e->getTraceAsString(),
                                ]);
                            }
                        }
                    }
                } catch (\Exception $e) {
                    // Don't fail the request if memory save fails
                    Log::error('Failed to save Perplexity memory', [
                        'error' => $e->getMessage(),
                        'memory_id' => $config['memoryId'] ?? null,
                    ]);
                }
            }

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

    private function executeOpenAINode($config, $inputData)
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

            // Load memory from cache if enabled
            $memoryService = app(MemoryService::class);
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                $memories = $memoryService->getMemory($config['memoryId'], $memoryLimit);
                $memoryMessages = $memoryService->memoriesToMessages($memories);
                
                // Thêm memory messages vào đầu (sau system message)
                $messages = array_merge($messages, $memoryMessages);
                
                Log::info('OpenAI memory loaded', [
                    'memory_id' => $config['memoryId'],
                    'memory_count' => count($memories),
                    'memory_messages_count' => count($memoryMessages),
                ]);
            }

            // Add all user/assistant messages from config
            if (!empty($config['messages']) && is_array($config['messages'])) {
                foreach ($config['messages'] as $msg) {
                    $content = $this->resolveVariables($msg['content'] ?? '', $inputData);
                    if (!empty($content)) {
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
                throw new \Exception('OpenAI API credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential) {
                throw new \Exception('OpenAI credential not found');
            }

            // Get API key from credential based on type
            $apiKey = null;
            if ($credential->type === 'openai') {
                $apiKey = $credential->data['key'] ?? null;
                Log::info('OpenAI credential - extracted API key', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                    'has_key' => !empty($apiKey),
                    'key_length' => $apiKey ? strlen($apiKey) : 0,
                    'key_preview' => $apiKey ? substr($apiKey, 0, 10) . '...' : null,
                    'data_keys' => is_array($credential->data) ? array_keys($credential->data) : 'not_array',
                ]);
            } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
                // Backward compatibility with old custom header credentials
                $headerValue = $credential->data['headerValue'];
                $apiKey = $headerValue;
                if (strpos($headerValue, 'Bearer ') === 0) {
                    $apiKey = substr($headerValue, 7);
                }
            } elseif ($credential->type === 'bearer' && isset($credential->data['token'])) {
                // Backward compatibility with bearer token credentials
                $apiKey = $credential->data['token'];
            }

            if (!$apiKey) {
                Log::error('OpenAI credential - API key is missing', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                    'data_is_null' => is_null($credential->data),
                    'data_keys' => is_array($credential->data) ? array_keys($credential->data) : 'not_array',
                ]);
                throw new \Exception('Invalid OpenAI credential configuration: API key is missing or empty');
            }

            // Build request body
            $requestBody = [
                'model' => $config['model'] ?? 'gpt-4o',
                'messages' => $messages,
            ];

            // Handle advanced options (new format) or fallback to old format
            $advancedOptions = $config['advancedOptions'] ?? [];
            
            // Basic parameters (from advancedOptions or old format)
            if (isset($advancedOptions['temperature'])) {
                $requestBody['temperature'] = (float) $advancedOptions['temperature'];
            } elseif (isset($config['temperature'])) {
                $requestBody['temperature'] = (float) $config['temperature'];
            }
            
            if (isset($advancedOptions['top_p'])) {
                $requestBody['top_p'] = (float) $advancedOptions['top_p'];
            } elseif (isset($config['top_p'])) {
                $requestBody['top_p'] = (float) $config['top_p'];
            }
            
            if (isset($advancedOptions['max_tokens'])) {
                $requestBody['max_tokens'] = (int) $advancedOptions['max_tokens'];
            } elseif (isset($config['max_tokens'])) {
                $requestBody['max_tokens'] = (int) $config['max_tokens'];
            }
            
            if (isset($advancedOptions['presence_penalty'])) {
                $requestBody['presence_penalty'] = (float) $advancedOptions['presence_penalty'];
            } elseif (isset($config['presence_penalty'])) {
                $requestBody['presence_penalty'] = (float) $config['presence_penalty'];
            }
            
            if (isset($advancedOptions['frequency_penalty'])) {
                $requestBody['frequency_penalty'] = (float) $advancedOptions['frequency_penalty'];
            } elseif (isset($config['frequency_penalty'])) {
                $requestBody['frequency_penalty'] = (float) $config['frequency_penalty'];
            }
            
            // Stop sequences
            if (!empty($advancedOptions['stop']) && is_array($advancedOptions['stop'])) {
                $stopSequences = array_filter($advancedOptions['stop'], function($s) { return !empty(trim($s)); });
                if (!empty($stopSequences)) {
                    $requestBody['stop'] = array_values($stopSequences);
                }
            } elseif (!empty($config['stop']) && is_array($config['stop'])) {
                $stopSequences = array_filter($config['stop'], function($s) { return !empty(trim($s)); });
                if (!empty($stopSequences)) {
                    $requestBody['stop'] = array_values($stopSequences);
                }
            }
            
            // Logprobs
            if (!empty($advancedOptions['logprobs'])) {
                $logprobsConfig = $advancedOptions['logprobs'];
                if (!empty($logprobsConfig['enabled']) || !empty($logprobsConfig['logprobs'])) {
                    $requestBody['logprobs'] = true;
                    if (isset($logprobsConfig['top_logprobs']) && $logprobsConfig['top_logprobs'] !== null) {
                        $requestBody['top_logprobs'] = (int) $logprobsConfig['top_logprobs'];
                    }
                }
            } elseif (isset($config['logprobs']) && $config['logprobs']) {
                $requestBody['logprobs'] = true;
                if (isset($config['top_logprobs']) && $config['top_logprobs'] !== null) {
                    $requestBody['top_logprobs'] = (int) $config['top_logprobs'];
                }
            }
            
            // Response format
            if (!empty($advancedOptions['response_format'])) {
                $requestBody['response_format'] = $advancedOptions['response_format'];
            } elseif (!empty($config['response_format'])) {
                $requestBody['response_format'] = $config['response_format'];
            }
            
            // Tools
            if (!empty($advancedOptions['tools'])) {
                $toolsConfig = $advancedOptions['tools'];
                if (!empty($toolsConfig['tools']) && is_array($toolsConfig['tools'])) {
                    $requestBody['tools'] = $toolsConfig['tools'];
                }
                if (isset($toolsConfig['tool_choice'])) {
                    $requestBody['tool_choice'] = $toolsConfig['tool_choice'];
                }
            } else {
                if (!empty($config['tools']) && is_array($config['tools'])) {
                    $requestBody['tools'] = $config['tools'];
                }
                if (isset($config['tool_choice'])) {
                    $requestBody['tool_choice'] = $config['tool_choice'];
                }
            }
            
            // Stream
            if (isset($advancedOptions['stream'])) {
                $requestBody['stream'] = (bool) $advancedOptions['stream'];
            } elseif (isset($config['stream'])) {
                $requestBody['stream'] = (bool) $config['stream'];
            }
            
            // Metadata
            if (!empty($advancedOptions['metadata']) && is_array($advancedOptions['metadata'])) {
                $requestBody['metadata'] = $advancedOptions['metadata'];
            } elseif (!empty($config['metadata']) && is_array($config['metadata'])) {
                $requestBody['metadata'] = $config['metadata'];
            }

            Log::info('OpenAI API Request', [
                'model' => $requestBody['model'],
                'messages_count' => count($messages),
                'has_tools' => isset($requestBody['tools']),
            ]);

            // Build headers
            $headers = [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $apiKey,
            ];

            // Get timeout
            $timeout = 60;
            $configTimeout = isset($config['timeout']) ? (int)$config['timeout'] : null;
            $advancedTimeout = !empty($config['advancedOptions']['timeout']) ? (int)$config['advancedOptions']['timeout'] : null;
            
            if ($advancedTimeout !== null) {
                $timeout = $advancedTimeout;
            } elseif ($configTimeout !== null) {
                $timeout = $configTimeout;
            }

            Log::info('OpenAI timeout setting', [
                'config_timeout' => $configTimeout,
                'advanced_timeout' => $advancedTimeout,
                'final_timeout' => $timeout,
            ]);

            // Increase PHP execution time limit for long requests
            $originalMaxExecutionTime = ini_get('max_execution_time');
            if ($timeout > 60) {
                set_time_limit($timeout + 30);
            }

            // Make HTTP request to OpenAI API
            $originalTimeout = ini_get('default_socket_timeout');
            if ($timeout > 60) {
                ini_set('default_socket_timeout', $timeout);
            }

            try {
                $response = Http::withHeaders($headers)
                    ->timeout($timeout)
                    ->withOptions([
                        'connect_timeout' => 30,
                        'timeout' => $timeout,
                        'read_timeout' => $timeout,
                    ])
                    ->post('https://api.openai.com/v1/chat/completions', $requestBody);
            } finally {
                if ($timeout > 60) {
                    ini_set('default_socket_timeout', $originalTimeout);
                    set_time_limit($originalMaxExecutionTime);
                }
            }

            if (!$response->successful()) {
                Log::error('OpenAI API Error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                
                throw new \Exception('OpenAI API error: ' . $response->body());
            }

            $result = $response->json();

            Log::info('OpenAI API Response', [
                'model' => $result['model'] ?? 'unknown',
                'has_choices' => isset($result['choices']),
            ]);

            // Save memory if enabled (run in background)
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                try {
                    // Extract user message and assistant response
                    $userMessage = '';
                    $assistantMessage = '';
                    
                    // Get last user message from config messages
                    if (!empty($config['messages']) && is_array($config['messages'])) {
                        $lastUserMsg = null;
                        foreach (array_reverse($config['messages']) as $msg) {
                            if (($msg['role'] ?? '') === 'user') {
                                $lastUserMsg = $this->resolveVariables($msg['content'] ?? '', $inputData);
                                break;
                            }
                        }
                        if ($lastUserMsg) {
                            $userMessage = $lastUserMsg;
                        }
                    }
                    
                    // Get assistant response from result using dynamic path
                    $assistantPath = $config['assistantMessagePath'] ?? 'choices[0].message.content';
                    $assistantMessage = $this->extractValueFromPath($result, $assistantPath);
                    
                    // Fallback if custom path doesn't work
                    if (empty($assistantMessage) && isset($result['choices'][0]['message']['content'])) {
                        $assistantMessage = $result['choices'][0]['message']['content'];
                    }
                    
                    // Save memory - lưu trực tiếp (không dispatch) để đảm bảo memory được lưu
                    if (!empty($userMessage) && !empty($assistantMessage)) {
                        // Resolve memoryId before saving (it might be a variable template)
                        $resolvedMemoryId = $this->resolveVariables($config['memoryId'], $inputData);
                        
                        if (empty($resolvedMemoryId)) {
                            Log::warning('OpenAI: Cannot save memory - memoryId resolved to empty', [
                                'original_memoryId' => $config['memoryId'],
                            ]);
                        } else {
                            $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                            $credentialId = $config['credentialId'] ?? null;
                            $modelName = $config['model'] ?? null;
                            
                            // Summarize before saving using the same AI model
                            $assistantPath = $config['assistantMessagePath'] ?? 'choices[0].message.content';
                            $summarized = $memoryService->summarizeMemory(
                                $userMessage, 
                                $assistantMessage,
                                'openai',
                                $credentialId,
                                $modelName,
                                $assistantPath
                            );
                            
                            // Save to cache - lưu trực tiếp
                            try {
                                $result = $memoryService->saveMemory(
                                    $resolvedMemoryId,
                                    $summarized['user'],
                                    $summarized['assistant'],
                                    $memoryLimit
                                );
                                
                                Log::info('OpenAI memory saved', [
                                    'memory_id' => $resolvedMemoryId,
                                    'save_result' => $result,
                                ]);
                            } catch (\Exception $e) {
                                Log::error('OpenAI: Exception saving memory', [
                                    'memory_id' => $resolvedMemoryId,
                                    'error' => $e->getMessage(),
                                    'trace' => $e->getTraceAsString(),
                                ]);
                            }
                        }
                    }
                } catch (\Exception $e) {
                    // Don't fail the request if memory save fails
                    Log::error('Failed to save OpenAI memory', [
                        'error' => $e->getMessage(),
                        'memory_id' => $config['memoryId'] ?? null,
                    ]);
                }
            }

            return $result;
        } catch (\Exception $e) {
            Log::error('OpenAI node execution failed', [
                'error' => $e->getMessage(),
                'config' => $config,
            ]);

            return [
                'error' => 'OpenAI request failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    private function executeGeminiNode($config, $inputData)
    {
        try {
            // DEBUG: Log config at the start
            Log::error('Gemini: DEBUG - executeGeminiNode START', [
                'config_keys' => array_keys($config),
                'credentialId' => $config['credentialId'] ?? 'NOT_SET',
                'credentialId_type' => gettype($config['credentialId'] ?? null),
                'model' => $config['model'] ?? 'NOT_SET',
            ]);
            
            // Build messages array
            $messages = [];
            
            // Add system message if enabled (Gemini supports system in messages array)
            if (!empty($config['systemMessageEnabled']) && !empty($config['systemMessage'])) {
                try {
                    $systemMessage = $this->resolveVariables($config['systemMessage'], $inputData);
                    if ($systemMessage) {
                        $messages[] = [
                            'role' => 'system',
                            'content' => $systemMessage
                        ];
                    }
                } catch (\Exception $e) {
                    // If variable not found, skip system message
                    Log::warning('Gemini: system message variable not found', [
                        'systemMessage' => $config['systemMessage'],
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            // Load memory from cache if enabled
            $memoryService = app(MemoryService::class);
            
            // DEBUG: Log memory config
            Log::error('Gemini: DEBUG - Memory config check', [
                'memoryEnabled' => $config['memoryEnabled'] ?? false,
                'memoryEnabled_type' => gettype($config['memoryEnabled'] ?? null),
                'memoryId' => $config['memoryId'] ?? 'NOT_SET',
                'memoryId_empty' => empty($config['memoryId'] ?? null),
            ]);
            
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                try {
                    // Resolve memoryId if it's a variable template
                    $originalMemoryId = $config['memoryId'];
                    Log::error('Gemini: DEBUG - Resolving memoryId', [
                        'original_memoryId' => $originalMemoryId,
                    ]);
                    
                    $memoryId = $this->resolveVariables($originalMemoryId, $inputData);
                    
                    Log::error('Gemini: DEBUG - memoryId resolved', [
                        'original' => $originalMemoryId,
                        'resolved' => $memoryId,
                        'is_empty' => empty($memoryId),
                    ]);
                    
                    if (empty($memoryId)) {
                        Log::warning('Gemini: memoryId resolved to empty', [
                            'original_memoryId' => $originalMemoryId,
                        ]);
                    } else {
                        $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                        $memories = $memoryService->getMemory($memoryId, $memoryLimit);
                        $memoryMessages = $memoryService->memoriesToMessages($memories);
                        
                        // Thêm memory messages vào đầu (sau system message)
                        $messages = array_merge($messages, $memoryMessages);
                        
                        Log::error('Gemini: DEBUG - Memory loaded successfully', [
                            'memory_id' => $memoryId,
                            'original_memoryId' => $originalMemoryId,
                            'memory_count' => count($memories),
                            'memory_messages_count' => count($memoryMessages),
                            'messages_after_memory' => count($messages),
                        ]);
                    }
                } catch (\Exception $e) {
                    Log::error('Gemini: DEBUG - Memory loading failed with exception', [
                        'memoryId' => $config['memoryId'],
                        'error' => $e->getMessage(),
                        'trace' => $e->getTraceAsString(),
                    ]);
                }
            } else {
                Log::error('Gemini: DEBUG - Memory not enabled or memoryId empty', [
                    'memoryEnabled' => $config['memoryEnabled'] ?? false,
                    'memoryId' => $config['memoryId'] ?? 'NOT_SET',
                ]);
            }

            // Add all user/assistant messages from config
            if (!empty($config['messages']) && is_array($config['messages'])) {
                foreach ($config['messages'] as $msg) {
                    try {
                        $originalContent = $msg['content'] ?? '';
                        Log::error('Gemini: DEBUG - Resolving message content', [
                            'original_content' => $originalContent,
                            'input_data_keys' => array_keys($inputData),
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
                        
                        $content = $this->resolveVariables($originalContent, $inputData);
                        
                        Log::error('Gemini: DEBUG - Message content resolved', [
                            'original' => $originalContent,
                            'resolved' => $content,
                            'is_empty' => empty($content),
                        ]);
                        
                        if (!empty($content)) {
                            $messages[] = [
                                'role' => $msg['role'] ?? 'user',
                                'content' => $content
                            ];
                        } else {
                            Log::warning('Gemini: Message content is empty after resolution', [
                                'original_content' => $originalContent,
                                'resolved_content' => $content,
                            ]);
                        }
                    } catch (\Exception $e) {
                        // If variable not found, skip this message
                        Log::warning('Gemini: message content variable not found', [
                            'message_content' => $msg['content'] ?? '',
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            }
            
            // Log final messages array
            Log::error('Gemini: DEBUG - Final messages array', [
                'messages_count' => count($messages),
                'messages' => $messages,
            ]);

            // Get credential
            $credentialId = $config['credentialId'] ?? null;
            
            // Handle string "null" or empty string
            if ($credentialId === 'null' || $credentialId === '') {
                $credentialId = null;
            }
            
            // Convert to integer if it's a numeric string
            if ($credentialId !== null && is_numeric($credentialId)) {
                $credentialId = (int)$credentialId;
            }
            
            if (empty($credentialId)) {
                Log::error('Gemini node: credentialId is missing or invalid', [
                    'credentialId' => $config['credentialId'] ?? null,
                    'config_keys' => array_keys($config),
                ]);
                throw new \Exception('Gemini API credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential) {
                Log::error('Gemini node: credential not found', [
                    'credentialId' => $credentialId,
                ]);
                throw new \Exception('Gemini credential not found');
            }

            // Log credential info immediately after finding it
            Log::error('Gemini: DEBUG - Credential found', [
                'credential_id' => $credential->id,
                'credential_type' => $credential->type,
                'credential_name' => $credential->name ?? null,
                'credential_data_type' => gettype($credential->data),
                'credential_data_is_null' => is_null($credential->data),
                'credential_data_is_array' => is_array($credential->data),
                'credential_data_keys' => is_array($credential->data) ? array_keys($credential->data ?? []) : 'NOT_ARRAY',
                'has_data_key' => is_array($credential->data) && isset($credential->data['key']),
                'data_key_value_preview' => is_array($credential->data) && isset($credential->data['key']) ? substr($credential->data['key'], 0, 20) . '...' : 'NO_KEY',
            ]);

            // Get API key from credential based on type
            $apiKey = null;
            Log::info('Gemini: Extracting API key from credential', [
                'credential_id' => $credential->id,
                'credential_type' => $credential->type,
                'credential_name' => $credential->name ?? null,
                'credential_data' => $credential->data,
                'credential_data_keys' => is_array($credential->data) ? array_keys($credential->data ?? []) : 'NOT_ARRAY',
                'credential_data_is_null' => is_null($credential->data),
            ]);
            
            if ($credential->type === 'gemini') {
                $apiKey = $credential->data['key'] ?? null;
                Log::info('Gemini: Using gemini type credential', [
                    'has_key' => isset($credential->data['key']),
                    'key_length' => $apiKey ? strlen($apiKey) : 0,
                ]);
            } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
                // Backward compatibility with old custom header credentials
                $headerValue = $credential->data['headerValue'];
                $apiKey = $headerValue;
                if (strpos($headerValue, 'Bearer ') === 0) {
                    $apiKey = substr($headerValue, 7);
                }
                Log::info('Gemini: Using custom type credential', [
                    'has_headerValue' => isset($credential->data['headerValue']),
                    'key_length' => $apiKey ? strlen($apiKey) : 0,
                ]);
            } elseif ($credential->type === 'bearer' && isset($credential->data['token'])) {
                // Backward compatibility with bearer token credentials
                $apiKey = $credential->data['token'];
                Log::info('Gemini: Using bearer type credential', [
                    'has_token' => isset($credential->data['token']),
                    'key_length' => $apiKey ? strlen($apiKey) : 0,
                ]);
            } else {
                Log::warning('Gemini: Credential type not matched', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                    'credential_data' => $credential->data ?? [],
                    'expected_types' => ['gemini', 'custom', 'bearer'],
                ]);
            }

            if (!$apiKey) {
                Log::error('Gemini: API key not found in credential', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                    'credential_name' => $credential->name ?? null,
                    'credential_data' => $credential->data ?? [],
                    'credential_data_type' => gettype($credential->data ?? null),
                    'has_data_key' => is_array($credential->data) && isset($credential->data['key']),
                    'has_data_headerValue' => is_array($credential->data) && isset($credential->data['headerValue']),
                    'has_data_token' => is_array($credential->data) && isset($credential->data['token']),
                ]);
                throw new \Exception('Invalid Gemini credential configuration: API key is missing');
            }
            
            Log::info('Gemini: API key extracted successfully', [
                'key_length' => strlen($apiKey),
                'key_preview' => substr($apiKey, 0, 10) . '...',
            ]);

            // Build request body
            $requestBody = [
                'model' => $config['model'] ?? 'gemini-2.0-flash',
                'messages' => $messages,
            ];

            $allowedGeminiOptions = ['max_tokens', 'temperature', 'top_p', 'stream'];
            $requestBody = array_merge(
                $requestBody,
                $this->extractAllowedOptions($config, $allowedGeminiOptions)
            );

            // Add functions if provided
            if (!empty($config['functions']) && is_array($config['functions'])) {
                $functions = [];
                foreach ($config['functions'] as $func) {
                    if (!empty($func['name'])) {
                        $functions[] = [
                            'name' => $func['name'],
                            'description' => $func['description'] ?? '',
                            'parameters' => $func['parameters'] ?? [
                                'type' => 'object',
                                'properties' => [],
                                'required' => []
                            ]
                        ];
                    }
                }
                if (!empty($functions)) {
                    $requestBody['functions'] = $functions;
                    
                    // Add function_call
                    $functionCall = $config['functionCall'] ?? 'auto';
                    if ($functionCall === 'none') {
                        $requestBody['function_call'] = 'none';
                    } elseif ($functionCall !== 'auto') {
                        // Specific function name
                        $requestBody['function_call'] = ['name' => $functionCall];
                    } else {
                        $requestBody['function_call'] = 'auto';
                    }
                }
            }

            // Add advanced options
            if (!empty($config['advancedOptions']) && is_array($config['advancedOptions'])) {
                foreach ($config['advancedOptions'] as $key => $value) {
                    if ($key === 'timeout') continue;
                    
                    if (is_numeric($value)) {
                        $requestBody[$key] = strpos($value, '.') !== false 
                            ? floatval($value) 
                            : intval($value);
                    } elseif (is_bool($value)) {
                        $requestBody[$key] = $value;
                    } else {
                        $requestBody[$key] = $value;
                    }
                }
            }

            // Get timeout - prioritize advancedOptions over config
            $timeout = 60;
            $configTimeout = isset($config['timeout']) ? (int)$config['timeout'] : null;
            $advancedTimeout = !empty($config['advancedOptions']['timeout']) ? (int)$config['advancedOptions']['timeout'] : null;
            
            // Use the larger timeout value (advancedOptions takes priority if both exist)
            if ($advancedTimeout !== null) {
                $timeout = $advancedTimeout;
            } elseif ($configTimeout !== null) {
                $timeout = $configTimeout;
            }

            Log::info('Gemini API Request', [
                'model' => $requestBody['model'],
                'messages_count' => count($messages),
                'has_functions' => isset($requestBody['functions']),
                'stream' => $requestBody['stream'] ?? false,
            ]);

            // Build headers
            // Gemini OpenAI-compatible endpoint requires Authorization header
            // Also include x-goog-api-key as fallback
            Log::error('Gemini: DEBUG - Before building headers', [
                'api_key_is_null' => is_null($apiKey),
                'api_key_is_empty' => empty($apiKey),
                'api_key_type' => gettype($apiKey),
                'api_key_length' => $apiKey ? strlen($apiKey) : 0,
                'api_key_preview' => $apiKey ? substr($apiKey, 0, 20) . '...' : 'NULL',
            ]);
            
            $headers = [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $apiKey,
                'x-goog-api-key' => $apiKey, // Fallback
            ];
            
            Log::info('Gemini: Request headers prepared', [
                'has_authorization' => isset($headers['Authorization']),
                'has_x_goog_api_key' => isset($headers['x-goog-api-key']),
                'api_key_length' => strlen($apiKey),
                'authorization_header' => $headers['Authorization'],
            ]);

            Log::info('Gemini timeout setting', [
                'config_timeout' => $configTimeout,
                'advanced_timeout' => $advancedTimeout,
                'final_timeout' => $timeout,
            ]);

            // Increase PHP execution time limit for long requests
            $originalMaxExecutionTime = ini_get('max_execution_time');
            if ($timeout > 60) {
                set_time_limit($timeout + 30); // Add 30s buffer
            }

            // Make HTTP request to Gemini API
            $originalTimeout = ini_get('default_socket_timeout');
            if ($timeout > 60) {
                ini_set('default_socket_timeout', $timeout);
            }

            try {
                $response = Http::withHeaders($headers)
                    ->timeout($timeout)
                    ->withOptions([
                        'connect_timeout' => 30,
                        'timeout' => $timeout,
                        'read_timeout' => $timeout,
                    ])
                    ->post('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', $requestBody);
            } finally {
                if ($timeout > 60) {
                    ini_set('default_socket_timeout', $originalTimeout);
                    set_time_limit($originalMaxExecutionTime);
                }
            }

            if (!$response->successful()) {
                Log::error('Gemini API Error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                
                throw new \Exception('Gemini API error: ' . $response->body());
            }

            $result = $response->json();

            Log::info('Gemini API Response', [
                'model' => $result['model'] ?? 'unknown',
                'has_choices' => isset($result['choices']),
                'choices_count' => isset($result['choices']) ? count($result['choices']) : 0,
            ]);

            // Save memory if enabled (run in background)
            if (!empty($config['memoryEnabled']) && !empty($config['memoryId'])) {
                try {
                    // Extract user message and assistant response
                    $userMessage = '';
                    $assistantMessage = '';
                    
                    // Get last user message from config messages
                    if (!empty($config['messages']) && is_array($config['messages'])) {
                        $lastUserMsg = null;
                        foreach (array_reverse($config['messages']) as $msg) {
                            if (($msg['role'] ?? '') === 'user') {
                                $lastUserMsg = $this->resolveVariables($msg['content'] ?? '', $inputData);
                                break;
                            }
                        }
                        if ($lastUserMsg) {
                            $userMessage = $lastUserMsg;
                        }
                    }
                    
                    // Get assistant response from result using dynamic path
                    $assistantPath = $config['assistantMessagePath'] ?? 'candidates[0].content.parts[0].text';
                    $assistantMessage = $this->extractValueFromPath($result, $assistantPath);
                    
                    // Fallback to common paths if custom path doesn't work
                    if (empty($assistantMessage)) {
                        if (isset($result['candidates'][0]['content']['parts'][0]['text'])) {
                            $assistantMessage = $result['candidates'][0]['content']['parts'][0]['text'];
                        } elseif (isset($result['choices'][0]['message']['content'])) {
                            $assistantMessage = $result['choices'][0]['message']['content'];
                        }
                    }
                    
                    // Save memory in background (async)
                    if (!empty($userMessage) && !empty($assistantMessage)) {
                        // Resolve memoryId before saving (it might be a variable template)
                        $resolvedMemoryId = $this->resolveVariables($config['memoryId'], $inputData);
                        
                        if (empty($resolvedMemoryId)) {
                            Log::warning('Gemini: Cannot save memory - memoryId resolved to empty', [
                                'original_memoryId' => $config['memoryId'],
                            ]);
                        } else {
                            $memoryLimit = isset($config['memoryLimit']) ? (int)$config['memoryLimit'] : 10;
                            $credentialId = $config['credentialId'] ?? null;
                            $modelName = $config['model'] ?? null;
                            
                            // Summarize before saving using the same AI model
                            $assistantPath = $config['assistantMessagePath'] ?? 'candidates[0].content.parts[0].text';
                            $summarized = $memoryService->summarizeMemory(
                                $userMessage, 
                                $assistantMessage,
                                'gemini',
                                $credentialId,
                                $modelName,
                                $assistantPath
                            );
                            
                            // Save to cache - lưu trực tiếp (không dispatch) để đảm bảo memory được lưu
                            try {
                                Log::error('Gemini: DEBUG - Saving memory directly', [
                                    'memory_id' => $resolvedMemoryId,
                                    'has_summarized' => !empty($summarized),
                                    'summarized_keys' => is_array($summarized) ? array_keys($summarized) : 'NOT_ARRAY',
                                ]);
                                
                                $result = $memoryService->saveMemory(
                                    $resolvedMemoryId,
                                    $summarized['user'],
                                    $summarized['assistant'],
                                    $memoryLimit
                                );
                                
                                Log::error('Gemini: DEBUG - Memory save result', [
                                    'memory_id' => $resolvedMemoryId,
                                    'save_result' => $result,
                                ]);
                            } catch (\Exception $e) {
                                Log::error('Gemini: DEBUG - Exception saving memory', [
                                    'memory_id' => $resolvedMemoryId,
                                    'error' => $e->getMessage(),
                                    'trace' => $e->getTraceAsString(),
                                ]);
                            }
                            
                            Log::error('Gemini: DEBUG - Memory save dispatched', [
                                'original_memoryId' => $config['memoryId'],
                                'resolved_memoryId' => $resolvedMemoryId,
                                'user_message_preview' => substr($userMessage, 0, 50),
                                'assistant_message_preview' => substr($assistantMessage, 0, 50),
                            ]);
                        }
                    } else {
                        Log::error('Gemini: DEBUG - Cannot save memory - missing messages', [
                            'has_userMessage' => !empty($userMessage),
                            'has_assistantMessage' => !empty($assistantMessage),
                        ]);
                    }
                } catch (\Exception $e) {
                    // Don't fail the request if memory save fails
                    Log::error('Failed to save Gemini memory', [
                        'error' => $e->getMessage(),
                        'memory_id' => $config['memoryId'] ?? null,
                    ]);
                }
            }

            return $result;
        } catch (\Exception $e) {
            Log::error('Gemini node execution failed', [
                'error' => $e->getMessage(),
                'config' => $config,
            ]);

            return [
                'error' => 'Gemini request failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Extract allowed option keys from config/advancedOptions with proper type normalization.
     */
    private function extractAllowedOptions(array $config, array $allowedKeys): array
    {
        $options = [];

        foreach ($allowedKeys as $key) {
            $hasDirectValue = array_key_exists($key, $config) && $config[$key] !== null && $config[$key] !== '';
            $hasAdvancedValue = !empty($config['advancedOptions']) && is_array($config['advancedOptions']) && array_key_exists($key, $config['advancedOptions']);

            if ($hasDirectValue) {
                $options[$key] = $this->normalizeOptionValue($config[$key]);
                continue;
            }

            if ($hasAdvancedValue) {
                $options[$key] = $this->normalizeOptionValue($config['advancedOptions'][$key]);
            }
        }

        return $options;
    }

    /**
     * Normalize option values to int/float/bool when possible.
     */
    private function normalizeOptionValue($value)
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            $lower = strtolower($value);
            if ($lower === 'true') {
                return true;
            }
            if ($lower === 'false') {
                return false;
            }
        }

        if (is_numeric($value)) {
            return strpos((string)$value, '.') !== false
                ? (float)$value
                : (int)$value;
        }

        return $value;
    }


    private function resolveVariables($template, $inputData, $workflow = null)
    {
        if (!is_string($template)) {
            return $template;
        }

        Log::info('Resolving template', [
            'template_preview' => substr($template, 0, 200),
            'available_node_names' => array_filter(array_keys($inputData), function($key) {
                return !is_numeric($key);
            }),
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
        $template = preg_replace_callback('/\{\{\s*\$\(\'([^\']+)\'\)\.item\.json\.([^}]+)\s*\}\}/', function ($matches) use ($inputData, $workflow, $template) {
            $nodeName = trim($matches[1]);
            $path = trim($matches[2]);
            $fullPath = $nodeName . '.' . $path;
            
            $result = $this->getValueFromPathWithExists($fullPath, $inputData, $workflow);
            
            if ($result['exists']) {
                Log::info('n8n syntax resolution - SUCCESS', [
                    'original' => $matches[0],
                    'node_name' => $nodeName,
                    'path' => $path,
                    'value_was_null' => $result['value'] === null,
                ]);
                return $this->stringifyResolvedValue($result['value']);
            }
            
            // Variable not found - THROW ERROR
            $availableNodes = array_filter(array_keys($inputData), function($key) {
                return !is_numeric($key);
            });
            
            Log::error('n8n syntax variable not found - STOPPING execution', [
                'variable' => $matches[0],
                'node_name' => $nodeName,
                'path' => $path,
                'available_nodes' => $availableNodes,
            ]);
            
            throw new \Exception("Variable not found: {$matches[0]}. Available nodes: " . implode(', ', $availableNodes));
        }, $template);

        // Then, replace {{variable}} patterns (preg_replace_callback replaces ALL matches)
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($inputData, $workflow, $template) {
            $path = trim($matches[1]);
            $result = $this->getValueFromPathWithExists($path, $inputData, $workflow);

            if ($result['exists']) {
                $value = $result['value'];
                Log::info('Variable resolution - SUCCESS', [
                    'original' => $matches[0],
                    'path' => $path,
                    'value_preview' => is_string($value) ? substr($value, 0, 100) : gettype($value),
                    'value_was_null' => $value === null,
                ]);
                return $this->stringifyResolvedValue($value);
            }

            // Variable not found - THROW ERROR to stop workflow
            $availableNodes = array_filter(array_keys($inputData), function($key) {
                return !is_numeric($key);
            });
            
            Log::error('Variable not found - STOPPING execution', [
                'variable' => $matches[0],
                'path' => $path,
                'available_nodes' => $availableNodes,
                'template_preview' => substr($template, 0, 200),
            ]);
            
            throw new \Exception("Variable not found: {$matches[0]}. Available nodes: " . implode(', ', $availableNodes));
        }, $template);
    }

    private function stringifyResolvedValue($value)
    {
        if ($value === null) {
            return 'null';
        }

        if (is_string($value)) {
            return $value;
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        if (is_numeric($value)) {
            return (string) $value;
        }

        if (is_array($value) || is_object($value)) {
            return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        return (string) $value;
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
                return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($inputData, $data) {
                    $path = trim($matches[1]);
                    $result = $this->getValueFromPathWithExists($path, $inputData);
                    
                    if ($result['exists']) {
                        return $this->stringifyResolvedValue($result['value']);
                    }
                    
                    // Variable not found - THROW ERROR
                    $availableNodes = array_filter(array_keys($inputData), function($key) {
                        return !is_numeric($key);
                    });
                    
                    Log::error('Variable not found in JSON body - STOPPING execution', [
                        'variable' => $matches[0],
                        'path' => $path,
                        'available_nodes' => $availableNodes,
                    ]);
                    
                    throw new \Exception("Variable not found: {$matches[0]}. Available nodes: " . implode(', ', $availableNodes));
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
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($inputData, $code) {
            $path = trim($matches[1]);
            $result = $this->getValueFromPathWithExists($path, $inputData);

            // Check if path was found (key exists, even if value is null)
            if ($result['exists']) {
                $value = $result['value'];
                
                // Encode value as JSON for safe JavaScript insertion
                if ($value === null) {
                    return 'null';
                } elseif (is_string($value)) {
                    // String: wrap in quotes and escape (even if empty)
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

            // Path not found (key doesn't exist), THROW ERROR to stop workflow
            $availableNodes = array_filter(array_keys($inputData), function($key) {
                return !is_numeric($key);
            });
            
            Log::error('Variable not found in Code node - STOPPING execution', [
                'variable' => $matches[0],
                'path' => $path,
                'available_nodes' => $availableNodes,
                'code_preview' => substr($code, 0, 200),
            ]);
            
            throw new \Exception("Variable not found: {$matches[0]}. Available nodes: " . implode(', ', $availableNodes));
        }, $code);
    }

    /**
     * Helper function to tokenize and traverse a path with complex array indices
     * Supports: "field", "field[0]", "field[0][1]", "field[0].nested[1].deep"
     * 
     * @param string $pathSegment The remaining path to traverse
     * @param mixed $startValue The starting value to traverse from
     * @return mixed The resolved value or null if not found
     */
    private function traversePath($pathSegment, $startValue)
    {
        if (empty($pathSegment)) {
            return $startValue;
        }
        
        // Tokenize the segment into parts
        // "optimized_messages[0].summaryAssistantMessage" -> ["optimized_messages", "[0]", "summaryAssistantMessage"]
        $tokens = [];
        $currentToken = '';
        $i = 0;
        $length = strlen($pathSegment);
        
        while ($i < $length) {
            $char = $pathSegment[$i];
            
            if ($char === '.') {
                if ($currentToken !== '') {
                    $tokens[] = $currentToken;
                    $currentToken = '';
                }
            } elseif ($char === '[') {
                if ($currentToken !== '') {
                    $tokens[] = $currentToken;
                    $currentToken = '';
                }
                $endBracket = strpos($pathSegment, ']', $i);
                if ($endBracket === false) {
                    return null;
                }
                $tokens[] = substr($pathSegment, $i, $endBracket - $i + 1);
                $i = $endBracket + 1;
                continue;
            } else {
                $currentToken .= $char;
            }
            $i++;
        }
        
        if ($currentToken !== '') {
            $tokens[] = $currentToken;
        }
        
        // Traverse using tokens
        $current = $startValue;
        
        foreach ($tokens as $token) {
            if (empty($token)) {
                continue;
            }
            
            // Check if token is an array index like "[0]"
            if (preg_match('/^\[(\d+)\]$/', $token, $matches)) {
                $index = (int) $matches[1];
                
                if (is_array($current) && isset($current[$index])) {
                    $current = $current[$index];
                } else {
                    return null;
                }
            } else {
                // Object key access - use array_key_exists to distinguish between:
                // 1. Key doesn't exist (should return null)
                // 2. Key exists but value is null (should return null but it's valid)
                if (is_array($current) && array_key_exists($token, $current)) {
                    $current = $current[$token];
                    
                    // Log để debug
                    Log::info('Traverse path - key found', [
                        'token' => $token,
                        'value_type' => gettype($current),
                        'value_is_null' => $current === null,
                        'value_is_empty_string' => $current === '',
                        'value' => is_string($current) ? substr($current, 0, 50) : $current,
                    ]);
                } else {
                    // Key truly doesn't exist
                    Log::warning('Traverse path - key NOT found', [
                        'token' => $token,
                        'current_type' => gettype($current),
                        'current_is_array' => is_array($current),
                        'available_keys' => is_array($current) ? array_keys($current) : 'N/A',
                    ]);
                    return null;
                }
            }
        }
        
        // Log final value
        Log::info('Traverse path - FINAL result', [
            'final_value_type' => gettype($current),
            'final_value_is_empty_string' => $current === '',
            'final_value' => is_string($current) ? substr($current, 0, 100) : (is_array($current) ? '[array]' : $current),
        ]);
        
        return $current;
    }

    /**
     * Get value from path with exists flag
     * Returns ['exists' => bool, 'value' => mixed]
     */
    private function getValueFromPathWithExists($path, $inputData, $workflow = null)
    {
        // Handle built-in variables (like 'now')
        if ($path === 'now') {
            return [
                'exists' => true,
                'value' => now('Asia/Ho_Chi_Minh')->format('d/m/Y H:i:s'),
            ];
        }
        
        $value = $this->getValueFromPath($path, $inputData, $workflow);
        
        // If value is null, we can't tell if key exists or not with current implementation
        // So we need to track it differently. For now, use a sentinel value.
        // A better approach: modify getValueFromPath to return object, but that's a big refactor.
        
        // Quick fix: If getValueFromPath returns null, check if the last token exists in parent
        if ($value === null) {
            // Try to verify if the path truly exists by checking parent
            $exists = $this->pathExists($path, $inputData);
            return ['exists' => $exists, 'value' => null];
        }
        
        return ['exists' => true, 'value' => $value];
    }
    
    private function splitPathSegments(string $path): array
    {
        if ($path === '') {
            return [];
        }

        $path = trim($path);

        if (str_starts_with($path, '"')) {
            $length = strlen($path);
            $segment = '';
            $segments = [];
            $escaped = false;

            for ($i = 1; $i < $length; $i++) {
                $char = $path[$i];

                if ($char === '\\' && !$escaped) {
                    $escaped = true;
                    continue;
                }

                if ($char === '"' && !$escaped) {
                    $segments[] = stripcslashes($segment);
                    $i++;
                    $remaining = substr($path, $i);

                    if ($remaining !== '' && $remaining[0] === '.') {
                        $remaining = substr($remaining, 1);
                    }

                    if ($remaining !== '') {
                        $segments = array_merge($segments, explode('.', $remaining));
                    }

                    return $segments;
                }

                $segment .= $char;
                $escaped = false;
            }

            // If we exit the loop without closing quote, treat as unquoted path
        }

        return explode('.', $path);
    }
    
    /**
     * Check if a path exists (even if value is null)
     * Uses same logic as getValueFromPath but tracks if path was found
     */
    private function pathExists($path, $inputData)
    {
        $parts = $this->splitPathSegments($path);
        $nodeName = $parts[0];
        
        // Handle array index in first part
        if (preg_match('/^([^\[]+)(\[.*)$/', $parts[0], $arrayIndexMatch)) {
            $nodeName = $arrayIndexMatch[1];
        }
        
        if (!isset($inputData[$nodeName]) || is_numeric($nodeName)) {
            return false;
        }
        
        $current = $inputData[$nodeName];
        
        // Build remaining path same way as getValueFromPath
        $remainingPath = '';
        if (preg_match('/^([^\[]+)(\[.*)$/', $parts[0], $arrayIndexMatch)) {
            $arrayPart = $arrayIndexMatch[2];
            if (count($parts) > 1) {
                $remainingPath = $arrayPart . '.' . implode('.', array_slice($parts, 1));
            } else {
                $remainingPath = $arrayPart;
            }
        } else {
            if (count($parts) > 1) {
                $remainingPath = implode('.', array_slice($parts, 1));
            }
        }
        
        if ($remainingPath === '') {
            return true;
        }
        
        // Use traversePath and check if result is NOT a "not found" sentinel
        // Since traversePath returns null for both "not found" and "found but null value",
        // we need a different approach: modify traversePath temporarily to track exists
        $result = $this->traversePathWithExists($remainingPath, $current);
        return $result['exists'];
    }
    
    /**
     * Traverse path and return ['exists' => bool, 'value' => mixed]
     */
    private function traversePathWithExists($pathSegment, $startValue)
    {
        if (empty($pathSegment)) {
            return ['exists' => true, 'value' => $startValue];
        }
        
        // Use same tokenization as traversePath
        $tokens = [];
        $currentToken = '';
        $i = 0;
        $length = strlen($pathSegment);
        
        while ($i < $length) {
            $char = $pathSegment[$i];
            
            if ($char === '.') {
                if ($currentToken !== '') {
                    $tokens[] = $currentToken;
                    $currentToken = '';
                }
            } elseif ($char === '[') {
                if ($currentToken !== '') {
                    $tokens[] = $currentToken;
                    $currentToken = '';
                }
                $endBracket = strpos($pathSegment, ']', $i);
                if ($endBracket === false) {
                    return ['exists' => false, 'value' => null];
                }
                $tokens[] = substr($pathSegment, $i, $endBracket - $i + 1);
                $i = $endBracket + 1;
                continue;
            } else {
                $currentToken .= $char;
            }
            $i++;
        }
        
        if ($currentToken !== '') {
            $tokens[] = $currentToken;
        }
        
        // Traverse using tokens
        $current = $startValue;
        
        foreach ($tokens as $token) {
            if (empty($token)) {
                continue;
            }
            
            // Check if token is an array index like "[0]"
            if (preg_match('/^\[(\d+)\]$/', $token, $matches)) {
                $index = (int) $matches[1];
                
                if (is_array($current) && isset($current[$index])) {
                    $current = $current[$index];
                } else {
                    return ['exists' => false, 'value' => null];
                }
            } else {
                // Object key access - use array_key_exists
                if (is_array($current) && array_key_exists($token, $current)) {
                    $current = $current[$token];
                } else {
                    return ['exists' => false, 'value' => null];
                }
            }
        }
        
        return ['exists' => true, 'value' => $current];
    }

    private function getValueFromPath($path, $inputData, $workflow = null)
    {
        // Handle built-in variables (like 'now')
        if ($path === 'now') {
            // Return current date/time in Vietnamese format
            $now = now('Asia/Ho_Chi_Minh');
            return $now->format('d/m/Y H:i:s');
        }
        
        if (empty($inputData) || !is_array($inputData)) {
            Log::warning('getValueFromPath: inputData is empty or not array', [
                'path' => $path,
                'inputData_type' => gettype($inputData),
            ]);
            return null;
        }

        Log::info('Getting value from path', [
            'path' => $path,
            'inputData_keys' => array_keys($inputData),
            'inputData_sample' => isset($inputData[0]) ? array_keys($inputData[0] ?? []) : [],
            'all_node_names' => array_filter(array_keys($inputData), function($key) {
                return !is_numeric($key);
            }),
        ]);

        $parts = $this->splitPathSegments($path);

        Log::info('🔍 Path parsing', [
            'original_path' => $path,
            'parts' => $parts,
            'first_part' => $parts[0] ?? 'NONE',
            'exists_in_inputData' => isset($parts[0]) && isset($inputData[$parts[0]]),
            'is_numeric' => isset($parts[0]) && is_numeric($parts[0]),
        ]);

        // PRIORITY 1: Try to resolve by node customName (e.g., "Webhook1.body.content")
        // IMPORTANT: Handle case where firstPart might contain array index
        // Example: "top 3 urls[0].string_top_url" → firstPart = "top 3 urls[0]"
        // We need to extract nodeName = "top 3 urls" and remainingPath = "[0].string_top_url"
        
        $nodeName = $parts[0];
        $remainingPath = '';
        
        // Check if firstPart contains array index like "top 3 urls[0]"
        if (preg_match('/^([^\[]+)(\[.*)$/', $parts[0], $arrayIndexMatch)) {
            $nodeName = $arrayIndexMatch[1]; // "top 3 urls"
            $arrayPart = $arrayIndexMatch[2]; // "[0]"
            
            // Build remaining path: "[0].string_top_url"
            if (count($parts) > 1) {
                $remainingPath = $arrayPart . '.' . implode('.', array_slice($parts, 1));
            } else {
                $remainingPath = $arrayPart;
            }
        } else {
            // No array index in first part, normal path
            if (count($parts) > 1) {
                $remainingPath = implode('.', array_slice($parts, 1));
            }
        }
        
        // Check if nodeName exists in inputData
        if (isset($inputData[$nodeName]) && !is_numeric($nodeName)) {
            $value = $inputData[$nodeName];
            
            Log::info('✅ Found node by customName', [
                'node_name' => $nodeName,
                'remaining_path' => $remainingPath,
            ]);
            
            // If there's a remaining path, traverse it using the helper
            if ($remainingPath !== '') {
                $value = $this->traversePath($remainingPath, $value);
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
                // If there are more parts, traverse them using the helper
                if (count($parts) > 1) {
                    $remainingPath = implode('.', array_slice($parts, 1));
                    $value = $this->traversePath($remainingPath, $value);
                }
                
                return $value;
            }
        }

        // PRIORITY 3: Try to find in any input (backward compat)
        foreach ($inputData as $input) {
            if (!is_array($input)) {
                continue;
            }
            
            // Try to traverse the entire path from this input
            $value = $this->traversePath($path, $input);
            
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
        $auth = $config['auth'] ?? 'header'; // header or query

        switch ($authType) {
            case 'bearer':
                // Bearer token is stored in credentials table
                $credentialId = $config['credentialId'] ?? null;
                if (!$credentialId) {
                    // No credential provided - allow request to pass (no security)
                    \Log::info('Bearer auth configured but no credentialId provided - allowing request without authentication');
                    return true;
                }

                $credential = \App\Models\Credential::find($credentialId);
                if (!$credential) {
                    // Credential not found - allow request to pass (no security)
                    \Log::info('Bearer credential not found - allowing request without authentication', ['credentialId' => $credentialId]);
                    return true;
                }

                // Support both old (headerValue) and new (token) format
                $expectedToken = $credential->data['token'] ?? $credential->data['headerValue'] ?? null;
                if (!$expectedToken) {
                    // Token not found in credential - allow request to pass (no security)
                    \Log::info('Bearer token not found in credential data - allowing request without authentication', ['credentialId' => $credentialId]);
                    return true;
                }
                
                // Remove "Bearer " prefix if present in stored token
                $expectedToken = str_replace('Bearer ', '', $expectedToken);

                // Get token from Authorization header or query param
                if ($auth === 'header') {
                    $authHeader = $request->header('Authorization', '');
                    $providedToken = str_replace('Bearer ', '', $authHeader);
                } else {
                    // Query auth: look for token in query params
                    $providedToken = $request->query('token', $request->query('access_token', ''));
                }

                return !empty($expectedToken) && hash_equals($expectedToken, $providedToken);

            case 'basic':
                $expectedUsername = $config['username'] ?? '';
                $expectedPassword = $config['password'] ?? '';

                if ($auth === 'header') {
                    $authHeader = $request->header('Authorization', '');

                    if (strpos($authHeader, 'Basic ') !== 0) {
                        return false;
                    }

                    $credentials = base64_decode(str_replace('Basic ', '', $authHeader));
                    list($username, $password) = explode(':', $credentials, 2);
                } else {
                    // Query auth: look for username/password in query params
                    $username = $request->query('username', '');
                    $password = $request->query('password', '');
                }

                return hash_equals($expectedUsername, $username) &&
                       hash_equals($expectedPassword, $password);

            case 'apiKey':
                $keyName = $config['apiKeyName'] ?? '';
                $expectedKeyValue = $config['apiKeyValue'] ?? '';

                if ($auth === 'header') {
                    $providedKeyValue = $request->header($keyName, '');
                } else {
                    // Query auth: look in query params
                    $providedKeyValue = $request->query($keyName, '');
                }

                // Also check request body as fallback
                if (empty($providedKeyValue)) {
                    $providedKeyValue = $request->input($keyName, '');
                }

                return !empty($expectedKeyValue) && hash_equals($expectedKeyValue, $providedKeyValue);

            case 'custom':
                $headerName = $config['customHeaderName'] ?? '';
                $expectedHeaderValue = $config['customHeaderValue'] ?? '';

                if ($auth === 'header') {
                    $providedHeaderValue = $request->header($headerName, '');
                } else {
                    // Query auth: look in query params
                    $providedHeaderValue = $request->query($headerName, '');
                }

                return !empty($expectedHeaderValue) && hash_equals($expectedHeaderValue, $providedHeaderValue);

            case 'oauth2':
                // OAuth2 token is stored in credentials table
                $credentialId = $config['credentialId'] ?? null;
                if (!$credentialId) {
                    // No credential provided - allow request to pass (no security)
                    \Log::info('OAuth2 auth configured but no credentialId provided - allowing request without authentication');
                    return true;
                }

                $credential = \App\Models\Credential::find($credentialId);
                if (!$credential || !isset($credential->data['accessToken'])) {
                    // Credential not found or invalid - allow request to pass (no security)
                    \Log::info('OAuth2 credential not found or invalid - allowing request without authentication', ['credentialId' => $credentialId]);
                    return true;
                }

                $expectedToken = $credential->data['accessToken'];
                // Remove "Bearer " prefix if present
                $expectedToken = str_replace('Bearer ', '', $expectedToken);

                // Get token from Authorization header or query param
                if ($auth === 'header') {
                    $authHeader = $request->header('Authorization', '');
                    $providedToken = str_replace('Bearer ', '', $authHeader);
                } else {
                    $providedToken = $request->query('token', $request->query('access_token', ''));
                }

                return !empty($expectedToken) && hash_equals($expectedToken, $providedToken);

            case 'digest':
                // Digest auth requires a challenge-response mechanism
                // For simplicity, we'll validate username/password from the request
                $expectedUsername = $config['username'] ?? '';
                $expectedPassword = $config['password'] ?? '';

                if ($auth === 'header') {
                    $authHeader = $request->header('Authorization', '');
                    // Parse Digest header if present
                    if (strpos($authHeader, 'Digest ') === 0) {
                        // This is a simplified check - real Digest auth is more complex
                        // In production, you should implement full RFC 2617 Digest authentication
                        return hash_equals($expectedUsername, 'username') && hash_equals($expectedPassword, 'password');
                    }
                    return false;
                } else {
                    // Query auth: username/password in query params
                    $username = $request->query('username', '');
                    $password = $request->query('password', '');
                    
                    return !empty($expectedUsername) && hash_equals($expectedUsername, $username) &&
                           !empty($expectedPassword) && hash_equals($expectedPassword, $password);
                }

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

        // Normalize path (remove leading/trailing slashes for consistent matching)
        $path = trim($request->input('path'), '/');
        
        // Cleanup old test listeners for this path and workflow before starting new one
        $this->cleanupOldTestListeners($workflowId, $path);
        
        // Store test listening state in cache for 5 minutes
        \Illuminate\Support\Facades\Cache::put("webhook_test_listening_{$testRunId}", [
            'workflow_id' => $workflowId,
            'node_id' => $request->input('node_id'),
            'path' => $path,
            'method' => $request->input('method'),
            'auth' => $request->input('auth'),
            'auth_type' => $request->input('auth_type'),
            'credential_id' => $request->input('credential_id'), // For bearer/oauth2
            'auth_config' => $request->input('auth_config'),
            'custom_response_enabled' => $request->input('custom_response_enabled', false),
            'custom_response' => $request->input('custom_response', ''),
            'started_at' => now(),
        ], now()->addMinutes(5));
        
        Log::info('Test webhook listener started', [
            'test_run_id' => $testRunId,
            'path' => $path,
            'method' => $request->input('method'),
            'workflow_id' => $workflowId,
            'auth' => $request->input('auth'),
            'auth_type' => $request->input('auth_type'),
            'credential_id' => $request->input('credential_id'),
            'has_auth_config' => !empty($request->input('auth_config')),
        ]);
        
        // If credential_id is provided, log credential details
        if ($request->input('credential_id')) {
            $credential = \App\Models\Credential::find($request->input('credential_id'));
            if ($credential) {
                Log::info('Credential loaded for test listener', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                    'has_data' => !empty($credential->data),
                    'data_keys' => $credential->data ? array_keys($credential->data) : [],
                    'has_token' => !!(isset($credential->data['token']) || isset($credential->data['headerValue'])),
                    'has_accessToken' => !!(isset($credential->data['accessToken'])),
                ]);
            } else {
                Log::warning('Credential not found for test listener', [
                    'credential_id' => $request->input('credential_id'),
                ]);
            }
        }

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
            Log::info('Test status check - stopped', ['test_run_id' => $testRunId]);
            return response()->json([
                'status' => 'stopped',
                'message' => 'Test stopped by user'
            ]);
        }

        $cacheKey = "webhook_test_listening_{$testRunId}";
        $listeningData = \Illuminate\Support\Facades\Cache::get($cacheKey);

        if (!$listeningData) {
            Log::warning('Test status check - session not found', ['test_run_id' => $testRunId]);
            return response()->json([
                'status' => 'not_found',
                'message' => 'Test session not found'
            ], 404);
        }

        // Check if data was received (don't delete yet, keep it for polling)
        $receivedDataKey = "webhook_test_received_{$testRunId}";
        $receivedData = \Illuminate\Support\Facades\Cache::get($receivedDataKey);

        if ($receivedData) {
            Log::info('✅ Test status check - webhook received', [
                'test_run_id' => $testRunId,
                'received_at' => $receivedData['received_at'] ?? null,
            ]);
            return response()->json([
                'status' => 'received',
                'data' => $receivedData
            ]);
        }

        // Check for timeout
        $startedAt = \Carbon\Carbon::parse($listeningData['started_at']);
        if ($startedAt->addMinutes(2)->isPast()) {
            \Illuminate\Support\Facades\Cache::forget($cacheKey);
            Log::info('Test status check - timeout', ['test_run_id' => $testRunId]);
            
            return response()->json([
                'status' => 'timeout',
                'message' => 'Test timeout'
            ]);
        }

        // Log occasionally to avoid spam (only 10% of requests)
        if (rand(1, 10) === 1) {
            Log::info('Test status check - still listening', [
                'test_run_id' => $testRunId,
                'path' => $listeningData['path'] ?? null,
                'method' => $listeningData['method'] ?? null,
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
     * Cleanup old test listeners for a specific path and workflow
     */
    private function cleanupOldTestListeners($workflowId, $path)
    {
        $cacheKeys = \Illuminate\Support\Facades\Cache::get('webhook_test_keys', []);
        $cleanedKeys = [];
        $cleanedCount = 0;
        
        foreach ($cacheKeys as $testRunId) {
            $listeningData = \Illuminate\Support\Facades\Cache::get("webhook_test_listening_{$testRunId}");
            
            if (!$listeningData) {
                // Already expired or removed, skip
                continue;
            }
            
            // Check if this is an old listener for the same path and workflow
            $listeningPath = trim($listeningData['path'] ?? '', '/');
            $listeningWorkflowId = $listeningData['workflow_id'] ?? null;
            
            if ($listeningWorkflowId == $workflowId && $listeningPath === $path) {
                // This is an old listener for the same path - clean it up
                Log::info('Cleaning up old test listener', [
                    'old_test_run_id' => $testRunId,
                    'path' => $path,
                    'workflow_id' => $workflowId,
                ]);
                
                // Mark as stopped
                \Illuminate\Support\Facades\Cache::put("webhook_test_stopped_{$testRunId}", true, now()->addMinutes(1));
                
                // Remove cache entries
                \Illuminate\Support\Facades\Cache::forget("webhook_test_listening_{$testRunId}");
                \Illuminate\Support\Facades\Cache::forget("webhook_test_received_{$testRunId}");
                
                $cleanedCount++;
            } else {
                // Keep this listener (different path or workflow)
                $cleanedKeys[] = $testRunId;
            }
        }
        
        // Also cleanup expired listeners (older than 5 minutes)
        foreach ($cleanedKeys as $testRunId) {
            $listeningData = \Illuminate\Support\Facades\Cache::get("webhook_test_listening_{$testRunId}");
            if ($listeningData) {
                $startedAt = \Carbon\Carbon::parse($listeningData['started_at'] ?? now());
                if ($startedAt->addMinutes(5)->isPast()) {
                    // Expired - remove it
                    \Illuminate\Support\Facades\Cache::forget("webhook_test_listening_{$testRunId}");
                    \Illuminate\Support\Facades\Cache::forget("webhook_test_received_{$testRunId}");
                    $cleanedKeys = array_filter($cleanedKeys, fn($key) => $key !== $testRunId);
                    $cleanedCount++;
                }
            }
        }
        
        // Update cache keys
        \Illuminate\Support\Facades\Cache::put('webhook_test_keys', array_values($cleanedKeys), now()->addMinutes(10));
        
        if ($cleanedCount > 0) {
            Log::info('Cleaned up old test listeners', [
                'cleaned_count' => $cleanedCount,
                'remaining_count' => count($cleanedKeys),
            ]);
        }
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
        $auth = $listeningData['auth'] ?? 'header';
        $authConfig = $listeningData['auth_config'] ?? [];

        Log::info('Validating test webhook auth', [
            'auth_type' => $authType,
            'auth' => $auth,
            'has_credential_id' => !empty($listeningData['credential_id']),
            'credential_id' => $listeningData['credential_id'] ?? null,
        ]);

        switch ($authType) {
            case 'bearer':
                // Get token from credential if available
                $credentialId = $listeningData['credential_id'] ?? null;
                if ($credentialId) {
                    $credential = \App\Models\Credential::find($credentialId);
                    if ($credential) {
                        // Support both old (headerValue) and new (token) format
                        $expectedToken = $credential->data['token'] ?? $credential->data['headerValue'] ?? null;
                        if ($expectedToken) {
                            $expectedToken = str_replace('Bearer ', '', $expectedToken);
                            Log::info('Bearer token from credential', [
                                'credential_id' => $credentialId,
                                'has_token' => !empty($expectedToken),
                                'token_length' => strlen($expectedToken),
                            ]);
                        } else {
                            // Token not found in credential - allow request to pass (no security)
                            Log::info('Bearer token not found in credential - allowing request without authentication', [
                                'credential_id' => $credentialId,
                                'credential_data_keys' => array_keys($credential->data ?? []),
                            ]);
                            return true;
                        }
                    } else {
                        // Credential not found - allow request to pass (no security)
                        Log::info('Credential not found - allowing request without authentication', ['credential_id' => $credentialId]);
                        return true;
                    }
                } else {
                    // No credential provided - check if token is in auth_config
                    $expectedToken = $authConfig['apiKeyValue'] ?? '';
                    if (empty($expectedToken)) {
                        // No token in auth_config either - allow request to pass (no security)
                        Log::info('Bearer auth configured but no credential or token provided - allowing request without authentication');
                        return true;
                    }
                    $expectedToken = str_replace('Bearer ', '', $expectedToken);
                    Log::info('Bearer token from auth_config', [
                        'has_token' => !empty($expectedToken),
                        'token_length' => strlen($expectedToken),
                    ]);
                }
                
                if ($auth === 'header') {
                    $authHeader = $request->header('Authorization', '');
                    $providedToken = str_replace('Bearer ', '', $authHeader);
                    Log::info('Bearer auth from header', [
                        'has_header' => !empty($authHeader),
                        'provided_token_length' => strlen($providedToken),
                        'expected_token_length' => strlen($expectedToken),
                        'tokens_match' => !empty($expectedToken) && hash_equals($expectedToken, $providedToken),
                    ]);
                } else {
                    $providedToken = $request->query('token', $request->query('access_token', ''));
                    Log::info('Bearer auth from query', [
                        'has_token' => !empty($providedToken),
                        'provided_token_length' => strlen($providedToken),
                        'expected_token_length' => strlen($expectedToken),
                        'tokens_match' => !empty($expectedToken) && hash_equals($expectedToken, $providedToken),
                    ]);
                }
                
                $isValid = !empty($expectedToken) && hash_equals($expectedToken, $providedToken);
                if (!$isValid) {
                    Log::warning('Bearer token validation failed', [
                        'has_expected_token' => !empty($expectedToken),
                        'has_provided_token' => !empty($providedToken),
                        'expected_length' => strlen($expectedToken ?? ''),
                        'provided_length' => strlen($providedToken ?? ''),
                    ]);
                }
                return $isValid;

            case 'basic':
                $expectedUsername = $authConfig['username'] ?? '';
                $expectedPassword = $authConfig['password'] ?? '';

                if ($auth === 'header') {
                    $authHeader = $request->header('Authorization', '');
                    if (strpos($authHeader, 'Basic ') !== 0) {
                        return false;
                    }
                    $credentials = base64_decode(str_replace('Basic ', '', $authHeader));
                    list($username, $password) = explode(':', $credentials, 2);
                } else {
                    $username = $request->query('username', '');
                    $password = $request->query('password', '');
                }

                return hash_equals($expectedUsername, $username) &&
                       hash_equals($expectedPassword, $password);

            case 'apiKey':
                $keyName = $authConfig['apiKeyName'] ?? '';
                $expectedKeyValue = $authConfig['apiKeyValue'] ?? '';
                
                if ($auth === 'header') {
                    $providedKeyValue = $request->header($keyName, '');
                } else {
                    $providedKeyValue = $request->query($keyName, '');
                }

                if (empty($providedKeyValue)) {
                    $providedKeyValue = $request->input($keyName, '');
                }

                return !empty($expectedKeyValue) && hash_equals($expectedKeyValue, $providedKeyValue);

            case 'custom':
                $headerName = $authConfig['customHeaderName'] ?? '';
                $expectedHeaderValue = $authConfig['customHeaderValue'] ?? '';
                
                if ($auth === 'header') {
                    $providedHeaderValue = $request->header($headerName, '');
                } else {
                    $providedHeaderValue = $request->query($headerName, '');
                }

                return !empty($expectedHeaderValue) && hash_equals($expectedHeaderValue, $providedHeaderValue);

            case 'oauth2':
                // Get token from credential
                $credentialId = $listeningData['credential_id'] ?? null;
                if ($credentialId) {
                    $credential = \App\Models\Credential::find($credentialId);
                    if ($credential && isset($credential->data['accessToken'])) {
                        $expectedToken = str_replace('Bearer ', '', $credential->data['accessToken']);
                    } else {
                        // Credential not found or invalid - allow request to pass (no security)
                        Log::info('OAuth2 credential not found or invalid - allowing request without authentication', ['credential_id' => $credentialId]);
                        return true;
                    }
                } else {
                    // No credential provided - allow request to pass (no security)
                    Log::info('OAuth2 auth configured but no credentialId provided - allowing request without authentication');
                    return true;
                }
                
                if ($auth === 'header') {
                    $authHeader = $request->header('Authorization', '');
                    $providedToken = str_replace('Bearer ', '', $authHeader);
                } else {
                    $providedToken = $request->query('token', $request->query('access_token', ''));
                }
                
                return !empty($expectedToken) && hash_equals($expectedToken, $providedToken);

            default:
                return true;
        }
    }

    /**
     * Handle test webhook requests
     */
    public function handleTest(Request $request, $path)
    {
        // Use error_log for debugging to ensure it's always logged
        error_log('=== handleTest webhook called ===');
        error_log('Path: ' . $path);
        error_log('Method: ' . $request->method());
        error_log('Full URL: ' . $request->fullUrl());
        
        Log::info('handleTest webhook called', [
            'path' => $path,
            'method' => $request->method(),
            'full_url' => $request->fullUrl(),
        ]);
        
        // Normalize path
        $normalizedPath = trim($path, '/');
        error_log('Normalized path: ' . $normalizedPath);
        
        // Check if this is a test webhook request (check all test runs)
        $cacheKeys = \Illuminate\Support\Facades\Cache::get('webhook_test_keys', []);
        error_log('Cache keys count: ' . count($cacheKeys));
        error_log('Cache keys: ' . json_encode($cacheKeys));
        
        // Cleanup expired listeners first
        $validKeys = [];
        foreach ($cacheKeys as $testRunId) {
            $listeningData = \Illuminate\Support\Facades\Cache::get("webhook_test_listening_{$testRunId}");
            if ($listeningData) {
                $startedAt = \Carbon\Carbon::parse($listeningData['started_at'] ?? now());
                if ($startedAt->addMinutes(5)->isPast()) {
                    // Expired - remove it
                    \Illuminate\Support\Facades\Cache::forget("webhook_test_listening_{$testRunId}");
                    \Illuminate\Support\Facades\Cache::forget("webhook_test_received_{$testRunId}");
                } else {
                    $validKeys[] = $testRunId;
                }
            }
        }
        
        // Update cache keys if any were removed
        if (count($validKeys) !== count($cacheKeys)) {
            \Illuminate\Support\Facades\Cache::put('webhook_test_keys', $validKeys, now()->addMinutes(10));
            $cacheKeys = $validKeys;
        }
        
        Log::info('Active test listeners (after cleanup)', [
            'count' => count($cacheKeys),
            'test_run_ids' => $cacheKeys,
        ]);
        error_log('Active test listeners after cleanup: ' . count($cacheKeys));

        foreach ($cacheKeys as $testRunId) {
            $listeningData = \Illuminate\Support\Facades\Cache::get("webhook_test_listening_{$testRunId}");
            
            error_log("Checking test listener: {$testRunId}");
            error_log("Has listening data: " . (!empty($listeningData) ? 'yes' : 'no'));
            
            Log::info('Checking test listener', [
                'test_run_id' => $testRunId,
                'has_listening_data' => !empty($listeningData),
                'listening_path' => $listeningData['path'] ?? null,
                'request_path' => $path,
                'path_match' => ($listeningData && $listeningData['path'] === $path),
            ]);

            // Normalize paths for comparison (remove leading/trailing slashes)
            $normalizedPath = trim($path, '/');
            $normalizedListeningPath = trim($listeningData['path'] ?? '', '/');
            
            error_log("Normalized paths - request: '{$normalizedPath}', listener: '{$normalizedListeningPath}'");
            error_log("Path match: " . ($normalizedListeningPath === $normalizedPath ? 'YES' : 'NO'));
            
            if ($listeningData && $normalizedListeningPath === $normalizedPath) {
                error_log("Path matched! Validating method and auth...");
                // Validate method and auth
                if ($listeningData['method'] !== $request->method()) {
                    Log::info('Method mismatch', [
                        'expected' => $listeningData['method'],
                        'received' => $request->method(),
                    ]);
                    continue;
                }

                // Check auth
                if (!empty($listeningData['auth']) && $listeningData['auth'] !== 'none') {
                    $authValid = $this->validateTestWebhookAuth($request, $listeningData);
                    if (!$authValid) {
                        Log::warning('Auth validation failed for test listener', [
                            'test_run_id' => $testRunId,
                            'auth' => $listeningData['auth'],
                            'auth_type' => $listeningData['auth_type'] ?? null,
                            'credential_id' => $listeningData['credential_id'] ?? null,
                            'request_method' => $request->method(),
                            'request_path' => $path,
                            'has_auth_header' => $request->hasHeader('Authorization'),
                            'auth_header' => $request->header('Authorization', '') ? '[PRESENT]' : '[MISSING]',
                        ]);
                        continue;
                    } else {
                        Log::info('Auth validation passed', [
                            'test_run_id' => $testRunId,
                        ]);
                    }
                }

                // Check if data was already received (prevent duplicate processing)
                $receivedDataKey = "webhook_test_received_{$testRunId}";
                if (!\Illuminate\Support\Facades\Cache::has($receivedDataKey)) {
                    // Parse request body - handle JSON and form data (same as handle())
                    $body = [];
                    $contentType = $request->header('Content-Type', '');
                    
                    // Try to get all data first (works for form data)
                    $allData = $request->all();
                    
                    // If Content-Type is JSON, parse JSON body separately
                    if (strpos($contentType, 'application/json') !== false) {
                        $rawContent = $request->getContent();
                        if (!empty($rawContent)) {
                            $jsonBody = json_decode($rawContent, true);
                            if (json_last_error() === JSON_ERROR_NONE && is_array($jsonBody)) {
                                $body = $jsonBody;
                                // Merge JSON body into allData
                                $allData = array_merge($allData, $body);
                            }
                        }
                    } else {
                        // For form data, body is already in all()
                        $body = $allData;
                    }
                    
                    // Store received data for test - format same as handle()
                    $webhookData = [
                        'method' => $request->method(),
                        'headers' => $request->headers->all(),
                        'body' => $body,  // Only body data, not query params
                        'query' => $request->query(),  // Keep query separate for reference
                        'all' => $allData,  // All data (query + body merged)
                        'url' => $request->url(),
                        'received_at' => now(),
                    ];
                    
                    \Illuminate\Support\Facades\Cache::put($receivedDataKey, $webhookData, now()->addMinutes(1));
                    
                    Log::info('✅ Webhook test data stored', [
                        'test_run_id' => $testRunId,
                        'received_data_keys' => array_keys($webhookData),
                        'body_keys' => array_keys($webhookData['body'] ?? []),
                    ]);
                } else {
                    Log::info('Webhook already received for this test run', [
                        'test_run_id' => $testRunId,
                    ]);
                }

                // Check if custom response is enabled
                if (!empty($listeningData['custom_response_enabled']) && !empty($listeningData['custom_response'])) {
                    $customResponse = $this->buildCustomResponse($listeningData['custom_response'], $request, [
                        'message' => 'Test webhook received',
                        'test_mode' => true
                    ]);
                    return response()->json($customResponse);
                }

                return response()->json([
                    'message' => 'Test webhook received',
                    'test_mode' => true
                ]);
            }
        }

        error_log('❌ No active test listener found for path: ' . $path);
        error_log('Request method: ' . $request->method());
        error_log('Available cache keys: ' . json_encode($cacheKeys));
        
        Log::warning('❌ No active test listener found for path', [
            'path' => $path,
            'method' => $request->method(),
            'available_cache_keys' => $cacheKeys,
        ]);
        
        return response()->json([
            'message' => 'No active test listener for this path'
        ], 404);
    }

    /**
     * Execute workflow in test mode (for testing from UI)
     */
    public function testExecuteWorkflow(Request $request, $workflowId)
    {
        try {
            $workflow = \App\Models\Workflow::find($workflowId);
            
            if (!$workflow) {
                return response()->json([
                    'error' => 'Workflow not found'
                ], 404);
            }

            // Get webhook data from request
            $webhookData = $request->input('webhook_data', []);
            
            Log::info('testExecuteWorkflow called', [
                'workflow_id' => $workflowId,
                'webhook_data_keys' => array_keys($webhookData),
                'webhook_data' => $webhookData,
            ]);

            // Format webhook data similar to how handle() and handleTest() format it
            // Allow empty webhook data for workflows without webhook trigger
            // If 'all' field is already present (from handleTest), use it; otherwise merge query + body
            $formattedWebhookData = [
                'method' => $webhookData['method'] ?? 'POST',
                'headers' => $webhookData['headers'] ?? [],
                'body' => $webhookData['body'] ?? [],
                'query' => $webhookData['query'] ?? [],
                'all' => $webhookData['all'] ?? array_merge(
                    $webhookData['query'] ?? [],
                    $webhookData['body'] ?? []
                ),
                'url' => $webhookData['url'] ?? '/',
            ];
            
            Log::info('Formatted webhook data for test execution', [
                'formatted_data' => $formattedWebhookData,
            ]);

            // Execute workflow synchronously in test mode
            // Use executeWorkflowPublic which will create a temporary execution record
            $result = $this->executeWorkflowPublic(
                $workflow,
                $formattedWebhookData,
                'test', // trigger_type = 'test'
                null, // no existing execution
                null  // no resume context
            );
            
            // Optionally delete the test execution record to keep database clean
            // For now, we'll keep it with trigger_type='test' so it can be filtered out if needed

            // Return result with node_results, execution_order, error_node, has_error
            return response()->json([
                'success' => true,
                'node_results' => $result['node_results'] ?? [],
                'execution_order' => $result['execution_order'] ?? [],
                'error_node' => $result['error_node'] ?? null,
                'has_error' => $result['has_error'] ?? false,
            ]);

        } catch (\Exception $e) {
            \Log::error('Error executing test workflow', [
                'workflow_id' => $workflowId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
                'has_error' => true,
            ], 500);
        }
    }

    /**
     * Get column headers from Google Sheets
     */
    public function getGeminiModels(Request $request)
    {
        try {
            $credentialId = $request->input('credentialId');
            
            if (!$credentialId) {
                return response()->json([
                    'error' => 'Credential ID is required'
                ], 400);
            }

            // Get credential
            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential) {
                return response()->json([
                    'error' => 'Credential not found'
                ], 404);
            }

            // Get API key from credential based on type
            $apiKey = null;
            if ($credential->type === 'gemini') {
                $apiKey = $credential->data['key'] ?? null;
                Log::info('getGeminiModels - extracted API key', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                    'has_key' => !empty($apiKey),
                    'key_length' => $apiKey ? strlen($apiKey) : 0,
                    'key_preview' => $apiKey ? substr($apiKey, 0, 10) . '...' : null,
                ]);
            } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
                // Backward compatibility
                $headerValue = $credential->data['headerValue'];
                $apiKey = $headerValue;
                if (strpos($headerValue, 'Bearer ') === 0) {
                    $apiKey = substr($headerValue, 7);
                }
            } elseif ($credential->type === 'bearer' && isset($credential->data['token'])) {
                $apiKey = $credential->data['token'];
            }

            if (!$apiKey) {
                Log::error('getGeminiModels - API key is missing', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                ]);
                return response()->json([
                    'error' => 'Invalid credential configuration: API key is missing'
                ], 400);
            }

            // Fetch models from Gemini API
            $response = Http::get('https://generativelanguage.googleapis.com/v1beta/models', [
                'key' => $apiKey
            ]);

            if (!$response->successful()) {
                Log::error('Gemini Models API Error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                
                return response()->json([
                    'error' => 'Failed to fetch models from Gemini API',
                    'details' => $response->body()
                ], $response->status());
            }

            return response()->json($response->json());
        } catch (\Exception $e) {
            Log::error('Error fetching Gemini models', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Failed to fetch Gemini models',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function getOpenAIModels(Request $request)
    {
        try {
            $credentialId = $request->input('credentialId');
            
            if (!$credentialId) {
                return response()->json([
                    'error' => 'Credential ID is required'
                ], 400);
            }

            // Get credential
            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential) {
                return response()->json([
                    'error' => 'Credential not found'
                ], 404);
            }

            // Get API key from credential based on type
            $apiKey = null;
            if ($credential->type === 'openai') {
                $apiKey = $credential->data['key'] ?? null;
                Log::info('getOpenAIModels - extracted API key', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                    'has_key' => !empty($apiKey),
                    'key_length' => $apiKey ? strlen($apiKey) : 0,
                    'key_preview' => $apiKey ? substr($apiKey, 0, 10) . '...' : null,
                ]);
            } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
                // Backward compatibility
                $headerValue = $credential->data['headerValue'];
                $apiKey = $headerValue;
                if (strpos($headerValue, 'Bearer ') === 0) {
                    $apiKey = substr($headerValue, 7);
                }
            } elseif ($credential->type === 'bearer' && isset($credential->data['token'])) {
                $apiKey = $credential->data['token'];
            }

            if (!$apiKey) {
                Log::error('getOpenAIModels - API key is missing', [
                    'credential_id' => $credential->id,
                    'credential_type' => $credential->type,
                ]);
                return response()->json([
                    'error' => 'Invalid credential configuration: API key is missing'
                ], 400);
            }

            // Fetch models from OpenAI API
            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey
            ])->get('https://api.openai.com/v1/models');

            if (!$response->successful()) {
                Log::error('OpenAI Models API Error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                
                return response()->json([
                    'error' => 'Failed to fetch models from OpenAI API',
                    'details' => $response->body()
                ], $response->status());
            }

            $data = $response->json();
            return response()->json($data);
        } catch (\Exception $e) {
            Log::error('OpenAI Models Error', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to fetch OpenAI models',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function getGoogleSheetsColumns(Request $request)
    {
        try {
            $credentialId = $request->input('credentialId');
            $documentUrl = $request->input('documentUrl');
            $sheetUrl = $request->input('sheetUrl');

            if (!$credentialId || !$documentUrl) {
                return response()->json(['error' => 'Missing required parameters'], 400);
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential || $credential->type !== 'oauth2') {
                return response()->json(['error' => 'Invalid OAuth2 credential'], 400);
            }

            // Get valid access token (auto-refresh if expired)
            $accessToken = $this->getValidAccessToken($credential);

            $spreadsheetId = $this->extractSpreadsheetId($documentUrl);
            $sheetId = $this->extractSheetId($sheetUrl);

            // Get sheet name from sheet ID
            $sheetName = $this->getSheetNameById($spreadsheetId, $sheetId, $accessToken);

            // Get the first row (header row) from specific sheet
            $range = $sheetName . '!A1:ZZ1'; // Read first row up to column ZZ
            $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$range}";

            $response = Http::withToken($accessToken)->get($url);

            if (!$response->successful()) {
                Log::error('Google Sheets API error', ['response' => $response->body()]);
                return response()->json(['error' => 'Failed to fetch sheet data', 'details' => $response->json()], 400);
            }

            $data = $response->json();
            $values = $data['values'] ?? [];
            
            if (empty($values) || empty($values[0])) {
                return response()->json(['columns' => []], 200);
            }

            // Filter out empty columns
            $columns = array_filter($values[0], function($col) {
                return !empty(trim($col));
            });

            return response()->json(['columns' => array_values($columns)], 200);
        } catch (\Exception $e) {
            Log::error('Error getting Google Sheets columns', ['error' => $e->getMessage()]);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Execute Google Sheets node
     */
    private function executeGoogleSheetsNode($config, $inputData)
    {
        try {
            $credentialId = $config['credentialId'] ?? null;
            if (!$credentialId) {
                throw new \Exception('Google Sheets credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential || $credential->type !== 'oauth2') {
                throw new \Exception('Invalid Google Sheets OAuth2 credential');
            }

            $operation = $config['operation'] ?? 'get';
            
            if ($operation === 'get') {
                return $this->getGoogleSheetsRows($config, $inputData, $credential);
            } elseif ($operation === 'append') {
                return $this->appendGoogleSheetsRow($config, $inputData, $credential);
            } elseif ($operation === 'update') {
                return $this->updateGoogleSheetsRow($config, $inputData, $credential);
            }

            throw new \Exception('Unsupported operation: ' . $operation);
        } catch (\Exception $e) {
            Log::error('Google Sheets node execution failed', [
                'error' => $e->getMessage(),
            ]);

            return [
                'error' => 'Google Sheets request failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Get rows from Google Sheets
     */
    private function getGoogleSheetsRows($config, $inputData, $credential)
    {
        $documentUrl = $this->resolveVariables($config['documentUrl'] ?? '', $inputData);
        $sheetUrl = $this->resolveVariables($config['sheetUrl'] ?? '', $inputData);
        $filters = $config['filters'] ?? [];
        $combineFilters = $config['combineFilters'] ?? 'AND';

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        $spreadsheetId = $this->extractSpreadsheetId($documentUrl);
        $sheetId = $this->extractSheetId($sheetUrl);
        
        // Get sheet name from sheet ID
        $sheetName = $this->getSheetNameById($spreadsheetId, $sheetId, $accessToken);
        
        // Get all data from specific sheet
        $range = $sheetName . '!A1:ZZ10000'; // Read up to 10000 rows from specific sheet
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$range}";

        $response = Http::withToken($accessToken)->get($url);

        if (!$response->successful()) {
            throw new \Exception('Failed to fetch sheet data: ' . $response->body());
        }

        $data = $response->json();
        $values = $data['values'] ?? [];

        if (empty($values)) {
            return [];
        }

        // First row is headers
        $headers = array_shift($values);
        
        // Convert rows to associative arrays
        $rows = [];
        foreach ($values as $index => $row) {
            $rowData = ['row_number' => $index + 2]; // Row 2 is first data row (1 is header)
            foreach ($headers as $colIndex => $header) {
                $rowData[$header] = $row[$colIndex] ?? '';
            }
            $rows[] = $rowData;
        }

        // Apply filters if any
        if (!empty($filters)) {
            $rows = array_filter($rows, function($row) use ($filters, $combineFilters) {
                $results = [];
                foreach ($filters as $filter) {
                    $column = $filter['column'] ?? '';
                    $operator = $filter['operator'] ?? '=';
                    $value = $filter['value'] ?? '';
                    
                    $cellValue = $row[$column] ?? '';
                    
                    $match = false;
                    switch ($operator) {
                        case '=':
                            $match = $cellValue == $value;
                            break;
                        case '!=':
                            $match = $cellValue != $value;
                            break;
                        case '>':
                            $match = $cellValue > $value;
                            break;
                        case '<':
                            $match = $cellValue < $value;
                            break;
                        case 'contains':
                            $match = strpos($cellValue, $value) !== false;
                            break;
                    }
                    
                    $results[] = $match;
                }
                
                if ($combineFilters === 'AND') {
                    return !in_array(false, $results);
                } else {
                    return in_array(true, $results);
                }
            });
        }

        return array_values($rows);
    }

    /**
     * Append a row to Google Sheets
     */
    private function appendGoogleSheetsRow($config, $inputData, $credential)
    {
        $documentUrl = $this->resolveVariables($config['documentUrl'] ?? '', $inputData);
        $sheetUrl = $this->resolveVariables($config['sheetUrl'] ?? '', $inputData);
        $columnValues = $config['columnValues'] ?? [];

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        $spreadsheetId = $this->extractSpreadsheetId($documentUrl);
        $sheetId = $this->extractSheetId($sheetUrl);
        
        // Get sheet name from sheet ID
        $sheetName = $this->getSheetNameById($spreadsheetId, $sheetId, $accessToken);

        // First, get headers to know column order
        $headerRange = $sheetName . '!A1:ZZ1';
        $headerUrl = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$headerRange}";
        $headerResponse = Http::withToken($accessToken)->get($headerUrl);

        if (!$headerResponse->successful()) {
            throw new \Exception('Failed to fetch headers: ' . $headerResponse->body());
        }

        $headerData = $headerResponse->json();
        $headers = $headerData['values'][0] ?? [];

        if (empty($headers)) {
            throw new \Exception('Sheet has no headers');
        }

        // Build row values in correct order
        $rowValues = [];
        foreach ($headers as $header) {
            $value = $columnValues[$header] ?? '';
            $resolvedValue = $this->resolveVariables($value, $inputData);
            $rowValues[] = $resolvedValue;
        }

        // Append the row
        $range = $sheetName . '!A:ZZ'; // Append to the end of specific sheet
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$range}:append";
        
        $response = Http::withToken($accessToken)
            ->withQueryParameters(['valueInputOption' => 'USER_ENTERED'])
            ->post($url, [
                'values' => [$rowValues]
            ]);

        if (!$response->successful()) {
            throw new \Exception('Failed to append row: ' . $response->body());
        }

        $result = $response->json();
        
        // Return the appended row data
        $appendedRow = ['row_number' => $result['updates']['updatedRows'] ?? 0];
        foreach ($headers as $index => $header) {
            $appendedRow[$header] = $rowValues[$index] ?? '';
        }

        return $appendedRow;
    }

    /**
     * Update a row in Google Sheets
     */
    private function updateGoogleSheetsRow($config, $inputData, $credential)
    {
        $documentUrl = $this->resolveVariables($config['documentUrl'] ?? '', $inputData);
        $sheetUrl = $this->resolveVariables($config['sheetUrl'] ?? '', $inputData);
        $columnValues = $config['columnValues'] ?? [];
        $columnToMatch = $config['columnToMatch'] ?? 'row_number';

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        $spreadsheetId = $this->extractSpreadsheetId($documentUrl);
        $sheetId = $this->extractSheetId($sheetUrl);
        
        // Get sheet name from sheet ID
        $sheetName = $this->getSheetNameById($spreadsheetId, $sheetId, $accessToken);

        // Get all data to find the row to update
        $range = $sheetName . '!A1:ZZ10000';
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$range}";
        $response = Http::withToken($accessToken)->get($url);

        if (!$response->successful()) {
            throw new \Exception('Failed to fetch sheet data: ' . $response->body());
        }

        $data = $response->json();
        $values = $data['values'] ?? [];

        if (empty($values)) {
            throw new \Exception('Sheet is empty');
        }

        $headers = array_shift($values);
        
        // Find the column index for matching
        $matchColumnIndex = array_search($columnToMatch, $headers);
        if ($matchColumnIndex === false && $columnToMatch !== 'row_number') {
            throw new \Exception("Column '{$columnToMatch}' not found in sheet");
        }

        // Get the value to match
        $matchValue = $this->resolveVariables($columnValues[$columnToMatch] ?? '', $inputData);

        // Find the row to update
        $rowToUpdate = null;
        $rowIndex = null;
        
        if ($columnToMatch === 'row_number') {
            // Match by row number (2-based index)
            $rowIndex = intval($matchValue) - 2; // Convert to 0-based array index
            if ($rowIndex >= 0 && $rowIndex < count($values)) {
                $rowToUpdate = $values[$rowIndex];
            }
        } else {
            // Match by column value
            foreach ($values as $index => $row) {
                if (isset($row[$matchColumnIndex]) && $row[$matchColumnIndex] == $matchValue) {
                    $rowToUpdate = $row;
                    $rowIndex = $index;
                    break;
                }
            }
        }

        if ($rowToUpdate === null) {
            throw new \Exception("No row found matching {$columnToMatch} = {$matchValue}");
        }

        // Build updated row values
        $updatedRow = $rowToUpdate;
        foreach ($headers as $colIndex => $header) {
            if (isset($columnValues[$header]) && $header !== $columnToMatch) {
                $value = $columnValues[$header] ?? '';
                $resolvedValue = $this->resolveVariables($value, $inputData);
                $updatedRow[$colIndex] = $resolvedValue;
            }
        }

        // Pad array to match original length
        while (count($updatedRow) < count($headers)) {
            $updatedRow[] = '';
        }

        // Update the row
        $actualRowNumber = $rowIndex + 2; // +2 because: +1 for 1-based, +1 for header row
        $updateRange = $sheetName . "!A{$actualRowNumber}:ZZ{$actualRowNumber}";
        $updateUrl = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$updateRange}";
        
        $updateResponse = Http::withToken($accessToken)
            ->withQueryParameters(['valueInputOption' => 'USER_ENTERED'])
            ->put($updateUrl, [
                'values' => [$updatedRow]
            ]);

        if (!$updateResponse->successful()) {
            throw new \Exception('Failed to update row: ' . $updateResponse->body());
        }

        // Return updated row data
        $result = ['row_number' => $actualRowNumber];
        foreach ($headers as $index => $header) {
            $result[$header] = $updatedRow[$index] ?? '';
        }

        return $result;
    }

    /**
     * Extract spreadsheet ID from Google Sheets URL
     */
    private function extractSpreadsheetId($url)
    {
        // URL format: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/...
        if (preg_match('/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/', $url, $matches)) {
            return $matches[1];
        }
        
        // If it's already just an ID, return it
        return $url;
    }

    /**
     * Extract sheet ID/name from Google Sheets URL
     */
    private function extractSheetId($url)
    {
        // URL format: ...#gid={SHEET_ID} or .../edit#gid={SHEET_ID}
        if (preg_match('/gid=([0-9]+)/', $url, $matches)) {
            return $matches[1];
        }
        
        // Default to first sheet
        return '0';
    }

    /**
     * Get sheet name by sheet ID from spreadsheet metadata
     */
    private function getSheetNameById($spreadsheetId, $sheetId, $accessToken)
    {
        // Get spreadsheet metadata to find sheet name
        $metadataUrl = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}";
        $response = Http::withToken($accessToken)->get($metadataUrl);

        if (!$response->successful()) {
            // If metadata fetch fails, default to first sheet
            Log::warning('Failed to fetch spreadsheet metadata, using first sheet');
            return 'Sheet1';
        }

        $metadata = $response->json();
        $sheets = $metadata['sheets'] ?? [];

        // Find sheet with matching sheetId
        foreach ($sheets as $sheet) {
            $properties = $sheet['properties'] ?? [];
            if (isset($properties['sheetId']) && $properties['sheetId'] == $sheetId) {
                return $properties['title'] ?? 'Sheet1';
            }
        }

        // If not found, return first sheet's name
        if (!empty($sheets)) {
            return $sheets[0]['properties']['title'] ?? 'Sheet1';
        }

        return 'Sheet1';
    }

    /**
     * Execute Google Drive Folder node
     */
    private function executeGoogleDriveFolderNode($config, $inputData)
    {
        try {
            $credentialId = $config['credentialId'] ?? null;
            if (!$credentialId) {
                throw new \Exception('Google Drive credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential || $credential->type !== 'oauth2') {
                throw new \Exception('Invalid Google Drive OAuth2 credential');
            }

            $operation = $config['operation'] ?? 'createFolder';
            
            if ($operation === 'createFolder') {
                return $this->createGoogleDriveFolder($config, $inputData, $credential);
            } elseif ($operation === 'uploadFile') {
                return $this->uploadFileToGoogleDrive($config, $inputData, $credential);
            } elseif ($operation === 'listFiles') {
                return $this->listFilesInGoogleDriveFolder($config, $inputData, $credential);
            } elseif ($operation === 'getFolder') {
                return $this->getGoogleDriveFolder($config, $inputData, $credential);
            } elseif ($operation === 'deleteFolder') {
                return $this->deleteGoogleDriveFolder($config, $inputData, $credential);
            } elseif ($operation === 'search') {
                return $this->searchGoogleDriveFiles($config, $inputData, $credential);
            }

            throw new \Exception('Unsupported operation: ' . $operation);
        } catch (\Exception $e) {
            Log::error('Google Drive Folder node execution failed', [
                'error' => $e->getMessage(),
            ]);

            return [
                'error' => 'Google Drive request failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Create a folder in Google Drive
     */
    private function createGoogleDriveFolder($config, $inputData, $credential)
    {
        $folderName = $this->resolveVariables($config['folderName'] ?? 'New Folder', $inputData);
        $parentFolderId = $this->resolveVariables($config['parentFolderId'] ?? '', $inputData);

        if (empty($folderName)) {
            throw new \Exception('Folder name is required');
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        // Create folder metadata
        $metadata = [
            'name' => $folderName,
            'mimeType' => 'application/vnd.google-apps.folder'
        ];

        // Add parent folder if specified
        if (!empty($parentFolderId)) {
            $metadata['parents'] = [$parentFolderId];
        }

        $response = Http::withToken($accessToken)
            ->post('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', $metadata);

        if (!$response->successful()) {
            throw new \Exception('Failed to create folder: ' . $response->body());
        }

        $folder = $response->json();
        $folderId = $folder['id'] ?? null;

        if (!$folderId) {
            throw new \Exception('Folder ID not returned from Google Drive API');
        }

        Log::info('Google Drive folder created', [
            'folder_id' => $folderId,
            'folder_name' => $folderName,
            'parent_folder_id' => $parentFolderId ?: 'My Drive root',
        ]);

        return [
            'id' => $folderId,
            'name' => $folderName,
            'url' => "https://drive.google.com/drive/folders/{$folderId}",
            'parent_id' => $parentFolderId ?: null,
            'folder' => $folder,
        ];
    }

    /**
     * Upload file from URL to Google Drive
     */
    private function uploadFileToGoogleDrive($config, $inputData, $credential)
    {
        $fileUrl = $this->resolveVariables($config['fileUrl'] ?? '', $inputData);
        $fileName = $this->resolveVariables($config['fileName'] ?? 'file', $inputData);
        $folderId = $this->resolveVariables($config['folderId'] ?? '', $inputData);

        if (empty($fileUrl)) {
            throw new \Exception('File URL is required');
        }

        if (empty($fileName)) {
            throw new \Exception('File name is required');
        }

        if (empty($folderId)) {
            throw new \Exception('Folder ID is required');
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        // Download file from URL
        Log::info('Downloading file from URL', ['url' => $fileUrl]);
        $fileResponse = Http::timeout(300)->get($fileUrl);

        if (!$fileResponse->successful()) {
            throw new \Exception('Failed to download file from URL: ' . $fileResponse->body());
        }

        $fileContent = $fileResponse->body();
        $fileSize = strlen($fileContent);

        // Detect MIME type from file extension or Content-Type header
        $mimeType = $this->detectMimeType($fileName, $fileResponse->header('Content-Type'));

        Log::info('File downloaded', [
            'file_name' => $fileName,
            'file_size' => $fileSize,
            'mime_type' => $mimeType,
        ]);

        // Upload to Google Drive using multipart upload
        $metadata = [
            'name' => $fileName,
            'parents' => [$folderId]
        ];

        // Use multipart upload for files
        $boundary = '----WebKitFormBoundary' . uniqid();
        $multipartBody = $this->buildMultipartBody($boundary, $metadata, $fileContent, $mimeType);

        $response = Http::withToken($accessToken)
            ->withHeaders([
                'Content-Type' => "multipart/related; boundary={$boundary}",
            ])
            ->withBody($multipartBody, "multipart/related; boundary={$boundary}")
            ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true');

        if (!$response->successful()) {
            throw new \Exception('Failed to upload file: ' . $response->body());
        }

        $file = $response->json();
        $fileId = $file['id'] ?? null;

        if (!$fileId) {
            throw new \Exception('File ID not returned from Google Drive API');
        }

        Log::info('File uploaded to Google Drive', [
            'file_id' => $fileId,
            'file_name' => $fileName,
            'folder_id' => $folderId,
        ]);

        return [
            'id' => $fileId,
            'name' => $fileName,
            'url' => "https://drive.google.com/file/d/{$fileId}/view",
            'folder_id' => $folderId,
            'size' => $fileSize,
            'mime_type' => $mimeType,
            'file' => $file,
        ];
    }

    /**
     * List files in a Google Drive folder
     */
    private function listFilesInGoogleDriveFolder($config, $inputData, $credential)
    {
        $folderId = $this->resolveVariables($config['listFolderId'] ?? '', $inputData);

        if (empty($folderId)) {
            throw new \Exception('Folder ID is required');
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        // Build query to list files in folder
        $query = "'{$folderId}' in parents and trashed=false";
        
        $url = "https://www.googleapis.com/drive/v3/files?q=" . urlencode($query) . "&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink)";

        $response = Http::withToken($accessToken)->get($url);

        if (!$response->successful()) {
            throw new \Exception('Failed to list files: ' . $response->body());
        }

        $data = $response->json();
        $files = $data['files'] ?? [];

        Log::info('Files listed from Google Drive folder', [
            'folder_id' => $folderId,
            'file_count' => count($files),
        ]);

        return [
            'folder_id' => $folderId,
            'files' => $files,
            'count' => count($files),
        ];
    }

    /**
     * Get Google Drive folder info
     */
    private function getGoogleDriveFolder($config, $inputData, $credential)
    {
        $folderId = $this->resolveVariables($config['getFolderId'] ?? '', $inputData);

        if (empty($folderId)) {
            throw new \Exception('Folder ID is required');
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        $response = Http::withToken($accessToken)
            ->get("https://www.googleapis.com/drive/v3/files/{$folderId}?supportsAllDrives=true&fields=id,name,mimeType,createdTime,modifiedTime,parents,webViewLink");

        if (!$response->successful()) {
            throw new \Exception('Failed to get folder: ' . $response->body());
        }

        $folder = $response->json();

        Log::info('Google Drive folder retrieved', [
            'folder_id' => $folderId,
            'folder_name' => $folder['name'] ?? 'Unknown',
        ]);

        return [
            'id' => $folder['id'] ?? null,
            'name' => $folder['name'] ?? null,
            'url' => $folder['webViewLink'] ?? "https://drive.google.com/drive/folders/{$folderId}",
            'parents' => $folder['parents'] ?? [],
            'created_time' => $folder['createdTime'] ?? null,
            'modified_time' => $folder['modifiedTime'] ?? null,
            'folder' => $folder,
        ];
    }

    /**
     * Delete Google Drive folder
     */
    private function deleteGoogleDriveFolder($config, $inputData, $credential)
    {
        $folderId = $this->resolveVariables($config['deleteFolderId'] ?? '', $inputData);

        if (empty($folderId)) {
            throw new \Exception('Folder ID is required');
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        $response = Http::withToken($accessToken)
            ->delete("https://www.googleapis.com/drive/v3/files/{$folderId}?supportsAllDrives=true");

        if (!$response->successful()) {
            throw new \Exception('Failed to delete folder: ' . $response->body());
        }

        Log::info('Google Drive folder deleted', [
            'folder_id' => $folderId,
        ]);

        return [
            'success' => true,
            'folder_id' => $folderId,
            'message' => 'Folder deleted successfully',
        ];
    }

    /**
     * Search files/folders in Google Drive
     */
    private function searchGoogleDriveFiles($config, $inputData, $credential)
    {
        $searchQuery = $this->resolveVariables($config['searchQuery'] ?? '', $inputData);
        $searchFolderId = $this->resolveVariables($config['searchFolderId'] ?? '', $inputData);

        if (empty($searchQuery)) {
            throw new \Exception('Search query is required');
        }

        // Get valid access token (auto-refresh if expired)
        $accessToken = $this->getValidAccessToken($credential);

        // Build query
        $query = $searchQuery;
        if (!empty($searchFolderId)) {
            $query .= " and '{$searchFolderId}' in parents";
        }
        $query .= " and trashed=false";

        $url = "https://www.googleapis.com/drive/v3/files?q=" . urlencode($query) . "&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents)";

        $response = Http::withToken($accessToken)->get($url);

        if (!$response->successful()) {
            throw new \Exception('Failed to search files: ' . $response->body());
        }

        $data = $response->json();
        $files = $data['files'] ?? [];

        Log::info('Google Drive search completed', [
            'query' => $searchQuery,
            'result_count' => count($files),
        ]);

        return [
            'query' => $searchQuery,
            'files' => $files,
            'count' => count($files),
        ];
    }

    /**
     * Detect MIME type from file name and Content-Type header
     */
    private function detectMimeType($fileName, $contentType = null)
    {
        // Use Content-Type header if available
        if ($contentType) {
            // Remove charset if present: "image/jpeg; charset=utf-8" -> "image/jpeg"
            $contentType = explode(';', $contentType)[0];
            $contentType = trim($contentType);
            if (!empty($contentType)) {
                return $contentType;
            }
        }

        // Detect from file extension
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        $mimeTypes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'mp3' => 'audio/mpeg',
            'mp4' => 'video/mp4',
            'avi' => 'video/x-msvideo',
            'mov' => 'video/quicktime',
            'pdf' => 'application/pdf',
            'doc' => 'application/msword',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls' => 'application/vnd.ms-excel',
            'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'zip' => 'application/zip',
            'txt' => 'text/plain',
            'json' => 'application/json',
            'xml' => 'application/xml',
            'csv' => 'text/csv',
        ];

        return $mimeTypes[$extension] ?? 'application/octet-stream';
    }

    /**
     * Build multipart body for file upload
     */
    private function buildMultipartBody($boundary, $metadata, $fileContent, $mimeType)
    {
        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: application/json; charset=UTF-8\r\n\r\n";
        $body .= json_encode($metadata) . "\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: {$mimeType}\r\n\r\n";
        $body .= $fileContent . "\r\n";
        $body .= "--{$boundary}--\r\n";

        return $body;
    }

    /**
     * Build custom response from template
     */
    private function buildCustomResponse($customResponseTemplate, Request $request, $defaultData = [])
    {
        try {
            // Parse the JSON template
            $decoded = json_decode($customResponseTemplate, true);
            
            if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
                // If not valid JSON, treat as string and resolve variables
                Log::warning('Custom response is not valid JSON, treating as string', [
                    'template' => substr($customResponseTemplate, 0, 200),
                ]);
                
                // Build input data for variable resolution
                $inputData = [
                    'request' => [
                        'method' => $request->method(),
                        'headers' => $request->headers->all(),
                        'body' => $request->all(),
                        'query' => $request->query(),
                        'url' => $request->url(),
                    ],
                    'default' => $defaultData,
                ];
                
                $resolved = $this->resolveVariables($customResponseTemplate, $inputData);
                
                // Try to parse as JSON again after resolution
                $decoded = json_decode($resolved, true);
                if ($decoded === null) {
                    // Still not JSON, return as string
                    return ['response' => $resolved];
                }
                
                return $decoded;
            }
            
            // Build input data for variable resolution
            $inputData = [
                'request' => [
                    'method' => $request->method(),
                    'headers' => $request->headers->all(),
                    'body' => $request->all(),
                    'query' => $request->query(),
                    'url' => $request->url(),
                ],
                'default' => $defaultData,
            ];
            
            // Recursively resolve variables in the JSON structure
            $resolved = $this->resolveVariablesInArray($decoded, $inputData);
            
            return $resolved;
        } catch (\Exception $e) {
            Log::error('Error building custom response', [
                'error' => $e->getMessage(),
                'template' => substr($customResponseTemplate, 0, 200),
            ]);
            
            // Fallback to default response on error
            return [
                'message' => 'Webhook processed successfully',
                'processed_workflows' => $defaultData,
                'error' => 'Custom response parsing failed: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Get valid access token, refresh if needed
     */
    private function getValidAccessToken($credential)
    {
        $data = $credential->data;
        $accessToken = $data['accessToken'] ?? $data['access_token'] ?? null;
        $refreshToken = $data['refreshToken'] ?? $data['refresh_token'] ?? null;
        $expiresAt = $data['expiresAt'] ?? $data['expires_at'] ?? null;

        // Check if token is still valid
        if ($accessToken && $expiresAt && now()->lt($expiresAt)) {
            return $accessToken;
        }

        // Token expired or about to expire, refresh it
        if (!$refreshToken) {
            throw new \Exception('Access token expired and no refresh token available. Please re-authorize the credential.');
        }

        Log::info('Access token expired, refreshing...', ['credential_id' => $credential->id]);

        // Refresh the token
        $tokenUrl = $data['accessTokenUrl'] ?? 'https://oauth2.googleapis.com/token';
        $response = Http::asForm()->post($tokenUrl, [
            'client_id' => $data['clientId'],
            'client_secret' => $data['clientSecret'],
            'refresh_token' => $refreshToken,
            'grant_type' => 'refresh_token',
        ]);

        if (!$response->successful()) {
            Log::error('Token refresh failed', ['response' => $response->body()]);
            throw new \Exception('Failed to refresh access token. Please re-authorize the credential.');
        }

        $tokens = $response->json();
        $newAccessToken = $tokens['access_token'];
        $newExpiresAt = isset($tokens['expires_in']) 
            ? now()->addSeconds($tokens['expires_in'])->toDateTimeString()
            : null;

        // Update credential with new token
        $data['accessToken'] = $newAccessToken;
        $data['expiresAt'] = $newExpiresAt;
        $credential->data = $data;
        $credential->save();

        Log::info('Access token refreshed successfully', ['credential_id' => $credential->id]);

        return $newAccessToken;
    }

    /**
     * Extract value from JSON using dynamic path
     * Supports: field, field[0], field[0].nested, field[0].nested[1].deep
     * 
     * @param array $data The JSON data
     * @param string $path Path like "choices[0].message.content"
     * @return mixed|null The extracted value or null if not found
     */
    private function extractValueFromPath($data, $path)
    {
        if (empty($path) || !is_array($data)) {
            return null;
        }

        // Remove template variable syntax: {{"choices"[0].message.content}} -> "choices"[0].message.content
        // or {{choices[0].message.content}} -> choices[0].message.content
        $path = preg_replace('/^\{\{|\}\}$/', '', $path);
        $path = trim($path);
        
        // Remove quotes around first key if present: "choices"[0].message.content -> choices[0].message.content
        // Handle both single and double quotes
        $path = preg_replace('/^["\']([^"\']+)["\'](\[.*)$/', '$1$2', $path);

        // Parse path: "candidates[0].content.parts[0].text"
        // Split by . but keep array indices together
        $segments = [];
        $currentSegment = '';
        $inBracket = false;
        
        for ($i = 0; $i < strlen($path); $i++) {
            $char = $path[$i];
            
            if ($char === '[') {
                $inBracket = true;
                $currentSegment .= $char;
            } elseif ($char === ']') {
                $inBracket = false;
                $currentSegment .= $char;
            } elseif ($char === '.' && !$inBracket) {
                if ($currentSegment !== '') {
                    $segments[] = $currentSegment;
                    $currentSegment = '';
                }
            } else {
                $currentSegment .= $char;
            }
        }
        
        if ($currentSegment !== '') {
            $segments[] = $currentSegment;
        }

        // Traverse through segments
        $current = $data;
        
        foreach ($segments as $segment) {
            // Check if segment has array index: field[0] or field[0][1]
            // Also handle quoted field names: "field"[0] -> field[0]
            $segment = preg_replace('/^["\']([^"\']+)["\'](\[.*)$/', '$1$2', $segment);
            
            if (preg_match('/^([^\[]+)(.*)$/', $segment, $matches)) {
                $field = $matches[1];
                $indices = $matches[2];
                
                // Get field first
                if (is_array($current) && isset($current[$field])) {
                    $current = $current[$field];
                } else {
                    return null;
                }
                
                // Process array indices if any
                if (!empty($indices)) {
                    preg_match_all('/\[(\d+)\]/', $indices, $indexMatches);
                    foreach ($indexMatches[1] as $index) {
                        $index = (int)$index;
                        if (is_array($current) && isset($current[$index])) {
                            $current = $current[$index];
                        } else {
                            return null;
                        }
                    }
                }
            } else {
                return null;
            }
        }
        
        return $current;
    }

    private function executeKlingNode($config, $inputData)
    {
        try {
            // Get operation type
            $operation = $config['operation'] ?? 'textToVideo';
            
            // Get credential
            $credentialId = $config['credentialId'] ?? null;
            if (!$credentialId) {
                throw new \Exception('Kling API credential is required');
            }

            $credential = \App\Models\Credential::find($credentialId);
            if (!$credential) {
                throw new \Exception('Kling credential not found');
            }

            // Get API key from credential
            $apiKey = null;
            if ($credential->type === 'kling') {
                $apiKey = $credential->data['key'] ?? null;
            } elseif ($credential->type === 'bearer' && isset($credential->data['token'])) {
                $apiKey = $credential->data['token'];
            }

            if (!$apiKey) {
                throw new \Exception('Invalid Kling credential configuration: API key is missing');
            }

            // Base URL for Kling API
            $baseUrl = 'https://api.klingai.com/v1';

            // Execute based on operation
            switch ($operation) {
                case 'textToVideo':
                    return $this->executeKlingTextToVideo($config, $inputData, $apiKey, $baseUrl);
                    
                case 'imageToVideo':
                    return $this->executeKlingImageToVideo($config, $inputData, $apiKey, $baseUrl);
                    
                case 'multiImageToVideo':
                    return $this->executeKlingMultiImageToVideo($config, $inputData, $apiKey, $baseUrl);
                    
                case 'multimodalToVideo':
                    return $this->executeKlingMultimodalToVideo($config, $inputData, $apiKey, $baseUrl);
                    
                case 'videoDuration':
                    return $this->executeKlingVideoDuration($config, $inputData, $apiKey, $baseUrl);
                    
                case 'avatar':
                    return $this->executeKlingAvatar($config, $inputData, $apiKey, $baseUrl);
                    
                case 'videoToLip':
                    return $this->executeKlingVideoToLip($config, $inputData, $apiKey, $baseUrl);
                    
                case 'videoEffects':
                    return $this->executeKlingVideoEffects($config, $inputData, $apiKey, $baseUrl);
                    
                case 'textToAudio':
                    return $this->executeKlingTextToAudio($config, $inputData, $apiKey, $baseUrl);
                    
                case 'videoToAudio':
                    return $this->executeKlingVideoToAudio($config, $inputData, $apiKey, $baseUrl);
                    
                case 'tts':
                    return $this->executeKlingTTS($config, $inputData, $apiKey, $baseUrl);
                    
                case 'imageGeneration':
                    return $this->executeKlingImageGeneration($config, $inputData, $apiKey, $baseUrl);
                    
                case 'multiImageToImage':
                    return $this->executeKlingMultiImageToImage($config, $inputData, $apiKey, $baseUrl);
                    
                case 'imageExpand':
                    return $this->executeKlingImageExpand($config, $inputData, $apiKey, $baseUrl);
                    
                case 'imageRecognize':
                    return $this->executeKlingImageRecognize($config, $inputData, $apiKey, $baseUrl);
                    
                case 'skillsMap':
                    return $this->executeKlingSkillsMap($config, $inputData, $apiKey, $baseUrl);
                    
                case 'functionalityTry':
                    return $this->executeKlingFunctionalityTry($config, $inputData, $apiKey, $baseUrl);
                    
                default:
                    throw new \Exception('Unknown Kling operation: ' . $operation);
            }
        } catch (\Exception $e) {
            Log::error('Kling API error', [
                'operation' => $operation ?? 'unknown',
                'error' => $e->getMessage(),
            ]);
            
            return [
                'error' => $e->getMessage(),
                'operation' => $operation ?? 'unknown',
            ];
        }
    }

    private function executeKlingTextToVideo($config, $inputData, $apiKey, $baseUrl)
    {
        $prompt = $this->resolveVariables($config['prompt'] ?? '', $inputData);
        
        $requestBody = [
            'model_name' => $config['modelName'] ?? 'kling-v1',
            'prompt' => $prompt,
            'negative_prompt' => $this->resolveVariables($config['negativePrompt'] ?? '', $inputData),
            'cfg_scale' => $config['cfgScale'] ?? 0.5,
            'mode' => $config['mode'] ?? 'std',
            'duration' => $config['duration'] ?? '5',
        ];

        // Optional parameters
        if (!empty($config['aspectRatio'])) {
            $requestBody['aspect_ratio'] = $config['aspectRatio'];
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/text2video', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingImageToVideo($config, $inputData, $apiKey, $baseUrl)
    {
        $image = $this->resolveVariables($config['image'] ?? '', $inputData);
        $prompt = $this->resolveVariables($config['prompt'] ?? '', $inputData);
        
        $requestBody = [
            'model_name' => $config['modelName'] ?? 'kling-v1',
            'image' => $image,
            'prompt' => $prompt,
            'negative_prompt' => $this->resolveVariables($config['negativePrompt'] ?? '', $inputData),
            'cfg_scale' => $config['cfgScale'] ?? 0.5,
            'mode' => $config['mode'] ?? 'std',
            'duration' => $config['duration'] ?? '5',
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/image2video', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingMultiImageToVideo($config, $inputData, $apiKey, $baseUrl)
    {
        $images = [];
        if (!empty($config['images']) && is_array($config['images'])) {
            foreach ($config['images'] as $img) {
                $images[] = $this->resolveVariables($img, $inputData);
            }
        }
        
        $requestBody = [
            'model_name' => $config['modelName'] ?? 'kling-v1',
            'images' => $images,
            'prompt' => $this->resolveVariables($config['prompt'] ?? '', $inputData),
            'cfg_scale' => $config['cfgScale'] ?? 0.5,
            'duration' => $config['duration'] ?? '5',
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/multi-image2video', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingMultimodalToVideo($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'model_name' => $config['modelName'] ?? 'kling-v1',
            'prompt' => $this->resolveVariables($config['prompt'] ?? '', $inputData),
        ];

        if (!empty($config['image'])) {
            $requestBody['image'] = $this->resolveVariables($config['image'], $inputData);
        }

        if (!empty($config['tailImage'])) {
            $requestBody['tail_image'] = $this->resolveVariables($config['tailImage'], $inputData);
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/multimodal2video', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingVideoDuration($config, $inputData, $apiKey, $baseUrl)
    {
        $videoUrl = $this->resolveVariables($config['videoUrl'] ?? '', $inputData);
        
        $requestBody = [
            'video_url' => $videoUrl,
            'duration' => $config['targetDuration'] ?? 10,
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/duration', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingAvatar($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'model_name' => $config['modelName'] ?? 'kling-avatar-v1',
            'image' => $this->resolveVariables($config['image'] ?? '', $inputData),
            'audio' => $this->resolveVariables($config['audio'] ?? '', $inputData),
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/avatar', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingVideoToLip($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'video_url' => $this->resolveVariables($config['videoUrl'] ?? '', $inputData),
            'audio_url' => $this->resolveVariables($config['audioUrl'] ?? '', $inputData),
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/video2lip', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingVideoEffects($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'video_url' => $this->resolveVariables($config['videoUrl'] ?? '', $inputData),
            'effect_type' => $config['effectType'] ?? 'enhance',
        ];

        if (!empty($config['effectParams'])) {
            $requestBody['params'] = json_decode($this->resolveVariables($config['effectParams'], $inputData), true);
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/videos/effects', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingTextToAudio($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'prompt' => $this->resolveVariables($config['prompt'] ?? '', $inputData),
            'duration' => $config['duration'] ?? 5,
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/audio/text2audio', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingVideoToAudio($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'video_url' => $this->resolveVariables($config['videoUrl'] ?? '', $inputData),
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/audio/video2audio', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingTTS($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'text' => $this->resolveVariables($config['text'] ?? '', $inputData),
            'voice' => $config['voice'] ?? 'default',
            'language' => $config['language'] ?? 'en',
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/audio/tts', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingImageGeneration($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'model_name' => $config['modelName'] ?? 'kling-image-v1',
            'prompt' => $this->resolveVariables($config['prompt'] ?? '', $inputData),
            'negative_prompt' => $this->resolveVariables($config['negativePrompt'] ?? '', $inputData),
            'n' => $config['n'] ?? 1,
        ];

        if (!empty($config['aspectRatio'])) {
            $requestBody['aspect_ratio'] = $config['aspectRatio'];
        }

        if (!empty($config['imageCount'])) {
            $requestBody['image_count'] = (int)$config['imageCount'];
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/images/generations', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingMultiImageToImage($config, $inputData, $apiKey, $baseUrl)
    {
        $images = [];
        if (!empty($config['images']) && is_array($config['images'])) {
            foreach ($config['images'] as $img) {
                $images[] = $this->resolveVariables($img, $inputData);
            }
        }
        
        $requestBody = [
            'images' => $images,
            'prompt' => $this->resolveVariables($config['prompt'] ?? '', $inputData),
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/images/multi-image2image', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingImageExpand($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'image' => $this->resolveVariables($config['image'] ?? '', $inputData),
            'expand_direction' => $config['expandDirection'] ?? 'all',
        ];

        if (!empty($config['expandRatio'])) {
            $requestBody['expand_ratio'] = (float)$config['expandRatio'];
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/images/expand', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingImageRecognize($config, $inputData, $apiKey, $baseUrl)
    {
        $requestBody = [
            'image' => $this->resolveVariables($config['image'] ?? '', $inputData),
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/images/recognize', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingSkillsMap($config, $inputData, $apiKey, $baseUrl)
    {
        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
        ])->get($baseUrl . '/models/skills');

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeKlingFunctionalityTry($config, $inputData, $apiKey, $baseUrl)
    {
        // FunctionalityTry - Test/Try functionality
        $requestBody = [];
        
        // Add any config parameters
        if (!empty($config['functionality'])) {
            $requestBody['functionality'] = $config['functionality'];
        }
        
        if (!empty($config['parameters'])) {
            $requestBody['parameters'] = json_decode($this->resolveVariables($config['parameters'], $inputData), true);
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'Content-Type' => 'application/json',
        ])->post($baseUrl . '/functionality/try', $requestBody);

        if (!$response->successful()) {
            throw new \Exception('Kling API request failed: ' . $response->body());
        }

        return $response->json();
    }

    private function executeConvertNode($config, $inputData)
    {
        try {
            $operation = $config['operation'] ?? 'toBase64';
            
            switch ($operation) {
                case 'toBase64':
                    return $this->convertToBase64($config, $inputData);
                    
                case 'fromBase64':
                    return $this->convertFromBase64($config, $inputData);
                    
                default:
                    throw new \Exception('Unknown Convert operation: ' . $operation);
            }
        } catch (\Exception $e) {
            Log::error('Convert node error', [
                'operation' => $operation ?? 'unknown',
                'error' => $e->getMessage(),
            ]);
            
            return [
                'error' => $e->getMessage(),
                'operation' => $operation ?? 'unknown',
            ];
        }
    }

    private function convertToBase64($config, $inputData)
    {
        // Resolve source - handle variable not found gracefully
        try {
            $source = $this->resolveVariables($config['source'] ?? '', $inputData);
        } catch (\Exception $e) {
            // If variable not found, use empty string and let validation handle it
            $source = '';
            Log::warning('Convert toBase64: variable not found in source', [
                'source_config' => $config['source'] ?? '',
                'error' => $e->getMessage(),
            ]);
        }
        
        if (empty($source)) {
            throw new \Exception('Source URL or file path is required');
        }
        
        try {
            // Check if it's a URL or file path
            if (filter_var($source, FILTER_VALIDATE_URL)) {
                // Download from URL
                $response = Http::timeout(60)->get($source);
                
                if (!$response->successful()) {
                    throw new \Exception('Failed to download file from URL: ' . $response->status());
                }
                
                $fileContent = $response->body();
                $mimeType = $response->header('Content-Type');
            } else {
                // Read from file path
                if (!file_exists($source)) {
                    throw new \Exception('File not found: ' . $source);
                }
                
                $fileContent = file_get_contents($source);
                $mimeType = mime_content_type($source);
            }
            
            // Convert to base64
            $base64 = base64_encode($fileContent);
            
            // Create data URI if needed
            $dataUri = 'data:' . $mimeType . ';base64,' . $base64;
            
            return [
                'base64' => $base64,
                'dataUri' => $dataUri,
                'mimeType' => $mimeType,
                'size' => strlen($fileContent),
                'source' => $source,
            ];
        } catch (\Exception $e) {
            throw new \Exception('Failed to convert to base64: ' . $e->getMessage());
        }
    }

    private function convertFromBase64($config, $inputData)
    {
        // Resolve base64Data - handle variable not found gracefully
        try {
            $base64Data = $this->resolveVariables($config['base64Data'] ?? '', $inputData);
        } catch (\Exception $e) {
            // If variable not found, use empty string and let validation handle it
            $base64Data = '';
            Log::warning('Convert fromBase64: variable not found in base64Data', [
                'base64Data_config' => $config['base64Data'] ?? '',
                'error' => $e->getMessage(),
            ]);
        }
        
        if (empty($base64Data)) {
            throw new \Exception('Base64 data is required');
        }
        
        try {
            // Check if it's a data URI and extract base64
            if (preg_match('/^data:([^;]+);base64,(.+)$/', $base64Data, $matches)) {
                $mimeType = $matches[1];
                $base64 = $matches[2];
            } else {
                // Pure base64 string
                $base64 = $base64Data;
                $mimeType = $config['mimeType'] ?? 'application/octet-stream';
            }
            
            // Decode base64
            $fileContent = base64_decode($base64, true);
            
            if ($fileContent === false) {
                throw new \Exception('Invalid base64 data');
            }
            
            // Generate filename
            $extension = $this->getExtensionFromMimeType($mimeType);
            $filename = ($config['filename'] ?? 'file_' . time()) . '.' . $extension;
            $ttlSeconds = $this->getConvertTtlSeconds($config);
            $expiresAt = now()->addSeconds($ttlSeconds);
            
            // Save to public storage
            $storagePath = storage_path('app/public/converts');
            if (!file_exists($storagePath)) {
                mkdir($storagePath, 0755, true);
            }
            
            $filePath = $storagePath . '/' . $filename;
            file_put_contents($filePath, $fileContent);

            // Schedule cleanup to avoid storage bloat
            DeleteFileJob::dispatch($filePath)->delay($ttlSeconds);
            
            // Generate public URL
            $publicUrl = url('storage/converts/' . $filename);
            
            return [
                'success' => true,
                'filename' => $filename,
                'filePath' => $filePath,
                'publicUrl' => $publicUrl,
                'mimeType' => $mimeType,
                'size' => strlen($fileContent),
                'expiresAt' => $expiresAt->toIso8601String(),
                'expiresInSeconds' => $ttlSeconds,
            ];
        } catch (\Exception $e) {
            throw new \Exception('Failed to convert from base64: ' . $e->getMessage());
        }
    }

    private function getConvertTtlSeconds(array $config): int
    {
        $maxSeconds = 5 * 24 * 60 * 60; // 5 days

        $value = isset($config['expirationValue']) ? (int) $config['expirationValue'] : 1;
        $value = max(1, $value);

        $unit = $config['expirationUnit'] ?? 'days';

        switch ($unit) {
            case 'minutes':
                $seconds = $value * 60;
                break;
            case 'hours':
                $seconds = $value * 3600;
                break;
            case 'days':
            default:
                $seconds = $value * 86400;
                break;
        }

        return min($seconds, $maxSeconds);
    }

    private function getExtensionFromMimeType($mimeType)
    {
        $mimeMap = [
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'image/svg+xml' => 'svg',
            'application/pdf' => 'pdf',
            'text/plain' => 'txt',
            'text/html' => 'html',
            'application/json' => 'json',
            'application/xml' => 'xml',
            'video/mp4' => 'mp4',
            'video/mpeg' => 'mpeg',
            'video/webm' => 'webm',
            'audio/mpeg' => 'mp3',
            'audio/wav' => 'wav',
            'audio/webm' => 'webm',
            'application/zip' => 'zip',
        ];
        
        return $mimeMap[$mimeType] ?? 'bin';
    }
}

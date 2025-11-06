import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from '../config/axios';
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import WebhookConfigModal from './WebhookConfigModal';
import ScheduleTriggerConfigModal from './ScheduleTriggerConfigModal';
import HttpRequestConfigModal from './HttpRequestConfigModal';
import PerplexityConfigModal from './PerplexityConfigModal';
import ClaudeConfigModal from './ClaudeConfigModal';
import GeminiConfigModal from './GeminiConfigModal';
import GoogleDocsConfigModal from './GoogleDocsConfigModal';
import GoogleSheetsConfigModal from './GoogleSheetsConfigModal';
import CodeConfigModal from './CodeConfigModal';
import EscapeConfigModal from './EscapeConfigModal';
import IfConfigModal from './IfConfigModal';
import SwitchConfigModal from './SwitchConfigModal';

// Compact node component (giống hệt Editor nhưng READ-ONLY)
const CompactNode = ({ data, nodeType, iconPath, color, handles }) => {
    const isCompleted = data?.isCompleted || false;
    const hasError = data?.hasError || false;
    const connectedHandles = data?.connectedHandles || [];

    return (
        <div 
            className={`bg-gray-800 dark:bg-gray-700 border-2 rounded-lg p-3 w-20 h-20 relative flex items-center justify-center group transition-all ${
                hasError ? 'border-red-500 border-4' : 
                isCompleted ? 'border-green-500' : 'border-gray-600 dark:border-gray-500'
            }`}
            title={data.customName || data.label || nodeType}
        >
            {/* Input handle */}
            {handles.input && (
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-gray-600"
                />
            )}
            
            {/* Icon SVG */}
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none relative">
                <img 
                    src={iconPath} 
                    alt={nodeType}
                    className="w-full h-full object-contain"
                    style={{ filter: 'brightness(0) invert(1)' }}
                />
            </div>
            
            {/* Node name label */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-md whitespace-nowrap pointer-events-none">
                {data.customName || data.label}
            </div>
            
            {/* Output handles */}
            {handles.outputs && handles.outputs.map((output, index) => {
                const topPercent = handles.outputs.length === 1 ? 50 : 30 + (index * 40);
                const handleKey = output.id || 'default';
                
                return (
                    <React.Fragment key={handleKey}>
                        <Handle 
                            type="source" 
                            position={Position.Right} 
                            id={output.id}
                            className={`!w-2.5 !h-2.5 !rounded-full !border-2 !border-gray-600 ${
                                output.color === 'green' ? '!bg-green-400' :
                                output.color === 'red' ? '!bg-red-400' :
                                '!bg-gray-400'
                            }`}
                            style={{ 
                                left: 'calc(100%)',
                                top: `${topPercent}%`,
                            }}
                        />
                        {output.label && (
                            <span 
                                className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                    output.color === 'green' ? 'text-green-400' :
                                    output.color === 'red' ? 'text-red-400' :
                                    'text-gray-400'
                                }`}
                                style={{ 
                                    left: 'calc(100% + 8px)',
                                    top: `${topPercent}%`,
                                    transform: 'translateY(-50%)',
                                }}
                            >
                                {output.label}
                            </span>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// Node types giống hệt Editor
const nodeTypes = {
    webhook: (props) => (
        <CompactNode 
            {...props} 
            nodeType="webhook"
            iconPath="/icons/nodes/webhook.svg"
            color="purple"
            handles={{ input: false, outputs: [{ id: null }] }}
        />
    ),
    schedule: (props) => (
        <CompactNode 
            {...props} 
            nodeType="schedule"
            iconPath="/icons/nodes/schedule.svg"
            color="cyan"
            handles={{ input: false, outputs: [{ id: null }] }}
        />
    ),
    http: (props) => (
        <CompactNode 
            {...props} 
            nodeType="http"
            iconPath="/icons/nodes/http.svg"
            color="blue"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
    perplexity: (props) => (
        <CompactNode 
            {...props} 
            nodeType="perplexity"
            iconPath="/icons/nodes/perplexity.svg"
            color="indigo"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
    code: (props) => (
        <CompactNode 
            {...props} 
            nodeType="code"
            iconPath="/icons/nodes/code.svg"
            color="green"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
    escape: (props) => (
        <CompactNode 
            {...props} 
            nodeType="escape"
            iconPath="/icons/nodes/escape.svg"
            color="yellow"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
    if: (props) => (
        <CompactNode 
            {...props} 
            nodeType="if"
            iconPath="/icons/nodes/if.svg"
            color="teal"
            handles={{ 
                input: true, 
                outputs: [
                    { id: 'true', label: 'true', color: 'green' },
                    { id: 'false', label: 'false', color: 'red' }
                ] 
            }}
        />
    ),
    claude: (props) => (
        <CompactNode 
            {...props} 
            nodeType="claude"
            iconPath="/icons/nodes/claude.svg"
            color="orange"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
    gemini: (props) => (
        <CompactNode 
            {...props} 
            nodeType="gemini"
            iconPath="/icons/nodes/gemini.svg"
            color="purple"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
    switch: (props) => {
        const rules = props.data?.config?.rules || [];
        const outputs = rules.map((rule, index) => ({
            id: `output${index}`,
            label: rule.outputName || `Output ${index + 1}`,
            color: 'blue'
        }));
        outputs.push({
            id: 'fallback',
            label: props.data?.config?.fallbackOutput || 'No Match',
            color: 'gray'
        });

        return (
            <CompactNode 
                {...props} 
                nodeType="switch"
                iconPath="/icons/nodes/switch.svg"
                color="cyan"
                handles={{ input: true, outputs: outputs }}
            />
        );
    },
    googledocs: (props) => (
        <CompactNode 
            {...props} 
            nodeType="googledocs"
            iconPath="/icons/nodes/googledocs.svg"
            color="blue"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
    googlesheets: (props) => (
        <CompactNode 
            {...props} 
            nodeType="googlesheets"
            iconPath="/icons/nodes/googlesheets.svg"
            color="green"
            handles={{ input: true, outputs: [{ id: null }] }}
        />
    ),
};

const WorkflowHistory = () => {
    const { id: workflowId } = useParams();
    const [executions, setExecutions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedExecution, setSelectedExecution] = useState(null);
    const [executionDetails, setExecutionDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [workflowNodes, setWorkflowNodes] = useState([]);
    const [workflowEdges, setWorkflowEdges] = useState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [showConfigModal, setShowConfigModal] = useState(false);

    useEffect(() => {
        fetchExecutions();
    }, [workflowId]);

    // Auto-refresh executions - ALWAYS poll to detect new executions
    useEffect(() => {
        const hasRunningExecution = executions.some(e => 
            e.status === 'running' || e.status === 'queued'
        );
        
        // Poll fast (2s) when there's a running execution, slower (5s) otherwise
        const pollInterval = hasRunningExecution ? 2000 : 5000;
        
        const interval = setInterval(async () => {
            try {
                const response = await axios.get(`/workflows/${workflowId}/executions`);
                const newExecutions = response.data.data || response.data;
                setExecutions(newExecutions);
                
                // Auto-refresh selected execution details if status changed or is running
                if (selectedExecution && newExecutions.length > 0) {
                    const updatedExecution = newExecutions.find(e => e.id === selectedExecution.id);
                    if (updatedExecution) {
                        const statusChanged = updatedExecution.status !== selectedExecution.status;
                        const isRunning = updatedExecution.status === 'running' || updatedExecution.status === 'queued';
                        
                        if (statusChanged || isRunning) {
                        setSelectedExecution(updatedExecution);
                        fetchExecutionDetails(updatedExecution.id);
                        }
                    }
                }
            } catch (err) {
                console.error('Error auto-refreshing executions:', err);
            }
        }, pollInterval);
        
        return () => clearInterval(interval);
    }, [executions, selectedExecution, workflowId]);

    const fetchExecutions = async (skipLoadingState = false) => {
        try {
            if (!skipLoadingState) {
                setLoading(true);
            }
            const response = await axios.get(`/workflows/${workflowId}/executions`);
            const newExecutions = response.data.data || response.data;
            setExecutions(newExecutions);
            
            // Auto-refresh selected execution details if it's running
            if (selectedExecution && newExecutions.length > 0) {
                const updatedExecution = newExecutions.find(e => e.id === selectedExecution.id);
                if (updatedExecution && updatedExecution.status !== selectedExecution.status) {
                    // Status changed, refresh details
                    setSelectedExecution(updatedExecution);
                    fetchExecutionDetails(updatedExecution.id);
                }
            }
        } catch (err) {
            if (!skipLoadingState) {
                setError('Failed to fetch workflow executions.');
            }
            console.error('Error fetching executions:', err);
        } finally {
            if (!skipLoadingState) {
                setLoading(false);
            }
        }
    };

    const fetchExecutionDetails = async (executionId) => {
        try {
            setDetailsLoading(true);
            const response = await axios.get(`/workflows/${workflowId}/executions/${executionId}`);
            setExecutionDetails(response.data);
            
            // Lấy nodes và edges từ workflow_snapshot (snapshot tại thời điểm thực thi)
            const snapshot = response.data.workflow_snapshot || {};
            let nodes = snapshot.nodes || [];
            let edges = snapshot.edges || [];
            
            // Nếu snapshot chưa có (execution đang running), fallback về workflow hiện tại
            if (nodes.length === 0) {
                try {
                    const workflowResponse = await axios.get(`/workflows/${workflowId}`);
                    nodes = workflowResponse.data.nodes || [];
                    edges = workflowResponse.data.edges || [];
                    console.log('📊 Using current workflow nodes (execution is running):', {
                        execution_id: executionId,
                        nodes_count: nodes.length,
                        edges_count: edges.length,
                    });
                } catch (err) {
                    console.error('Error fetching workflow nodes:', err);
                }
            } else {
            console.log('📊 Execution Details Loaded:', {
                execution_id: executionId,
                snapshot_nodes_count: nodes.length,
                snapshot_edges_count: edges.length,
            });
            }
            
            setWorkflowNodes(nodes);
            setWorkflowEdges(edges);
        } catch (err) {
            console.error('Error fetching execution details:', err);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleSelectExecution = (execution) => {
        setSelectedExecution(execution);
        fetchExecutionDetails(execution.id);
    };

    const handleDeleteExecution = async (executionId, event) => {
        event.stopPropagation(); // Prevent selecting execution when clicking delete
        
        if (!confirm('Bạn có chắc muốn xóa execution này?')) {
            return;
        }

        try {
            await axios.delete(`/workflows/${workflowId}/executions/${executionId}`);
            
            // Remove from list
            setExecutions(prev => prev.filter(e => e.id !== executionId));
            
            // Clear selection if deleted execution was selected
            if (selectedExecution?.id === executionId) {
                setSelectedExecution(null);
                setExecutionDetails(null);
                setWorkflowNodes([]);
                setWorkflowEdges([]);
            }
        } catch (err) {
            console.error('Error deleting execution:', err);
            alert('Không thể xóa execution. Vui lòng thử lại.');
        }
    };

    const handleNodeDoubleClick = (event, node) => {
        setSelectedNode(node);
        setShowConfigModal(true);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        } catch (e) {
            return dateString;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'success':
                return 'text-green-400';
            case 'failed':
                return 'text-red-400';
            case 'running':
                return 'text-yellow-400';
            default:
                return 'text-gray-400';
        }
    };

    // Lấy input/output data cho modal
    const getNodeInputData = (nodeId) => {
        const nodeResults = executionDetails?.node_results || {};
        return nodeResults[nodeId]?.input || {};
    };

    const getNodeOutputData = (nodeId) => {
        const nodeResults = executionDetails?.node_results || {};
        return nodeResults[nodeId]?.output || {};
    };

    // Tạo ReactFlow nodes từ snapshot
    const createReactFlowNodes = () => {
        if (!workflowNodes.length) return [];

        const nodeResults = executionDetails?.node_results || {};
        const executionOrder = executionDetails?.execution_order || [];
        const errorNode = executionDetails?.error_node || null;

        return workflowNodes.map(node => {
            // Find which handles are connected
            const connectedHandles = workflowEdges
                .filter(e => e.source === node.id)
                .map(e => e.sourceHandle || 'default');
            
            const hasExecuted = nodeResults[node.id] !== undefined;
            const isErrorNode = errorNode === node.id;
            
            return {
                ...node,
                sourcePosition: 'right',
                targetPosition: 'left',
                data: {
                    ...node.data,
                    nodeId: node.id,
                    connectedHandles: connectedHandles,
                    isCompleted: hasExecuted && !isErrorNode,
                    hasError: isErrorNode,
                },
            };
        });
    };

    // Tạo ReactFlow edges - chỉ highlight những edges được execute
    const createReactFlowEdges = () => {
        if (!workflowEdges.length) return [];

        const nodeResults = executionDetails?.node_results || {};
        const executionOrder = executionDetails?.execution_order || [];

        return workflowEdges.map(edge => {
            // Edge được execute nếu cả source và target đều có trong node_results
            const sourceExecuted = nodeResults[edge.source] !== undefined;
            const targetExecuted = nodeResults[edge.target] !== undefined;
            const wasExecuted = sourceExecuted && targetExecuted;

            return {
                ...edge,
                style: { 
                    stroke: wasExecuted ? '#10b981' : '#4b5563', // green nếu executed, gray nếu không
                    strokeWidth: wasExecuted ? 2 : 1,
                },
                markerEnd: {
                    type: 'arrowclosed',
                    color: wasExecuted ? '#10b981' : '#4b5563',
                },
            };
        });
    };

    if (loading) return <div className="p-4 text-white">Đang tải lịch sử thực thi...</div>;
    if (error) return <div className="p-4 text-red-500">{error}</div>;

    return (
        <div className="h-full flex bg-gray-900">
            {/* Left sidebar - Execution list */}
            <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto">
                <div className="p-4">
                    <h2 className="text-lg font-semibold text-white mb-4">Lịch sử thực thi</h2>
                    {executions.length === 0 ? (
                        <p className="text-gray-400 text-sm">Chưa có lịch sử thực thi nào.</p>
                    ) : (
                        <div className="space-y-2">
                            {executions.map((execution) => (
                                <div
                                    key={execution.id}
                                    onClick={() => handleSelectExecution(execution)}
                                    className={`p-3 rounded-lg cursor-pointer transition-colors relative group ${
                                        selectedExecution?.id === execution.id
                                            ? 'bg-blue-600'
                                            : 'bg-gray-700 hover:bg-gray-600'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-white">
                                            {formatDate(execution.started_at)}
                                        </span>
                                        <div className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                            execution.status === 'success' || execution.status === 'completed' ? 'bg-green-500 text-white' :
                                            execution.status === 'error' || execution.status === 'failed' ? 'bg-red-500 text-white' :
                                            execution.status === 'running' ? 'bg-blue-500 text-white' :
                                            execution.status === 'queued' ? 'bg-gray-500 text-white' :
                                            'bg-yellow-500 text-white'
                                        }`}>
                                            {execution.status === 'success' || execution.status === 'completed' ? 'Success' : 
                                             execution.status === 'error' || execution.status === 'failed' ? 'Error' :
                                             execution.status === 'running' ? 'Running' :
                                             execution.status === 'queued' ? 'Queued' :
                                             'Unknown'}
                                        </span>
                                            <button
                                                onClick={(e) => handleDeleteExecution(execution.id, e)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-600 rounded"
                                                title="Xóa execution"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-300">
                                        Hoàn thành trong {execution.duration_ms}ms
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        ID#{execution.id}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel - Execution details */}
            <div className="flex-1 flex flex-col">
                {selectedExecution ? (
                    detailsLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-gray-400">Đang tải chi tiết thực thi...</p>
                        </div>
                    ) : executionDetails ? (
                        <>
                            {/* Header */}
                            <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
                                <h3 className="text-lg font-semibold text-white">
                                    Chi tiết thực thi #{selectedExecution.id}
                                </h3>
                                <p className="text-sm text-gray-400 mt-1">
                                    {formatDate(executionDetails.started_at)} - Status: <span className={getStatusColor(executionDetails.status)}>{executionDetails.status}</span>
                                </p>
                            </div>

                            {/* Workflow canvas */}
                            <div className="flex-1 relative">
                                <ReactFlow
                                    nodes={createReactFlowNodes()}
                                    edges={createReactFlowEdges()}
                                    nodeTypes={nodeTypes}
                                    onNodeClick={handleNodeDoubleClick}
                                    fitView
                                    panOnDrag={true}
                                    panOnScroll={true}
                                    zoomOnScroll={true}
                                    zoomOnPinch={true}
                                    nodesConnectable={false}
                                    nodesDraggable={true}
                                    elementsSelectable={true}
                                    className="bg-gray-900"
                                >
                                    <Background />
                                    <Controls />
                                    <MiniMap />
                                </ReactFlow>
                            </div>

                            {/* Config Modals (READ-ONLY) */}
                            {showConfigModal && selectedNode && selectedNode.type === 'webhook' && (
                                <WebhookConfigModal
                                    node={selectedNode}
                                    workflowId={workflowId}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onRename={() => {}} // No-op
                                    onTestResult={() => {}} // No-op
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'schedule' && (
                                <ScheduleTriggerConfigModal
                                    node={selectedNode}
                                    workflowId={workflowId}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onRename={() => {}} // No-op
                                    onTestResult={() => {}} // No-op
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'http' && (
                                <HttpRequestConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'perplexity' && (
                                <PerplexityConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'code' && (
                                <CodeConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'escape' && (
                                <EscapeConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'if' && (
                                <IfConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'switch' && (
                                <SwitchConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'claude' && (
                                <ClaudeConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'gemini' && (
                                <GeminiConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'googledocs' && (
                                <GoogleDocsConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}

                            {showConfigModal && selectedNode && selectedNode.type === 'googlesheets' && (
                                <GoogleSheetsConfigModal
                                    node={selectedNode}
                                    onSave={() => {}} // No-op
                                    onClose={() => setShowConfigModal(false)}
                                    onTest={() => {}} // No-op
                                    onRename={() => {}} // No-op
                                    inputData={getNodeInputData(selectedNode.id)}
                                    outputData={getNodeOutputData(selectedNode.id)}
                                    onTestResult={() => {}} // No-op
                                    allEdges={workflowEdges}
                                    allNodes={workflowNodes}
                                    readOnly={true}
                                />
                            )}
                        </>
                    ) : null
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-400">Chọn một lần thực thi từ danh sách bên trái để xem chi tiết.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorkflowHistory;

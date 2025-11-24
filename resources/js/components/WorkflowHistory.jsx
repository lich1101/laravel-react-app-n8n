import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from '../config/axios';
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import WebhookConfigModal from './WebhookConfigModal';
import ScheduleTriggerConfigModal from './ScheduleTriggerConfigModal';
import HttpRequestConfigModal from './HttpRequestConfigModal';
import PerplexityConfigModal from './PerplexityConfigModal';
import ClaudeConfigModal from './ClaudeConfigModal';
import OpenAIConfigModal from './OpenAIConfigModal';
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
    const [iconError, setIconError] = React.useState(false);

    // Reset error state when iconPath or nodeType changes
    React.useEffect(() => {
        setIconError(false);
    }, [iconPath, nodeType]);

    // Get fallback text from nodeType (first 2-3 characters)
    const getFallbackText = () => {
        if (!nodeType) return '?';
        const words = nodeType.split(/\s+/);
        if (words.length >= 2) {
            return words.map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
        }
        return nodeType.substring(0, 2).toUpperCase();
    };

    return (
        <div 
            className={`bg-surface-elevated border-2 rounded-2xl p-3 w-20 h-20 relative flex items-center justify-center group transition-all shadow-card ${
                hasError ? 'border-rose-500 border-4' : 
                isCompleted ? 'border-emerald-500' : 'border-subtle'
            }`}
            title={data.customName || data.label || nodeType}
        >
            {/* Input handle */}
            {handles.input && (
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    className="!bg-slate-300 !w-2.5 !h-2.5 !border-2 !border-slate-300"
                />
            )}
            
            {/* Icon SVG */}
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none relative">
                {!iconError ? (
                    <img 
                        src={iconPath} 
                        alt={nodeType}
                        className="w-full h-full object-contain"
                        onError={() => setIconError(true)}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200 rounded text-gray-600 text-xs font-bold">
                        {getFallbackText()}
                    </div>
                )}
            </div>
            
            {/* Node name label */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-surface-elevated text-secondary text-xs px-3 py-1.5 rounded-lg border border-subtle shadow-card whitespace-nowrap pointer-events-none">
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
                            className={`!w-2.5 !h-2.5 !rounded-full !border-2 !border-slate-300 ${
                                output.color === 'green' ? '!bg-emerald-400' :
                                output.color === 'red' ? '!bg-rose-400' :
                                '!bg-slate-300'
                            }`}
                            style={{ 
                                left: 'calc(100%)',
                                top: `${topPercent}%`,
                            }}
                        />
                        {output.label && (
                            <span 
                                className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                    output.color === 'green' ? 'text-emerald-500' :
                                    output.color === 'red' ? 'text-rose-500' :
                                    'text-muted'
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

// Compact Switch Node Component - Vertical rectangle that grows with number of outputs (for History view)
const CompactSwitchNode = ({ data, nodeType, iconPath, color, handles, nodeHeight = 80 }) => {
    const isCompleted = data?.isCompleted || false;
    const hasError = data?.hasError || false;
    const connectedHandles = data?.connectedHandles || [];
    const [iconError, setIconError] = React.useState(false);

    // Reset error state when iconPath or nodeType changes
    React.useEffect(() => {
        setIconError(false);
    }, [iconPath, nodeType]);

    // Get fallback text from nodeType (first 2-3 characters)
    const getFallbackText = () => {
        if (!nodeType) return '?';
        const words = nodeType.split(/\s+/);
        if (words.length >= 2) {
            return words.map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
        }
        return nodeType.substring(0, 2).toUpperCase();
    };

    // Calculate output positions evenly distributed vertically
    const outputCount = handles.outputs?.length || 0;
    const getOutputTopPercent = (index) => {
        if (outputCount === 0) return 50;
        if (outputCount === 1) return 50;
        // Distribute evenly from top to bottom (leaving some padding)
        const padding = 15; // Top and bottom padding percentage
        const availableSpace = 100 - (padding * 2);
        return padding + (index * (availableSpace / (outputCount - 1)));
    };

    return (
        <div 
            className={`bg-surface-elevated border-2 rounded-2xl p-3 w-20 relative flex flex-col items-center justify-center group transition-all shadow-card ${
                hasError ? 'border-rose-500 border-4' : 
                isCompleted ? 'border-emerald-500' : 'border-subtle'
            }`}
            style={{ height: `${nodeHeight}px`, minHeight: '80px' }}
            title={data.customName || data.label || nodeType}
        >
            {/* Input handle */}
            {handles.input && (
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    className="!bg-slate-300 !w-2.5 !h-2.5 !border-2 !border-slate-300"
                    style={{ top: '50%' }}
                />
            )}
            
            {/* Icon SVG */}
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none relative mt-2">
                {!iconError ? (
                    <img 
                        src={iconPath} 
                        alt={nodeType}
                        className="w-full h-full object-contain"
                        onError={() => setIconError(true)}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200 rounded text-gray-600 text-xs font-bold">
                        {getFallbackText()}
                    </div>
                )}
            </div>
            
            {/* Node name label */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-surface-elevated text-secondary text-xs px-3 py-1.5 rounded-lg border border-subtle shadow-card whitespace-nowrap pointer-events-none">
                {data.customName || data.label}
            </div>
            
            {/* Output handles - Evenly distributed vertically */}
            {handles.outputs && handles.outputs.map((output, index) => {
                const topPercent = getOutputTopPercent(index);
                const handleKey = output.id || 'default';
                
                return (
                    <React.Fragment key={handleKey}>
                        <Handle 
                            type="source" 
                            position={Position.Right} 
                            id={output.id}
                            className={`!w-2.5 !h-2.5 !rounded-full !border-2 !border-slate-300 ${
                                output.color === 'green' ? '!bg-emerald-400' :
                                output.color === 'red' ? '!bg-rose-400' :
                                '!bg-slate-300'
                            }`}
                            style={{ 
                                left: 'calc(100%)',
                                top: `${topPercent}%`,
                            }}
                        />
                        {output.label && (
                            <span 
                                className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                    output.color === 'green' ? 'text-emerald-500' :
                                    output.color === 'red' ? 'text-rose-500' :
                                    'text-muted'
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
    openai: (props) => (
        <CompactNode 
            {...props} 
            nodeType="openai"
            iconPath="/icons/nodes/open_ai.svg"
            color="green"
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

        // Calculate height based on number of outputs (giống Editor)
        // Base height: 80px, + 32px per output (min 2 outputs)
        const minHeight = 80;
        const outputCount = Math.max(outputs.length, 2);
        const calculatedHeight = minHeight + (outputCount - 2) * 32;
        const nodeHeight = Math.min(calculatedHeight, 400); // Max 400px

        return (
            <CompactSwitchNode 
                {...props} 
                nodeType="switch"
                iconPath="/icons/nodes/switch.svg"
                color="cyan"
                handles={{ input: true, outputs: outputs }}
                nodeHeight={nodeHeight}
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
    const params = useParams();
    const workflowId = params.workflowId || params.id;
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
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [resuming, setResuming] = useState(false);
    const pendingDeletionRef = useRef(new Set());

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                setLoading(true);
                await fetchExecutions({ skipLoading: true });
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            isMounted = false;
        };
    }, [workflowId]);

    const normalizeExecution = (execution) => {
        let status = execution.status;

        if (execution.cancelled_at) {
            status = 'cancelled';
        } else if (
            (status === 'running' || status === 'queued') &&
            execution.cancel_requested_at
        ) {
            status = 'cancelling';
        }

        return {
            ...execution,
            status,
        };
    };

    const applyPendingDeletionFilter = (executionList) => {
        return executionList.filter((execution) => {
            if (pendingDeletionRef.current.has(execution.id)) {
                if (['running', 'cancelling'].includes(execution.status)) {
                    return true;
                }

                pendingDeletionRef.current.delete(execution.id);
                return false;
            }

            return true;
        });
    };

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
                const rawExecutions = response.data.data || response.data || [];
                const normalizedExecutions = rawExecutions.map(normalizeExecution);
                const filteredExecutions = applyPendingDeletionFilter(normalizedExecutions);
                setExecutions(filteredExecutions);
                
                // Auto-refresh selected execution details if status changed or is running
                if (selectedExecution && filteredExecutions.length > 0) {
                    const updatedExecution = filteredExecutions.find(e => e.id === selectedExecution.id);
                    if (updatedExecution) {
                        const statusChanged = updatedExecution.status !== selectedExecution.status;
                        if (statusChanged) {
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

    const fetchExecutions = async ({ skipLoading = false } = {}) => {
        try {
            if (!skipLoading) {
                setLoading(true);
            }
            const response = await axios.get(`/workflows/${workflowId}/executions`);
            const rawExecutions = response.data.data || response.data || [];
            const normalizedExecutions = rawExecutions.map(normalizeExecution);
            const filteredExecutions = applyPendingDeletionFilter(normalizedExecutions);
            setExecutions(filteredExecutions);
            
            if (selectedExecution) {
                const updatedExecution = filteredExecutions.find(e => e.id === selectedExecution.id);

                if (!updatedExecution) {
                    setSelectedExecution(null);
                    setExecutionDetails(null);
                    setWorkflowNodes([]);
                    setWorkflowEdges([]);
                } else {
                    setSelectedExecution(prev => {
                        if (!prev || prev.id !== updatedExecution.id) return prev;

                        const statusChanged =
                            prev.status !== updatedExecution.status ||
                            prev.finished_at !== updatedExecution.finished_at ||
                            prev.duration_ms !== updatedExecution.duration_ms;

                        return statusChanged ? { ...prev, ...updatedExecution } : prev;
                    });
                }
            }
        } catch (err) {
            if (!skipLoading) {
                setError('Failed to fetch workflow executions.');
            }
            console.error('Error fetching executions:', err);
        } finally {
            if (!skipLoading) {
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
        if (selectedExecution?.id === execution.id && executionDetails) {
            return;
        }

        setSelectedExecution(execution);
        setExecutionDetails(null);
        setWorkflowNodes([]);
        setWorkflowEdges([]);
        fetchExecutionDetails(execution.id);
    };

    const handleBulkDeleteExecutions = async () => {
        if (bulkDeleting) {
            return;
        }

        const deletableExecutions = executions.filter(execution => execution.status !== 'running');

        if (deletableExecutions.length === 0) {
            alert('Không có execution nào để xóa.');
            return;
        }

        if (!confirm('Bạn có chắc muốn xóa tất cả executions không ở trạng thái running?')) {
            return;
        }

        setBulkDeleting(true);

        try {
            await axios.delete(`/workflows/${workflowId}/executions`);

            const shouldResetSelection = selectedExecution && selectedExecution.status !== 'running';

            if (shouldResetSelection) {
                setSelectedExecution(null);
                setExecutionDetails(null);
                setWorkflowNodes([]);
                setWorkflowEdges([]);
                setSelectedNode(null);
                setShowConfigModal(false);
            }

            await fetchExecutions({ skipLoading: true });
        } catch (err) {
            console.error('Error bulk deleting executions:', err);
            alert('Không thể xóa các executions. Vui lòng thử lại.');
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleDeleteExecution = async (execution, event) => {
        event.stopPropagation(); // Prevent selecting execution when clicking delete
        
        const status = execution.status;
        const isRunning = status === 'running';
        const message = isRunning
            ? 'Execution đang chạy. Bạn có muốn hủy và xóa không?'
            : 'Bạn có chắc muốn xóa execution này?';

        if (!confirm(message)) {
            return;
        }

        if (pendingDeletionRef.current.has(execution.id)) {
            return;
        }

        pendingDeletionRef.current.add(execution.id);

        try {
            const response = await axios.delete(`/workflows/${workflowId}/executions/${execution.id}`);

            const data = response.data || {};
            const message = data.message || '';
            const wasCancellation = message.toLowerCase().includes('cancellation');
            const wasDeleted = message.toLowerCase().includes('deleted');
            const wasQueueCancel = message.toLowerCase().includes('cancelled from queue');
            
            if (wasDeleted || wasQueueCancel) {
                pendingDeletionRef.current.delete(execution.id);
                setExecutions(prev => prev.filter(e => e.id !== execution.id));
            } else if (wasCancellation) {
                setExecutions(prev => prev.map(e => (
                    e.id === execution.id
                        ? {
                            ...e,
                            status: 'cancelling',
                            cancel_requested_at: new Date().toISOString(),
                        }
                        : e
                )));
            } else {
                // fallback refresh
                fetchExecutions({ skipLoading: true });
            }
            
            // Clear selection if deleted execution was selected
            if (wasDeleted && selectedExecution?.id === execution.id) {
                setSelectedExecution(null);
                setExecutionDetails(null);
                setWorkflowNodes([]);
                setWorkflowEdges([]);
            }
        } catch (err) {
            console.error('Error deleting execution:', err);
            alert('Không thể xóa execution. Vui lòng thử lại.');
            pendingDeletionRef.current.delete(execution.id);
            fetchExecutions({ skipLoading: true });
        }
    };

    const handleResumeExecution = async () => {
        if (!executionDetails || !selectedExecution || resuming) {
            return;
        }

        if (!canResumeSelectedExecution()) {
            return;
        }

        if (!confirm('Bạn có chắc muốn chạy lại từ node lỗi này?')) {
            return;
        }

        setResuming(true);

        try {
            const response = await axios.post(`/workflows/${workflowId}/executions/${executionDetails.id}/resume`, {
                start_node_id: executionDetails.error_node,
            });

            const newExecution = response.data?.execution;

            if (newExecution) {
                const normalized = normalizeExecution(newExecution);
                setSelectedExecution(normalized);
                setExecutionDetails(null);
                await fetchExecutions({ skipLoading: true });
                await fetchExecutionDetails(normalized.id);
            } else {
                await fetchExecutions({ skipLoading: true });
            }
        } catch (err) {
            console.error('Error resuming execution:', err);
            const message = err.response?.data?.message || 'Không thể chạy lại execution. Vui lòng thử lại.';
            alert(message);
            await fetchExecutions({ skipLoading: true });
        } finally {
            setResuming(false);
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
            case 'completed':
                return 'text-emerald-600';
            case 'failed':
            case 'error':
                return 'text-rose-600';
            case 'running':
                return 'text-blue-600';
            case 'queued':
                return 'text-muted';
            case 'cancelling':
                return 'text-amber-600';
            case 'cancelled':
                return 'text-purple-600';
            default:
                return 'text-muted';
        }
    };

    const canResumeSelectedExecution = () => {
        if (!executionDetails) return false;
        if (executionDetails.status !== 'error') return false;
        if (!executionDetails.error_node) return false;
        if (executionDetails.resumed_at || executionDetails.resumed_to_execution_id) return false;
        return true;
    };

    const isExecutionActive = (status) => ['running', 'queued', 'cancelling'].includes(status);

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

    const hasNonRunningExecutions = executions.some(execution => execution.status !== 'running');

    if (loading) return <div className="p-4 text-secondary">Đang tải lịch sử thực thi...</div>;
    if (error) return <div className="p-4 text-red-500">{error}</div>;

    return (
        <div className="flex h-screen bg-surface overflow-hidden text-secondary">
            {/* Left sidebar - Execution list */}
            <div className="w-80 h-full bg-surface-elevated border-r border-subtle overflow-y-auto shadow-card">
                <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <h2 className="text-lg font-semibold text-primary">Lịch sử thực thi</h2>
                        <button
                            onClick={handleBulkDeleteExecutions}
                            disabled={bulkDeleting || !hasNonRunningExecutions}
                            className={`btn btn-danger text-xs px-3 py-2 ${
                                bulkDeleting || !hasNonRunningExecutions ? 'opacity-60 cursor-not-allowed' : ''
                            }`}
                        >
                            {bulkDeleting ? 'Đang xóa...' : 'Xóa tất cả'}
                        </button>
                    </div>
                    {executions.length === 0 ? (
                        <p className="text-muted text-sm">Chưa có lịch sử thực thi nào.</p>
                    ) : (
                        <div className="space-y-2">
                            {executions.map((execution) => (
                                <div
                                    key={execution.id}
                                    onClick={() => handleSelectExecution(execution)}
                                    className={`p-3 rounded-xl cursor-pointer transition-colors relative group border ${
                                        selectedExecution?.id === execution.id
                                            ? 'bg-primary-soft border-blue-200 shadow-card'
                                            : 'bg-surface-elevated border-subtle hover:bg-surface-muted'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-secondary">
                                            {formatDate(execution.started_at)}
                                        </span>
                                        <div className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${
                                            execution.status === 'success' || execution.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                            execution.status === 'error' || execution.status === 'failed' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                                            execution.status === 'running' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                            execution.status === 'queued' ? 'bg-surface-muted text-muted border-subtle' :
                                            execution.status === 'cancelling' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                            execution.status === 'cancelled' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                                            'bg-surface-muted text-muted border-subtle'
                                        }`}>
                                            {execution.status === 'success' || execution.status === 'completed' ? 'Success' : 
                                             execution.status === 'error' || execution.status === 'failed' ? 'Error' :
                                             execution.status === 'running' ? 'Running' :
                                             execution.status === 'queued' ? 'Queued' :
                                             execution.status === 'cancelling' ? 'Cancelling' :
                                             execution.status === 'cancelled' ? 'Cancelled' :
                                             (execution.status || 'Unknown')}
                                        </span>
                                            <button
                                                onClick={(e) => handleDeleteExecution(execution, e)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-100 rounded text-rose-600"
                                                title="Xóa execution"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted">
                                        Hoàn thành trong {execution.duration_ms}ms
                                    </p>
                                    <p className="text-xs text-muted">
                                        ID#{execution.id}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel - Execution details */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedExecution ? (
                    detailsLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-muted">Đang tải chi tiết thực thi...</p>
                        </div>
                    ) : executionDetails ? (
                        <>
                            {/* Header */}
                            <div className="bg-surface-elevated border-b border-subtle px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-card">
                                <div>
                                    <h3 className="text-lg font-semibold text-primary">
                                        Chi tiết thực thi #{selectedExecution.id}
                                    </h3>
                                    <p className="text-sm text-muted mt-1">
                                        {formatDate(executionDetails.started_at)} - Status: <span className={getStatusColor(executionDetails.status)}>{executionDetails.status}</span>
                                    </p>
                                    {executionDetails.error_node && (
                                        <p className="text-xs text-muted mt-1">
                                            Node lỗi: <span className="text-rose-500 font-semibold">{executionDetails.error_node}</span>
                                        </p>
                                    )}
                                    {executionDetails.resumed_to_execution_id && (
                                        <p className="text-xs text-primary mt-1">
                                            Đã chạy lại thành lần thực thi #{executionDetails.resumed_to_execution_id}
                                        </p>
                                    )}
                                </div>
                                {canResumeSelectedExecution() && (
                                    <button
                                        onClick={handleResumeExecution}
                                        disabled={resuming}
                                        className={`btn btn-success text-sm ${
                                            resuming ? 'opacity-60 cursor-not-allowed' : ''
                                        }`}
                                    >
                                        {resuming ? 'Đang chạy lại...' : 'Chạy lại từ node lỗi'}
                                    </button>
                                )}
                            </div>

                            {isExecutionActive(executionDetails.status) ? (
                                <div className="flex-1 flex flex-col items-center justify-center bg-surface text-muted gap-4">
                                    <div className="w-14 h-14 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                    <div className="text-sm text-center">
                                        Workflow đang chạy, vui lòng chờ hoàn tất để xem chi tiết.
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex-1 relative overflow-hidden">
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
                                            className="bg-surface"
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

                                    {showConfigModal && selectedNode && selectedNode.type === 'openai' && (
                                        <OpenAIConfigModal
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
                            )}
                        </>
                    ) : null
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-muted">Chọn một lần thực thi từ danh sách bên trái để xem chi tiết.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorkflowHistory;

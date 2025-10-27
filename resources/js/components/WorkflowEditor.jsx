import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    Handle,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from '../config/axios';
import { useParams, useNavigate } from 'react-router-dom';
import WebhookConfigModal from './WebhookConfigModal';
import HttpRequestConfigModal from './HttpRequestConfigModal';
import WorkflowHistory from './WorkflowHistory';

const nodeTypes = {
    webhook: ({ data }) => (
        <div className="bg-purple-100 dark:bg-purple-900 border-2 border-purple-500 rounded-lg p-3 min-w-[150px] relative">
            <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-3 !h-3" />
            <div className="font-semibold text-purple-700 dark:text-purple-300">Webhook</div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">{data.label || ''}</div>
        </div>
    ),
    http: ({ data }) => (
        <div className="bg-blue-100 dark:bg-blue-900 border-2 border-blue-500 rounded-lg p-3 min-w-[150px] relative">
            <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-3 !h-3" />
            <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3" />
            <div className="font-semibold text-blue-700 dark:text-blue-300">HTTP Request</div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">{data.label || ''}</div>
        </div>
    ),
    code: ({ data }) => (
        <div className="bg-green-100 dark:bg-green-900 border-2 border-green-500 rounded-lg p-3 min-w-[150px] relative">
            <Handle type="target" position={Position.Left} className="!bg-green-500 !w-3 !h-3" />
            <Handle type="source" position={Position.Right} className="!bg-green-500 !w-3 !h-3" />
            <div className="font-semibold text-green-700 dark:text-green-300">Code</div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">{data.label || ''}</div>
        </div>
    ),
};



function WorkflowEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [workflow, setWorkflow] = useState(null);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showNodeMenu, setShowNodeMenu] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);
    const [showNodeContextMenu, setShowNodeContextMenu] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [selectedEdge, setSelectedEdge] = useState(null);
    const [nodeInputData, setNodeInputData] = useState({});
    const [nodeOutputData, setNodeOutputData] = useState({});
    const [activeTab, setActiveTab] = useState('editor'); // 'editor' or 'history'

    useEffect(() => {
        fetchWorkflow();
    }, [id]);

    const fetchWorkflow = async () => {
        try {
            const response = await axios.get(`/workflows/${id}`);
            const data = response.data;
            setWorkflow(data);
            setNodes(data.nodes || []);
            setEdges(data.edges || []);
        } catch (error) {
            console.error('Error fetching workflow:', error);
        }
    };

    const onNodesChange = useCallback(
        (changes) => {
            setNodes((nds) => applyNodeChanges(changes, nds));
            // Handle delete node
            changes.forEach((change) => {
                if (change.type === 'remove') {
                    setSelectedNode(null);
                    setShowNodeContextMenu(false);
                }
            });
        },
        []
    );

    const onEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge(params, eds)),
        []
    );

    const onEdgeContextMenu = useCallback((event, edge) => {
        event.preventDefault();
        setSelectedEdge(edge);
        setContextMenuPosition({ x: event.clientX, y: event.clientY });
        setShowNodeContextMenu(true);
    }, []);

    const handleDeleteEdge = () => {
        if (selectedEdge) {
            setEdges(edges.filter(edge => edge.id !== selectedEdge.id));
            setSelectedEdge(null);
            setShowNodeContextMenu(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaved(false);
        try {
            await axios.put(`/workflows/${id}`, {
                nodes,
                edges,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Error saving workflow:', error);
            alert('Error saving workflow');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async () => {
        try {
            const newActive = !workflow.active;
            await axios.put(`/workflows/${id}`, { active: newActive });
            setWorkflow({ ...workflow, active: newActive });
        } catch (error) {
            if (error.response?.status === 400) {
                alert('Cannot activate workflow without a webhook node');
            } else {
                console.error('Error toggling workflow:', error);
            }
        }
    };

    const addNode = (type, label) => {
        const newNode = {
            id: `${type}-${Date.now()}`,
            type,
            position: { x: Math.random() * 400, y: Math.random() * 400 },
            data: { label },
        };
        setNodes([...nodes, newNode]);
        setShowNodeMenu(false);
    };

    const handleNodeContextMenu = (event, node) => {
        event.preventDefault();
        setSelectedNode(node);
        setContextMenuPosition({ x: event.clientX, y: event.clientY });
        setShowNodeContextMenu(true);
    };

    const handleDeleteNode = () => {
        if (selectedNode) {
            setNodes(nodes.filter(node => node.id !== selectedNode.id));
            setSelectedNode(null);
            setShowNodeContextMenu(false);
        }
    };

    const handleConfigureNode = () => {
        if (selectedNode && selectedNode.type === 'webhook') {
            setShowConfigModal(true);
            setShowNodeContextMenu(false);
        } else if (selectedNode && selectedNode.type === 'http') {
            setShowConfigModal(true);
            setShowNodeContextMenu(false);
        } else if (selectedNode) {
            const newLabel = prompt('Enter new label for this node:', selectedNode.data.label || '');
            if (newLabel !== null) {
                setNodes(nodes.map(node =>
                    node.id === selectedNode.id
                        ? { ...node, data: { ...node.data, label: newLabel } }
                        : node
                ));
            }
            setShowNodeContextMenu(false);
        }
    };

    const handleNodeDoubleClick = (event, node) => {
        setSelectedNode(node);

        if (node.type === 'webhook' || node.type === 'http') {
            setShowConfigModal(true);
        } else if (node.type === 'code') {
            const newLabel = prompt('Enter new label for this node:', node.data.label || '');
            if (newLabel !== null) {
                setNodes(nodes.map(n =>
                    n.id === node.id
                        ? { ...n, data: { ...n.data, label: newLabel } }
                        : n
                ));
            }
        }
    };

    // Get input data for a node (from all connected nodes upstream)
    const getNodeInputData = (nodeId) => {
        const inputDataArray = [];
        const visitedNodes = new Set();
        const queue = [nodeId];

        console.log('Getting input data for node:', nodeId);
        console.log('Available output data:', nodeOutputData);

        while (queue.length > 0) {
            const currentId = queue.shift();

            // Find all edges that connect TO the current node
            const incomingEdges = edges.filter(edge => edge.target === currentId);

            incomingEdges.forEach(edge => {
                const sourceNodeId = edge.source;

                if (!visitedNodes.has(sourceNodeId)) {
                    visitedNodes.add(sourceNodeId);

                    // Add output data if available
                    if (nodeOutputData[sourceNodeId]) {
                        inputDataArray.push(nodeOutputData[sourceNodeId]);
                        console.log('Added output from node:', sourceNodeId);
                    }

                    // Add to queue to continue traversal
                    queue.push(sourceNodeId);
                }
            });
        }

        // Reverse to maintain order from first to last
        inputDataArray.reverse();

        console.log('Final input data array (from all upstream nodes):', inputDataArray);
        return inputDataArray;
    };

    // Resolve variables in a string (replace {{path}} with actual values)
    const resolveVariables = (str, inputData) => {
        if (!str || typeof str !== 'string') return str;

        // Find all {{variable}} patterns
        const variablePattern = /\{\{([^}]+)\}\}/g;
        let resolved = str;
        let match;

        while ((match = variablePattern.exec(str)) !== null) {
            const fullMatch = match[0]; // {{path}}
            const path = match[1]; // path
            const value = getValueFromPath(path, inputData);

            if (value !== undefined && value !== null) {
                resolved = resolved.replace(fullMatch, String(value));
            }
        }

        return resolved;
    };

    // Get value from path like "input-0.headers.content-length"
    const getValueFromPath = (path, inputData) => {
        if (!inputData || !Array.isArray(inputData)) return undefined;

        // Handle paths like "input-0.headers.content-length"
        const parts = path.split('.');
        if (parts[0].startsWith('input-')) {
            const index = parseInt(parts[0].replace('input-', ''));
            if (index >= 0 && index < inputData.length) {
                let value = inputData[index];
                for (let i = 1; i < parts.length; i++) {
                    if (value && typeof value === 'object') {
                        value = value[parts[i]];
                    } else {
                        return undefined;
                    }
                }
                return value;
            }
        }

        // Try to find in any input
        for (const input of inputData) {
            let value = input;
            for (const part of parts) {
                if (value && typeof value === 'object') {
                    value = value[part];
                } else {
                    value = undefined;
                    break;
                }
            }
            if (value !== undefined && value !== null) {
                return value;
            }
        }

        return undefined;
    };

    // Test HTTP Request node
    const handleTestHttpNode = async (config) => {
        try {
            console.log('Testing HTTP Request with config:', config);

            // Get input data for this node
            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for variable resolution:', inputData);

            // Build URL with query parameters
            let url = resolveVariables(config.url, inputData);
            if (config.queryParams && config.queryParams.length > 0) {
                const queryString = config.queryParams
                    .filter(p => p.name && p.value)
                    .map(p => {
                        const resolvedName = resolveVariables(p.name, inputData);
                        const resolvedValue = resolveVariables(p.value, inputData);
                        return `${encodeURIComponent(resolvedName)}=${encodeURIComponent(resolvedValue)}`;
                    })
                    .join('&');
                url += `?${queryString}`;
            }

            // Build headers
            const headers = {};
            if (config.headers && config.headers.length > 0) {
                config.headers.forEach(header => {
                    if (header.name && header.value) {
                        const resolvedName = resolveVariables(header.name, inputData);
                        const resolvedValue = resolveVariables(header.value, inputData);
                        headers[resolvedName] = resolvedValue;
                    }
                });
            }

            // Add authentication
            if (config.auth === 'bearer' && config.credential) {
                const resolvedCredential = resolveVariables(config.credential, inputData);
                headers['Authorization'] = `Bearer ${resolvedCredential}`;
            } else if (config.auth === 'basic' && config.credential) {
                const resolvedCredential = resolveVariables(config.credential, inputData);
                headers['Authorization'] = `Basic ${btoa(resolvedCredential)}`;
            } else if (config.auth === 'custom' && config.credential) {
                // Custom header format: "HeaderName: HeaderValue"
                const resolvedCredential = resolveVariables(config.credential, inputData);
                const parts = resolvedCredential.split(':');
                if (parts.length === 2) {
                    headers[parts[0].trim()] = parts[1].trim();
                }
            }

            // Build request options
            const requestOptions = {
                method: config.method,
                headers: {
                    ...headers,
                },
            };

            // Add body for POST, PUT, PATCH
            if (['POST', 'PUT', 'PATCH'].includes(config.method) && config.bodyContent) {
                let bodyContent = resolveVariables(config.bodyContent, inputData);

                if (config.bodyType === 'json') {
                    try {
                        // Try to parse as JSON
                        requestOptions.body = JSON.stringify(JSON.parse(bodyContent));
                        requestOptions.headers['Content-Type'] = 'application/json';
                    } catch (e) {
                        requestOptions.body = bodyContent;
                        requestOptions.headers['Content-Type'] = 'application/json';
                    }
                } else if (config.bodyType === 'form') {
                    requestOptions.body = bodyContent;
                    // Note: multipart/form-data requires FormData object, this is simplified
                    delete requestOptions.headers['Content-Type'];
                } else if (config.bodyType === 'urlencoded') {
                    requestOptions.body = bodyContent;
                    requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                } else {
                    requestOptions.body = bodyContent;
                }
            }

            console.log('Making request to:', url);
            console.log('Request options:', requestOptions);

            // Make the HTTP request
            const response = await fetch(url, requestOptions);
            const data = await response.text();

            let bodyData = data;
            try {
                bodyData = JSON.parse(data);
            } catch (e) {
                // Keep as text if not JSON
            }

            const result = {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: bodyData,
            };

            console.log('Response:', result);
            return result;
        } catch (error) {
            console.error('Error testing HTTP request:', error);
            return {
                error: error.message || 'An error occurred',
                details: error.toString(),
            };
        }
    };

    const handleSaveConfig = async (config) => {
        if (!selectedNode) return;

        // Update node data with config
        const updatedNode = {
            ...selectedNode,
            data: {
                ...selectedNode.data,
                config,
                label: config.path || config.url || selectedNode.data.label,
            }
        };

        setNodes(nodes.map(node =>
            node.id === selectedNode.id ? updatedNode : node
        ));

        // Save to backend
        try {
            await axios.post(`/workflows/${id}/nodes`, {
                node_id: selectedNode.id,
                type: selectedNode.type,
                config: config,
            });
        } catch (error) {
            console.error('Error saving node config:', error);
        }
    };

    // Handle test results and save to output data
    const handleTestResult = (nodeId, result) => {
        console.log('handleTestResult called for node:', nodeId);
        console.log('Result:', result);
        setNodeOutputData(prev => {
            const newData = {
                ...prev,
                [nodeId]: result,
            };
            console.log('Updated nodeOutputData:', newData);
            return newData;
        });
    };

    // Execute a node to get its output based on input
    const executeNode = async (node, inputData) => {
        if (node.type === 'webhook') {
            // Webhook nodes return the input data as output (they trigger the workflow)
            return inputData && inputData.length > 0 ? inputData[0] : { message: 'Webhook triggered' };
        } else if (node.type === 'http') {
            // For HTTP nodes, we would execute the HTTP request
            // This is a simplified version - in production, you'd want to handle this differently
            if (node.data?.config?.url) {
                try {
                    const result = await handleTestHttpNode(node.data.config);
                    return result;
                } catch (error) {
                    return { error: error.message };
                }
            }
            return inputData && inputData.length > 0 ? inputData[0] : {};
        }
        // For other node types, just pass through the input
        return inputData && inputData.length > 0 ? inputData[0] : {};
    };

    if (!workflow) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => navigate('/workflows')}
                            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                            ← Back
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {workflow.name}
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {workflow.description || 'No description'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-6">
                        {/* Tab Navigation */}
                        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveTab('editor')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    activeTab === 'editor'
                                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                            >
                                Editor
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    activeTab === 'history'
                                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                            >
                                History
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <div className="relative">
                            <button
                                onClick={() => setShowNodeMenu(!showNodeMenu)}
                                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-md text-sm font-medium"
                            >
                                + Add Node
                            </button>
                            {showNodeMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 shadow-lg rounded-md py-1 z-10">
                                    <button
                                        onClick={() => addNode('webhook', 'Webhook')}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        Webhook
                                    </button>
                                    <button
                                        onClick={() => addNode('http', 'HTTP Request')}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        HTTP Request
                                    </button>
                                    <button
                                        onClick={() => addNode('code', 'Code')}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        Code
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`px-4 py-2 rounded-md text-sm font-medium ${
                                isSaving || saved
                                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                        >
                            {isSaving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
                        </button>
                        <button
                            onClick={handleToggleActive}
                            className={`px-4 py-2 rounded-md text-sm font-medium ${
                                workflow.active
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                        >
                            {workflow.active ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative">
                {activeTab === 'editor' ? (
                    <>
                        <ReactFlow
                    nodes={nodes.map(node => ({
                        ...node,
                        sourcePosition: 'right',
                        targetPosition: 'left',
                    }))}
                    edges={edges.map(edge => ({
                        ...edge,
                        style: { stroke: '#10b981', strokeWidth: 2 },
                        markerEnd: {
                            type: 'arrowclosed',
                            color: '#10b981',
                        },
                    }))}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeContextMenu={handleNodeContextMenu}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onEdgeContextMenu={onEdgeContextMenu}
                    onPaneClick={() => {
                        setShowNodeContextMenu(false);
                        setSelectedEdge(null);
                    }}
                    nodeTypes={nodeTypes}
                    fitView
                    connectionLineStyle={{ stroke: '#10b981', strokeWidth: 2 }}
                    defaultEdgeOptions={{
                        style: { stroke: '#10b981', strokeWidth: 2 },
                        markerEnd: {
                            type: 'arrowclosed',
                            color: '#10b981',
                        },
                    }}
                >
                    <Background />
                    <Controls />
                    <MiniMap />
                </ReactFlow>

                {/* Edge Context Menu */}
                {showNodeContextMenu && selectedEdge && (
                    <div
                        className="absolute bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
                        style={{
                            left: `${contextMenuPosition.x}px`,
                            top: `${contextMenuPosition.y}px`,
                        }}
                    >
                        <button
                            onClick={handleDeleteEdge}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete Connection</span>
                        </button>
                    </div>
                )}

                {/* Node Context Menu */}
                {showNodeContextMenu && !selectedEdge && selectedNode && (
                    <div
                        className="absolute bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
                        style={{
                            left: `${contextMenuPosition.x}px`,
                            top: `${contextMenuPosition.y}px`,
                        }}
                    >
                        {(selectedNode.type === 'webhook' || selectedNode.type === 'http' || selectedNode.type === 'code') && (
                            <button
                                onClick={handleConfigureNode}
                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Configure Node</span>
                            </button>
                        )}
                        <button
                            onClick={handleDeleteNode}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete Node</span>
                        </button>
                    </div>
                )}

                {/* Config Modal */}
                {showConfigModal && selectedNode && selectedNode.type === 'webhook' && (
                    <WebhookConfigModal
                        node={selectedNode}
                        workflowId={id}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTestResult={handleTestResult}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'http' && (
                    <HttpRequestConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestHttpNode}
                        inputData={getNodeInputData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}
                    </>
                ) : (
                    <WorkflowHistory />
                )}
            </div>
        </div>
    );
}

export default WorkflowEditor;

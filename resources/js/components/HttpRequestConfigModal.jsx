import React, { useState, useEffect } from 'react';
import VariableInput from './VariableInput';
import CredentialModal from './CredentialModal';
import axios from '../config/axios';

function HttpRequestConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
    const [config, setConfig] = useState({
        method: 'GET',
        url: '',
        auth: 'none',
        credentialId: null,
        queryParams: [],
        headers: [],
        bodyType: 'json',
        bodyContent: '',
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [selectedVariable, setSelectedVariable] = useState(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [selectedCredentialType, setSelectedCredentialType] = useState('bearer');
    const [pinnedOutput, setPinnedOutput] = useState(null); // Pinned output for debugging
    const [inputViewMode, setInputViewMode] = useState('schema'); // 'schema', 'table', 'json'
    const [outputViewMode, setOutputViewMode] = useState('json'); // 'schema', 'table', 'json'
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
        fetchCredentials();
        loadPinnedOutput();
    }, [node]);

    const loadPinnedOutput = async () => {
        if (!node?.id) return;
        
        // Try to load from node data first (if workflow already loaded with nodes)
        if (node?.data?.pinnedOutput) {
            setPinnedOutput(node.data.pinnedOutput);
            // Make it available to downstream nodes
            if (onTestResult && node?.id) {
                onTestResult(node.id, node.data.pinnedOutput);
            }
            return;
        }

        // Fallback: fetch from API
        const pathParts = window.location.pathname.split('/');
        const workflowId = pathParts[pathParts.indexOf('workflows') + 1];
        
        if (!workflowId || workflowId === 'new') return;

        try {
            const response = await axios.get(`/workflows/${workflowId}/nodes/${node.id}/pinned-output`);
            if (response.data.pinned_output) {
                setPinnedOutput(response.data.pinned_output);
                // Make it available to downstream nodes
                if (onTestResult && node?.id) {
                    onTestResult(node.id, response.data.pinned_output);
                }
            }
        } catch (error) {
            console.error('Error loading pinned output:', error);
        }
    };

    useEffect(() => {
        console.log('HttpRequestConfigModal - Current node ID:', node?.id);
        console.log('HttpRequestConfigModal - All edges:', allEdges);
        console.log('HttpRequestConfigModal - All nodes:', allNodes);
        console.log('HttpRequestConfigModal - Input data:', inputData);

        if (allEdges && node?.id) {
            const incomingEdges = allEdges.filter(edge => edge.target === node.id);
            console.log('HttpRequestConfigModal - Incoming edges for this node:', incomingEdges);
        }
    }, [node, allEdges, allNodes, inputData]);

    const fetchCredentials = async (type = null) => {
        try {
            const params = type ? { type } : {};
            const response = await axios.get('/credentials', { params });
            setCredentials(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching credentials:', error);
            setCredentials([]); // Ensure it's always an array on error
        }
    };

    const handleCredentialSaved = (credential) => {
        fetchCredentials();
        setConfig({ ...config, credentialId: credential.id });
        setShowCredentialModal(false);
    };

    // Render draggable JSON - n8n style
    const toggleCollapse = (path) => {
        setCollapsedPaths(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    const renderDraggableJSON = (obj, prefix = '', indent = 0) => {
        if (obj === null || obj === undefined) {
            return (
                <div className="flex items-center gap-2 py-1">
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">null</span>
                </div>
            );
        }

        if (Array.isArray(obj)) {
            const typeInfo = getTypeInfo(obj);
            const isCollapsed = collapsedPaths.has(prefix);
            return (
                <div className="space-y-1">
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 -mx-1"
                        onClick={() => toggleCollapse(prefix)}
                    >
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                            {isCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{obj.length} items</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-4 space-y-1">
                            {obj.map((item, index) => {
                                const itemPath = `${prefix}[${index}]`;
                                return (
                                    <div key={index} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">[{index}]</div>
                                        {renderDraggableJSON(item, itemPath, indent + 1)}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            return (
                <div className="space-y-1">
                    {keys.map((key) => {
                        const value = obj[key];
                        const isPrimitive = typeof value !== 'object' || value === null;
                        const variablePath = prefix ? `${prefix}.${key}` : key;
                        const typeInfo = getTypeInfo(value);
                        const isCollapsed = collapsedPaths.has(variablePath);

                        return (
                            <div key={key} className="group">
                                <div className="flex items-start gap-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-2 -mx-2">
                                    {!isPrimitive && (
                                        <span 
                                            className="text-gray-500 dark:text-gray-400 text-xs cursor-pointer mt-1"
                                            onClick={() => toggleCollapse(variablePath)}
                                        >
                                            {isCollapsed ? '▶' : '▼'}
                                        </span>
                                    )}
                                    <div 
                                        className="flex-1 min-w-0 cursor-move"
                                        draggable="true"
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        title={`Kéo thả để sử dụng {{${variablePath}}}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono flex-shrink-0`}>
                                                {typeInfo.icon}
                                            </span>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                                                {key}
                                            </span>
                                            {!isPrimitive && isCollapsed && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {isPrimitive && (
                                            <div 
                                                className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono break-all cursor-move"
                                                draggable="true"
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                                    e.dataTransfer.effectAllowed = 'copy';
                                                }}
                                            >
                                                {typeof value === 'string' 
                                                    ? `"${truncateText(value)}"`
                                                    : String(value)
                                                }
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            const variable = `{{${variablePath}}}`;
                                            navigator.clipboard.writeText(variable);
                                            alert(`✓ Đã copy: ${variable}`);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-opacity flex-shrink-0"
                                        title="Copy variable"
                                    >
                                        📋
                                    </button>
                                </div>

                                {!isPrimitive && !isCollapsed && (
                                    <div className="ml-6 mt-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                        {renderDraggableJSON(value, variablePath, indent + 1)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Primitive value
        const typeInfo = getTypeInfo(obj);
        return (
            <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                    {typeInfo.icon}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };

    const addParam = (type) => {
        setConfig({
            ...config,
            [type]: [...config[type], { name: '', value: '' }],
        });
    };

    const updateParam = (type, index, field, value) => {
        const updated = [...config[type]];
        updated[index][field] = value;
        setConfig({ ...config, [type]: updated });
    };

    const removeParam = (type, index) => {
        setConfig({
            ...config,
            [type]: config[type].filter((_, i) => i !== index),
        });
    };

    const handleSave = () => {
        onSave(config);
        // Optional: close modal after save
        // onClose();
    };

    const handleClose = () => {
        // Auto-save config when closing
        handleSave();
        onClose();
    };

    const handleTest = async () => {
        if (onTest) {
            setIsTesting(true);
            setTestResults(null);
            try {
                const result = await onTest(config);
                setTestResults(result);

                // Save test result to output data
                if (onTestResult && node?.id) {
                    onTestResult(node.id, result);
                }
            } catch (error) {
                const errorResult = {
                    error: error.message || 'An error occurred while testing the request',
                };
                setTestResults(errorResult);

                if (onTestResult && node?.id) {
                    onTestResult(node.id, errorResult);
                }
            } finally {
                setIsTesting(false);
            }
        }
    };

    // Pin/Unpin output
    const handlePinOutput = async () => {
        if (!testResults || !node?.id) return;

        // Extract workflow ID from URL
        const pathParts = window.location.pathname.split('/');
        const workflowId = pathParts[pathParts.indexOf('workflows') + 1];
        
        if (!workflowId || workflowId === 'new') {
            alert('Vui lòng lưu workflow trước khi pin output');
            return;
        }

        try {
            await axios.post(`/workflows/${workflowId}/nodes/${node.id}/pin-output`, {
                output: testResults,
                type: node.type,
            });
            setPinnedOutput(testResults);
            
            // Also update the parent's nodeOutputData so downstream nodes can see it
            if (onTestResult && node?.id) {
                onTestResult(node.id, testResults);
            }
        } catch (error) {
            console.error('Error pinning output:', error);
            alert('Lỗi khi pin output: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleUnpinOutput = async () => {
        if (!node?.id) return;

        // Extract workflow ID from URL
        const pathParts = window.location.pathname.split('/');
        const workflowId = pathParts[pathParts.indexOf('workflows') + 1];
        
        if (!workflowId || workflowId === 'new') return;

        try {
            await axios.delete(`/workflows/${workflowId}/nodes/${node.id}/pin-output`);
            setPinnedOutput(null);
            
            // Remove from parent's nodeOutputData
            if (onTestResult && node?.id) {
                onTestResult(node.id, null);
            }
        } catch (error) {
            console.error('Error unpinning output:', error);
            alert('Lỗi khi unpin output: ' + (error.response?.data?.message || error.message));
        }
    };

    // Get current display output (pinned takes priority)
    const getDisplayOutput = () => {
        if (pinnedOutput) return pinnedOutput;
        if (testResults) return testResults;
        if (outputData) return outputData;
        return null;
    };

    // Truncate long text
    const truncateText = (text, maxLength = 150) => {
        if (typeof text !== 'string') return text;
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    // Get type icon and color
    const getTypeInfo = (value) => {
        if (value === null) return { icon: '∅', color: 'gray', label: 'null' };
        if (Array.isArray(value)) return { icon: '[]', color: 'purple', label: 'array' };
        if (typeof value === 'object') return { icon: '{}', color: 'blue', label: 'object' };
        if (typeof value === 'string') return { icon: 'Abc', color: 'green', label: 'string' };
        if (typeof value === 'number') return { icon: '123', color: 'orange', label: 'number' };
        if (typeof value === 'boolean') return { icon: '✓', color: 'teal', label: 'boolean' };
        return { icon: '?', color: 'gray', label: 'unknown' };
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🌐</span>
                        <h2 
                            className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename) {
                                    onRename(); // Trigger parent's rename modal
                                }
                            }}
                            title="Click để đổi tên node"
                        >
                            {node?.data?.customName || 'HTTP Request'}
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel - INPUT */}
                    <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900 dark:text-white">INPUT</h3>
                                {inputData && inputData.length > 0 && (
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => setInputViewMode('schema')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'schema'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            Schema
                                        </button>
                                        <button
                                            onClick={() => setInputViewMode('table')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'table'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            Table
                                        </button>
                                        <button
                                            onClick={() => setInputViewMode('json')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'json'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {inputData && inputData.length > 0 ? (
                                <div className="space-y-4">
                                    {inputViewMode === 'schema' && inputData.map((data, index) => {
                                        const incomingEdges = allEdges?.filter(e => e.target === node?.id) || [];
                                        const sourceEdge = incomingEdges[index];
                                        const sourceNode = sourceEdge ? allNodes?.find(n => n.id === sourceEdge.source) : null;
                                        const nodeName = sourceNode?.data?.customName || sourceNode?.data?.label || sourceNode?.type || `input-${index}`;
                                        
                                        return (
                                            <div key={index}>
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                        {sourceNode?.data?.customName || sourceNode?.data?.label || `Input ${index + 1}`}
                                                    </span>
                                                    <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                                        {Object.keys(data || {}).length} fields
                                                    </span>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                                    {renderDraggableJSON(data, nodeName)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {inputViewMode === 'table' && (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                <thead className="bg-gray-50 dark:bg-gray-900">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Field</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Value</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {inputData.map((data, inputIndex) => {
                                                        const incomingEdges = allEdges?.filter(e => e.target === node?.id) || [];
                                                        const sourceEdge = incomingEdges[inputIndex];
                                                        const sourceNode = sourceEdge ? allNodes?.find(n => n.id === sourceEdge.source) : null;
                                                        const nodeName = sourceNode?.data?.customName || sourceNode?.data?.label || sourceNode?.type || `input-${inputIndex}`;
                                                        
                                                        return Object.entries(data || {}).map(([key, value]) => {
                                                            const variablePath = `${nodeName}.${key}`;
                                                            const typeInfo = getTypeInfo(value);
                                                            return (
                                                                <tr key={`${inputIndex}-${key}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                                    <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300 font-medium">{key}</td>
                                                                    <td className="px-3 py-2">
                                                                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                                                                            {typeInfo.label}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 font-mono max-w-xs truncate">
                                                                        {typeof value === 'string' ? truncateText(value, 50) : JSON.stringify(value)}
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <button
                                                                            draggable="true"
                                                                            onDragStart={(e) => {
                                                                                e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                                                                e.dataTransfer.effectAllowed = 'copy';
                                                                            }}
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(`{{${variablePath}}}`);
                                                                                alert(`✓ Đã copy: {{${variablePath}}}`);
                                                                            }}
                                                                            className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded"
                                                                        >
                                                                            Use
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        });
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    
                                    {inputViewMode === 'json' && inputData.map((data, index) => (
                                        <div key={index}>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                Input {index + 1}:
                                            </div>
                                            <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                                {JSON.stringify(data, null, 2)}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    <p className="text-center text-sm">
                                        Connect this node to receive input data
                                    </p>
                                    <p className="text-center text-xs mt-2">
                                        Kéo thả biến từ đây vào configuration
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Configuration */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-2">
                            <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                            <button className="px-4 py-1.5 text-gray-600 dark:text-gray-400 text-sm font-medium">
                                Settings
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {/* Method */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Method
                                </label>
                                <select
                                    value={config.method}
                                    onChange={(e) => setConfig({ ...config, method: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="GET">GET</option>
                                    <option value="POST">POST</option>
                                    <option value="PUT">PUT</option>
                                    <option value="PATCH">PATCH</option>
                                    <option value="DELETE">DELETE</option>
                                </select>
                            </div>

                            {/* URL */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    URL
                                </label>
                                <VariableInput
                                    type="text"
                                    name="url"
                                    value={config.url}
                                    inputData={inputData}
                                    onChange={(e) => setConfig({ ...config, url: e.target.value })}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const variable = e.dataTransfer.getData('text/plain');
                                        const start = e.target.selectionStart;
                                        const end = e.target.selectionEnd;
                                        const currentValue = e.target.value;
                                        const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                        setConfig(prev => ({ ...prev, url: newValue }));
                                        setTimeout(() => {
                                            e.target.setSelectionRange(start + variable.length, start + variable.length);
                                        }, 0);
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    placeholder="https://example.com/api"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Authentication */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Authentication
                                </label>
                                <select
                                    value={config.auth}
                                    onChange={(e) => {
                                        setConfig({ ...config, auth: e.target.value, credentialId: null });
                                        setSelectedCredentialType(e.target.value === 'basic' ? 'basic' : e.target.value === 'bearer' ? 'bearer' : 'api_key');
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="none">None</option>
                                    <option value="basic">Basic Auth</option>
                                    <option value="bearer">Bearer Token</option>
                                    <option value="api_key">API Key</option>
                                    <option value="oauth2">OAuth2</option>
                                    <option value="custom">Custom Header</option>
                                </select>
                            </div>

                            {(config.auth !== 'none') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Credential
                                    </label>
                                    <div className="flex space-x-2">
                                        <select
                                            value={config.credentialId || ''}
                                            onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">Select Credential...</option>
                                            {Array.isArray(credentials) && credentials
                                                .filter(cred => cred.type === config.auth || config.auth === 'custom')
                                                .map(cred => (
                                                    <option key={cred.id} value={cred.id}>
                                                        {cred.name} ({cred.type})
                                                    </option>
                                                ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedCredentialType(config.auth === 'basic' ? 'basic' : config.auth === 'bearer' ? 'bearer' : 'api_key');
                                                setShowCredentialModal(true);
                                            }}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                            title="Create new credential"
                                        >
                                            + New
                                        </button>
                                    </div>
                                    {!config.credentialId && (
                                        <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                            ⚠️ Please select a credential or create a new one
                                        </p>
                                    )}
                                    {config.credentialId && (
                                        <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                                            ✓ Credential selected
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Legacy credential input (hidden when using credential selector) */}
                            {(config.auth === 'custom') && !config.credentialId && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Custom Credential Value
                                    </label>
                                    <VariableInput
                                        type="text"
                                        name="credential"
                                        value={config.credential || ''}
                                        onChange={(e) => setConfig({ ...config, credential: e.target.value })}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const variable = e.dataTransfer.getData('text/plain');
                                            const start = e.target.selectionStart;
                                            const end = e.target.selectionEnd;
                                            const currentValue = e.target.value;
                                            const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                            setConfig(prev => ({ ...prev, credential: newValue }));
                                            setTimeout(() => {
                                                e.target.setSelectionRange(start + variable.length, start + variable.length);
                                            }, 0);
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        placeholder="Enter credential"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            )}

                            {/* Query Parameters */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Send Query Parameters
                                    </label>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.queryParams.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked && config.queryParams.length === 0) {
                                                    setConfig({ ...config, queryParams: [{ name: '', value: '' }] });
                                                } else if (!e.target.checked) {
                                                    setConfig({ ...config, queryParams: [] });
                                                }
                                            }}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                {config.queryParams.map((param, index) => (
                                    <div key={index} className="flex space-x-2 mb-2">
                                        <input
                                            type="text"
                                            name={`queryParam-${index}-name`}
                                            placeholder="Name"
                                            value={param.name}
                                            onChange={(e) => updateParam('queryParams', index, 'name', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('queryParams', index, 'name', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            type="text"
                                            name={`queryParam-${index}-value`}
                                            placeholder="Value"
                                            value={param.value}
                                            onChange={(e) => updateParam('queryParams', index, 'value', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('queryParams', index, 'value', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <button
                                            onClick={() => removeParam('queryParams', index)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {config.queryParams.length > 0 && (
                                    <button
                                        onClick={() => addParam('queryParams')}
                                        className="text-blue-600 hover:text-blue-700 text-sm"
                                    >
                                        + Add Parameter
                                    </button>
                                )}
                            </div>

                            {/* Headers */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Send Headers
                                    </label>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.headers.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked && config.headers.length === 0) {
                                                    setConfig({ ...config, headers: [{ name: '', value: '' }] });
                                                } else if (!e.target.checked) {
                                                    setConfig({ ...config, headers: [] });
                                                }
                                            }}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                {config.headers.map((header, index) => (
                                    <div key={index} className="flex space-x-2 mb-2">
                                        <input
                                            type="text"
                                            name={`header-${index}-name`}
                                            placeholder="Name"
                                            value={header.name}
                                            onChange={(e) => updateParam('headers', index, 'name', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('headers', index, 'name', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            type="text"
                                            name={`header-${index}-value`}
                                            placeholder="Value"
                                            value={header.value}
                                            onChange={(e) => updateParam('headers', index, 'value', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('headers', index, 'value', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <button
                                            onClick={() => removeParam('headers', index)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {config.headers.length > 0 && (
                                    <button
                                        onClick={() => addParam('headers')}
                                        className="text-blue-600 hover:text-blue-700 text-sm"
                                    >
                                        + Add Header
                                    </button>
                                )}
                            </div>

                            {/* Body */}
                            {['POST', 'PUT', 'PATCH'].includes(config.method) && (
                                <div>
                                    <div className="flex items-center mb-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
                                            Send Body
                                        </label>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.bodyType !== 'none'}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setConfig({ ...config, bodyType: 'json' });
                                                    } else {
                                                        setConfig({ ...config, bodyType: 'none' });
                                                    }
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                    {config.bodyType !== 'none' && (
                                        <>
                                            <select
                                                value={config.bodyType}
                                                onChange={(e) => setConfig({ ...config, bodyType: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-2"
                                            >
                                                <option value="json">JSON</option>
                                                <option value="form">Form-Data</option>
                                                <option value="urlencoded">Form Urlencoded</option>
                                                <option value="raw">Raw</option>
                                            </select>
                                            <textarea
                                                value={config.bodyContent}
                                                onChange={(e) => setConfig({ ...config, bodyContent: e.target.value })}
                                                placeholder="Enter body content"
                                                rows={5}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                            />
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Info */}
                            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                                You can view the raw requests this node makes in your browser's developer console.
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">OUTPUT</h3>
                                    {pinnedOutput && (
                                        <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded flex items-center gap-1">
                                            📌 Pinned
                                        </span>
                                    )}
                                </div>
                                {getDisplayOutput() && (
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => setOutputViewMode('schema')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'schema'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            Schema
                                        </button>
                                        <button
                                            onClick={() => setOutputViewMode('table')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'table'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            Table
                                        </button>
                                        <button
                                            onClick={() => setOutputViewMode('json')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'json'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Pin/Unpin Button */}
                                {getDisplayOutput() && (
                                    <button
                                        onClick={pinnedOutput ? handleUnpinOutput : handlePinOutput}
                                        className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                                            pinnedOutput 
                                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                        }`}
                                        title={pinnedOutput ? 'Unpin output' : 'Pin output for debugging'}
                                    >
                                        {pinnedOutput ? '📌 Unpin' : '📌 Pin'}
                                    </button>
                                )}
                                {/* Test Button */}
                                {onTest && (
                                    <button
                                        onClick={handleTest}
                                        disabled={isTesting || !config.url}
                                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                                    >
                                        {isTesting ? 'Testing...' : 'Test step'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                    <p className="text-center">Testing request...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <div className="relative">
                                    {pinnedOutput && (
                                        <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
                                            💡 Output này đã được pin để debug. Click "Unpin" để xóa.
                                        </div>
                                    )}
                                    
                                    {outputViewMode === 'schema' && (
                                        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                            {renderDraggableJSON(getDisplayOutput(), 'output')}
                                        </div>
                                    )}
                                    
                                    {outputViewMode === 'table' && (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                <thead className="bg-gray-50 dark:bg-gray-900">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Field</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {Object.entries(getDisplayOutput() || {}).map(([key, value]) => {
                                                        const typeInfo = getTypeInfo(value);
                                                        return (
                                                            <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                                <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300 font-medium">{key}</td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                                                                        {typeInfo.label}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 font-mono max-w-xs truncate">
                                                                    {typeof value === 'string' ? truncateText(value, 50) : JSON.stringify(value)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    
                                    {outputViewMode === 'json' && (
                                        <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                            {JSON.stringify(getDisplayOutput(), null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-center">
                                        Execute this node to view data or set mock data.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Credential Modal */}
            <CredentialModal
                isOpen={showCredentialModal}
                onClose={() => setShowCredentialModal(false)}
                onSave={handleCredentialSaved}
                credentialType={selectedCredentialType}
            />
        </div>
    );
}

export default HttpRequestConfigModal;

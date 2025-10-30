import React, { useState, useEffect } from 'react';
import VariableInput from './VariableInput';
import CredentialModal from './CredentialModal';
import axios from '../config/axios';

function PerplexityConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
    const [config, setConfig] = useState({
        model: 'sonar',
        systemMessageEnabled: false,
        systemMessage: '',
        messages: [
            { role: 'user', content: '' } // Initial user message
        ],
        credentialId: null,
        // Advanced options - dynamic
        advancedOptions: {}, // Will store selected options like { temperature: 0.8, maxTokens: 20000 }
    });

    // Available advanced options
    const availableOptions = [
        { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, default: 0.8, description: 'Độ sáng tạo của câu trả lời' },
        { key: 'max_tokens', label: 'Max Tokens', type: 'number', min: 1, max: 100000, step: 100, default: 20000, description: 'Giới hạn độ dài response' },
        { key: 'stream', label: 'Enable Streaming', type: 'boolean', default: false, description: 'Stream response' },
        { key: 'seed', label: 'Seed', type: 'number', min: 1, max: 999999, step: 1, default: 12345, description: 'For reproducibility' },
    ];

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [pinnedOutput, setPinnedOutput] = useState(null); // Pinned output for debugging
    const [inputViewMode, setInputViewMode] = useState('schema'); // 'schema', 'table', 'json'
    const [outputViewMode, setOutputViewMode] = useState('json'); // 'schema', 'table', 'json'
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    // Available Perplexity models
    const models = [
        { value: 'sonar', label: 'Sonar' },
        { value: 'sonar-pro', label: 'Sonar Pro' },
        { value: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
        { value: 'sonar-reasoning', label: 'Sonar Reasoning' },
    ];

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

    const fetchCredentials = async () => {
        try {
            // Fetch credentials with type 'custom' for header auth
            const response = await axios.get('/credentials', { params: { type: 'custom' } });
            setCredentials(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching credentials:', error);
            setCredentials([]);
        }
    };

    const handleCredentialSaved = (credential) => {
        fetchCredentials();
        setConfig({ ...config, credentialId: credential.id });
        setShowCredentialModal(false);
    };

    // Auto escape function for text content
    const autoEscape = (text) => {
        if (!text) return text;
        return text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Add new message pair (user + assistant)
    const addMessagePair = () => {
        const newMessages = [...config.messages];
        const lastRole = newMessages[newMessages.length - 1]?.role;
        
        // Always add in alternating pattern
        if (lastRole === 'user') {
            newMessages.push({ role: 'assistant', content: '' });
        } else {
            newMessages.push({ role: 'user', content: '' });
        }
        
        setConfig({ ...config, messages: newMessages });
    };

    // Update message content
    const updateMessage = (index, content) => {
        const newMessages = [...config.messages];
        newMessages[index].content = autoEscape(content);
        setConfig({ ...config, messages: newMessages });
    };

    // Delete message
    const deleteMessage = (index) => {
        const newMessages = config.messages.filter((_, i) => i !== index);
        // Ensure we always have at least one user message
        if (newMessages.length === 0) {
            newMessages.push({ role: 'user', content: '' });
        }
        setConfig({ ...config, messages: newMessages });
    };

    // Add advanced option
    const addAdvancedOption = (optionKey) => {
        const option = availableOptions.find(opt => opt.key === optionKey);
        if (option) {
            setConfig({
                ...config,
                advancedOptions: {
                    ...config.advancedOptions,
                    [optionKey]: option.default
                }
            });
        }
    };

    // Update advanced option value
    const updateAdvancedOption = (optionKey, value) => {
        setConfig({
            ...config,
            advancedOptions: {
                ...config.advancedOptions,
                [optionKey]: value
            }
        });
    };

    // Remove advanced option
    const removeAdvancedOption = (optionKey) => {
        const newOptions = { ...config.advancedOptions };
        delete newOptions[optionKey];
        setConfig({
            ...config,
            advancedOptions: newOptions
        });
    };

    // Get options that haven't been added yet
    const getAvailableOptionsToAdd = () => {
        return availableOptions.filter(opt => !(opt.key in config.advancedOptions));
    };

    const handleSave = () => {
        onSave(config);
    };

    const handleClose = () => {
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

    // Render draggable JSON - n8n style
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🔮</span>
                        <h2 
                            className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename) {
                                    onRename();
                                }
                            }}
                            title="Click để đổi tên node"
                        >
                            {node?.data?.customName || 'Perplexity AI'}
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
                                        const nodeName = sourceNode?.data?.customName || `input-${index}`;

                                        return (
                                            <div key={index}>
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                        {sourceNode?.data?.customName || `Input ${index + 1}`}
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
                                                    {inputData.map((data, inputIndex) => 
                                                        Object.entries(data || {}).map(([key, value]) => {
                                                            const incomingEdges = allEdges?.filter(e => e.target === node?.id) || [];
                                                            const sourceEdge = incomingEdges[inputIndex];
                                                            const sourceNode = sourceEdge ? allNodes?.find(n => n.id === sourceEdge.source) : null;
                                                            const nodeName = sourceNode?.data?.customName || `input-${inputIndex}`;
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
                                                        })
                                                    )}
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
                                        Kéo thả biến từ đây vào messages
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Configuration */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <button className="px-4 py-1.5 bg-purple-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {/* Credential Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Perplexity API Credential *
                                </label>
                                <div className="flex space-x-2">
                                    <select
                                        value={config.credentialId || ''}
                                        onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select Credential...</option>
                                        {credentials.map(cred => (
                                            <option key={cred.id} value={cred.id}>
                                                {cred.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setShowCredentialModal(true)}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                        title="Create new credential (use Custom Header Auth with Authorization header)"
                                    >
                                        + New
                                    </button>
                                </div>
                                {!config.credentialId && (
                                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                        ⚠️ Tạo credential kiểu "Custom Header" với Header Name = "Authorization" và Header Value = "Bearer YOUR_API_KEY"
                                    </p>
                                )}
                            </div>

                            {/* Model Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Model *
                                </label>
                                <select
                                    value={config.model}
                                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    {models.map(model => (
                                        <option key={model.value} value={model.value}>
                                            {model.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* System Message Toggle - Moved above User Message */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Enable System Message
                                    </label>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.systemMessageEnabled}
                                            onChange={(e) => setConfig({ ...config, systemMessageEnabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>
                                {config.systemMessageEnabled && (
                                    <>
                                        <textarea
                                            value={config.systemMessage}
                                            onChange={(e) => {
                                                const escaped = autoEscape(e.target.value);
                                                setConfig({ ...config, systemMessage: escaped });
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                const escaped = autoEscape(newValue);
                                                setConfig({ ...config, systemMessage: escaped });
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            placeholder="You are an expert assistant..."
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                        />
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            💡 Kéo thả biến từ INPUT panel hoặc dùng cú pháp {`{{variable}}`}
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* Messages List */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Messages
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addMessagePair}
                                        className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                                    >
                                        + Add Message
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {config.messages.map((message, index) => (
                                        <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-gray-50 dark:bg-gray-900">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center space-x-2">
                                                    <span className={`text-xs px-2 py-1 rounded font-semibold ${
                                                        message.role === 'user' 
                                                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                                                            : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                                                    }`}>
                                                        {message.role === 'user' ? '👤 User' : '🤖 Assistant'}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        Message {index + 1}
                                                    </span>
                                                </div>
                                                {config.messages.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteMessage(index)}
                                                        className="text-red-600 hover:text-red-700 text-xs"
                                                        title="Delete message"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                            <textarea
                                                value={message.content}
                                                onChange={(e) => updateMessage(index, e.target.value)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const variable = e.dataTransfer.getData('text/plain');
                                                    const start = e.target.selectionStart;
                                                    const end = e.target.selectionEnd;
                                                    const currentValue = e.target.value;
                                                    const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                    updateMessage(index, newValue);
                                                    setTimeout(() => {
                                                        e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                    }, 0);
                                                }}
                                                onDragOver={(e) => e.preventDefault()}
                                                placeholder={
                                                    message.role === 'user' 
                                                        ? "Enter user message or use {{variable}} syntax"
                                                        : "Enter assistant's previous response or use {{variable}} syntax"
                                                }
                                                rows={4}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                            />
                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                💡 Kéo thả biến từ INPUT panel
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                                    ℹ️ Messages sẽ tự động xen kẽ: User → Assistant → User → Assistant...
                                </p>
                            </div>

                            {/* Advanced Options - Dynamic */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Advanced Options
                                    </label>
                                    {getAvailableOptionsToAdd().length > 0 && (
                                        <select
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    addAdvancedOption(e.target.value);
                                                    e.target.value = ''; // Reset select
                                                }
                                            }}
                                            className="text-xs px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">+ Add Option</option>
                                            {getAvailableOptionsToAdd().map(opt => (
                                                <option key={opt.key} value={opt.key}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                
                                {Object.keys(config.advancedOptions).length > 0 && (
                                    <div className="space-y-3 bg-gray-50 dark:bg-gray-900 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                                        {Object.entries(config.advancedOptions).map(([optionKey, optionValue]) => {
                                            const optionDef = availableOptions.find(opt => opt.key === optionKey);
                                            if (!optionDef) return null;

                                            return (
                                                <div key={optionKey} className="border border-gray-300 dark:border-gray-600 rounded-md p-3 bg-white dark:bg-gray-800">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                            {optionDef.label}
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeAdvancedOption(optionKey)}
                                                            className="text-red-600 hover:text-red-700 text-xs"
                                                            title="Remove option"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    
                                                    {optionDef.type === 'boolean' ? (
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={optionValue}
                                                                onChange={(e) => updateAdvancedOption(optionKey, e.target.checked)}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                                                        </label>
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            step={optionDef.step}
                                                            min={optionDef.min}
                                                            max={optionDef.max}
                                                            value={optionValue}
                                                            onChange={(e) => {
                                                                const val = optionDef.step < 1 
                                                                    ? parseFloat(e.target.value) 
                                                                    : parseInt(e.target.value);
                                                                updateAdvancedOption(optionKey, val || optionDef.default);
                                                            }}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                        />
                                                    )}
                                                    
                                                    {optionDef.description && (
                                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            {optionDef.description}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                
                                {Object.keys(config.advancedOptions).length === 0 && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                        Chọn option từ dropdown phía trên để thêm vào configuration
                                    </p>
                                )}
                            </div>

                            {/* Info */}
                            <div className="text-xs text-gray-500 dark:text-gray-400 italic bg-blue-50 dark:bg-blue-900 p-3 rounded border border-blue-200 dark:border-blue-700">
                                <strong>API Endpoint:</strong> https://api.perplexity.ai/chat/completions
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
                                        disabled={
                                            isTesting || 
                                            !config.credentialId || 
                                            !config.messages || 
                                            config.messages.length === 0 ||
                                            !config.messages.some(msg => msg.content && msg.content.trim())
                                        }
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
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                                    <p className="text-center">Đang gọi Perplexity API...</p>
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
                                        Nhấn "Test step" để xem kết quả từ Perplexity AI
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
                credentialType="custom"
            />
        </div>
    );
}

export default PerplexityConfigModal;


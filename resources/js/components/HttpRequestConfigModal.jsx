import React, { useState, useEffect } from 'react';
import VariableInput from './VariableInput';
import CredentialModal from './CredentialModal';
import axios from '../config/axios';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';
import ExpandableTextarea from './ExpandableTextarea';

function HttpRequestConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        method: 'GET',
        url: '',
        auth: 'none',
        credentialId: null,
        queryParams: [],
        headers: [],
        bodyType: 'json',
        bodyContent: '',
        bodyParams: [], // Array of {name, value} for key-value fields
        specifyBody: 'fields', // 'fields' or 'raw'
        sendBody: false,
        timeout: 30, // Timeout in seconds (default 30s)
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [selectedVariable, setSelectedVariable] = useState(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [selectedCredentialType, setSelectedCredentialType] = useState('bearer');
    const [inputViewMode, setInputViewMode] = useState('schema'); // 'schema', 'table', 'json'
    const [outputViewMode, setOutputViewMode] = useState('json'); // 'schema', 'table', 'json'
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    useEffect(() => {
        if (node?.data?.config) {
            const nodeConfig = { ...node.data.config };
            
            // If bodyParams exists, use it. Otherwise, try to parse bodyContent to bodyParams
            if (!nodeConfig.bodyParams && nodeConfig.bodyContent) {
                try {
                    // Try to parse JSON bodyContent to extract key-value pairs
                    const parsed = JSON.parse(nodeConfig.bodyContent);
                    if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
                        nodeConfig.bodyParams = Object.keys(parsed).map(key => ({
                            name: key,
                            value: typeof parsed[key] === 'string' ? parsed[key] : JSON.stringify(parsed[key])
                        }));
                        nodeConfig.specifyBody = 'fields';
                    } else {
                        nodeConfig.specifyBody = 'raw';
                    }
                } catch (e) {
                    // Not valid JSON or can't parse, keep as raw
                    nodeConfig.specifyBody = 'raw';
                }
            } else if (!nodeConfig.specifyBody) {
                // Default to fields if bodyParams exists
                nodeConfig.specifyBody = nodeConfig.bodyParams && nodeConfig.bodyParams.length > 0 ? 'fields' : 'raw';
            }
            
            // Set sendBody based on bodyType or bodyContent
            if (nodeConfig.bodyType && nodeConfig.bodyType !== 'none') {
                nodeConfig.sendBody = true;
            }
            
            setConfig({ ...config, ...nodeConfig });
        }
        fetchCredentials();
    }, [node]);


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
        const currentPrefix = normalizeVariablePrefix(prefix, indent === 0);

        if (obj === null || obj === undefined) {
            return (
                <div className="flex items-center gap-2 py-1">
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">null</span>
                </div>
            );
        }

        if (Array.isArray(obj)) {
            const typeInfo = getTypeInfo(obj);
            const collapseKey = currentPrefix || prefix;
            const isCollapsed = collapsedPaths.has(collapseKey);
            return (
                <div className="space-y-1">
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
                        onClick={() => toggleCollapse(collapseKey)}
                    >
                        <span className="text-gray-500 text-xs">
                            {isCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500">{obj.length} items</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-4 space-y-1">
                            {obj.map((item, index) => {
                                const itemPath = buildArrayPath(currentPrefix, index);
                                return (
                                    <div key={index} className="border-l-2 border-gray-200 pl-3">
                                        <div className="text-xs text-gray-500 mb-1">[{index}]</div>
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
                        const variablePath = buildVariablePath(currentPrefix, key);
                        const typeInfo = getTypeInfo(value);
                        const isCollapsed = collapsedPaths.has(variablePath);

                        return (
                            <div key={key} className="group">
                                <div className="flex items-start gap-2 py-1 hover:bg-gray-100 rounded px-2 -mx-2">
                                    {!isPrimitive && (
                                        <span 
                                            className="text-gray-500 text-xs cursor-pointer mt-1"
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
                                            <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono flex-shrink-0`}>
                                                {typeInfo.icon}
                                            </span>
                                            <span className="text-sm font-medium text-gray-700 truncate">
                                                {key}
                                            </span>
                                            {!isPrimitive && isCollapsed && (
                                                <span className="text-xs text-gray-500">
                                                    {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {isPrimitive && (
                                            <div 
                                                className="mt-1 text-xs text-gray-600 font-mono break-all cursor-move"
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
                                    <div className="ml-6 mt-1 border-l-2 border-gray-200 pl-3">
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
                <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                    {typeInfo.icon}
                </span>
                <span className="text-xs text-gray-600 font-mono">
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
        const configToSave = { ...config };
        
        // Convert bodyParams to bodyContent if using fields mode
        if (config.specifyBody === 'fields' && config.bodyParams && config.bodyParams.length > 0) {
            const bodyObj = {};
            config.bodyParams.forEach(param => {
                if (param.name && param.name.trim() !== '') {
                    bodyObj[param.name] = param.value || '';
                }
            });
            configToSave.bodyContent = JSON.stringify(bodyObj, null, 2);
        }
        // If using raw mode, keep bodyContent as is
        
        // Remove bodyParams from saved config (only save bodyContent for backward compat)
        delete configToSave.bodyParams;
        delete configToSave.specifyBody;
        
        onSave(configToSave);
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
                // Convert bodyParams to bodyContent if using fields mode (same as handleSave)
                const testConfig = { ...config };
                if (config.specifyBody === 'fields' && config.bodyParams && config.bodyParams.length > 0) {
                    const bodyObj = {};
                    config.bodyParams.forEach(param => {
                        if (param.name && param.name.trim() !== '') {
                            bodyObj[param.name] = param.value || '';
                        }
                    });
                    testConfig.bodyContent = JSON.stringify(bodyObj, null, 2);
                }
                
                const result = await onTest(testConfig);
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

    // Get current display output
    const getDisplayOutput = () => {
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🌐</span>
                        <h2 
                            className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename && !readOnly) {
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
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel - INPUT */}
                    <div className="w-1/3 border-r border-subtle flex flex-col bg-surface-elevated">
                        <div className="bg-surface-muted px-4 py-3 border-b border-subtle">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-primary">INPUT</h3>
                                {inputData && Object.keys(inputData).length > 0 && (
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => setInputViewMode('schema')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'schema'
                                                    ? 'bg-primary-soft text-primary shadow-card'
                                                    : 'text-muted hover:bg-surface-muted'
                                            }`}
                                        >
                                            Schema
                                        </button>
                                        <button
                                            onClick={() => setInputViewMode('table')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'table'
                                                    ? 'bg-primary-soft text-primary shadow-card'
                                                    : 'text-muted hover:bg-surface-muted'
                                            }`}
                                        >
                                            Table
                                        </button>
                                        <button
                                            onClick={() => setInputViewMode('json')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'json'
                                                    ? 'bg-primary-soft text-primary shadow-card'
                                                    : 'text-muted hover:bg-surface-muted'
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {inputData && Object.keys(inputData).length > 0 ? (
                                <div className="space-y-4">
                                    {inputViewMode === 'schema' && Object.entries(inputData).map(([nodeName, data]) => {
                                        return (
                                            <div key={nodeName}>
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                                                    <span className="text-xs font-semibold text-gray-700">
                                                        {nodeName}
                                                    </span>
                                                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                                        {Object.keys(data || {}).length} fields
                                                    </span>
                                                </div>
                                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                                    {renderDraggableJSON(data, nodeName)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {inputViewMode === 'table' && (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Field</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Value</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {Object.entries(inputData).map(([nodeName, data]) => {
                                                        return Object.entries(data || {}).map(([key, value]) => {
                                                            const variablePath = `${nodeName}.${key}`;
                                                            const typeInfo = getTypeInfo(value);
                                                            return (
                                                                <tr key={`${nodeName}-${key}`} className="hover:bg-gray-50">
                                                                    <td className="px-3 py-2 text-sm text-gray-900 font-medium">{key}</td>
                                                                    <td className="px-3 py-2">
                                                                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                                                                            {typeInfo.label}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-xs text-gray-600 font-mono max-w-xs truncate">
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
                                    
                                    {inputViewMode === 'json' && Object.entries(inputData).map(([nodeName, data]) => (
                                        <div key={nodeName}>
                                            <div className="text-xs font-semibold text-gray-700 mb-2">
                                                {nodeName}:
                                            </div>
                                            <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-auto whitespace-pre-wrap text-gray-800">
                                                {JSON.stringify(data, null, 2)}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
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
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center space-x-2">
                            <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                            <button className="px-4 py-1.5 text-gray-600 text-sm font-medium">
                                Settings
                            </button>
                        </div>
                        <div className={`flex-1 p-4 overflow-y-auto space-y-4 ${readOnly ? 'pointer-events-none opacity-75' : ''}`}>
                            {/* Method */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Method
                                </label>
                                <select
                                    value={config.method}
                                    onChange={(e) => setConfig({ ...config, method: e.target.value })}
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    URL
                                </label>
                                <VariableInput
                                    name="url"
                                    value={config.url}
                                    inputData={inputData}
                                    rows={1}
                                    onChange={(newValue) => setConfig({ ...config, url: newValue })}
                                    placeholder="https://example.com/api"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                />
                            </div>

                            {/* Authentication */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Authentication
                                </label>
                                <select
                                    value={config.auth}
                                    onChange={(e) => {
                                        setConfig({ ...config, auth: e.target.value, credentialId: null });
                                        setSelectedCredentialType(e.target.value === 'basic' ? 'basic' : e.target.value === 'bearer' ? 'bearer' : 'api_key');
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Credential
                                    </label>
                                    <div className="flex space-x-2">
                                        <select
                                            value={config.credentialId || ''}
                                            onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
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
                                        <p className="mt-1 text-xs text-orange-600">
                                            ⚠️ Please select a credential or create a new one
                                        </p>
                                    )}
                                    {config.credentialId && (
                                        <p className="mt-1 text-xs text-green-600">
                                            ✓ Credential selected
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Legacy credential input (hidden when using credential selector) */}
                            {(config.auth === 'custom') && !config.credentialId && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Custom Credential Value
                                    </label>
                                    <VariableInput
                                        rows={1}
                                        onChange={(newValue) => setConfig({ ...config, credential: newValue })}
                                        placeholder="Enter credential"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    />
                                </div>
                            )}

                            {/* Query Parameters */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
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
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                {config.queryParams.map((param, index) => (
                                    <div key={index} className="flex space-x-2 mb-2">
                                        <div className="flex-1">
                                            <ExpandableTextarea
                                                value={param.name}
                                                onChange={(newValue) => updateParam('queryParams', index, 'name', newValue)}
                                                inputData={inputData}
                                                rows={1}
                                                placeholder="Name"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <ExpandableTextarea
                                                value={param.value}
                                                onChange={(newValue) => updateParam('queryParams', index, 'value', newValue)}
                                                inputData={inputData}
                                                rows={1}
                                                placeholder="Value"
                                            />
                                        </div>
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
                                    <label className="block text-sm font-medium text-gray-700">
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
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                {config.headers.map((header, index) => (
                                    <div key={index} className="flex space-x-2 mb-2">
                                        <div className="flex-1">
                                            <ExpandableTextarea
                                                value={header.name}
                                                onChange={(newValue) => updateParam('headers', index, 'name', newValue)}
                                                inputData={inputData}
                                                rows={1}
                                                placeholder="Name"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <ExpandableTextarea
                                                value={header.value}
                                                onChange={(newValue) => updateParam('headers', index, 'value', newValue)}
                                                inputData={inputData}
                                                rows={1}
                                                placeholder="Value"
                                            />
                                        </div>
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

                            {/* Timeout */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Timeout (seconds)
                                </label>
                                <ExpandableTextarea
                                    value={config.timeout !== undefined ? String(config.timeout) : '30'}
                                    onChange={(newValue) => {
                                        const parsed = parseInt(newValue, 10);
                                        setConfig({ ...config, timeout: Number.isNaN(parsed) ? 30 : parsed });
                                    }}
                                    rows={1}
                                    placeholder="30"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Maximum time to wait for response (1-300 seconds). Default: 30s
                                </p>
                            </div>

                            {/* Body */}
                            {['POST', 'PUT', 'PATCH'].includes(config.method) && (
                                <div>
                                    <div className="flex items-center mb-2">
                                        <label className="block text-sm font-medium text-gray-700 mr-2">
                                            Send Body
                                        </label>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.sendBody || false}
                                                onChange={(e) => {
                                                    setConfig({ 
                                                        ...config, 
                                                        sendBody: e.target.checked,
                                                        bodyType: e.target.checked ? 'json' : 'none'
                                                    });
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                    {config.sendBody && (
                                        <>
                                            {/* Body Content Type */}
                                            <div className="mb-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Body Content Type
                                                </label>
                                                <select
                                                    value={config.bodyType || 'json'}
                                                    onChange={(e) => setConfig({ ...config, bodyType: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                                >
                                                    <option value="json">JSON</option>
                                                    <option value="form">Form-Data</option>
                                                    <option value="urlencoded">Form Urlencoded</option>
                                                    <option value="raw">Raw</option>
                                                </select>
                                            </div>
                                            
                                            {/* Specify Body */}
                                            {config.bodyType === 'json' && (
                                                <div className="mb-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Specify Body
                                                    </label>
                                                    <select
                                                        value={config.specifyBody || 'fields'}
                                                        onChange={(e) => setConfig({ ...config, specifyBody: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                                    >
                                                        <option value="fields">Using Fields Below</option>
                                                        <option value="raw">Raw JSON</option>
                                                    </select>
                                                </div>
                                            )}
                                            
                                            {/* Body Parameters (Fields) */}
                                            {config.bodyType === 'json' && config.specifyBody === 'fields' && (
                                                <div className="mb-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        Body Parameters
                                                    </label>
                                                    {(config.bodyParams || []).length > 0 && (
                                                        <div className="grid grid-cols-2 gap-2 mb-2 px-2">
                                                            <div className="text-xs font-medium text-gray-600">Name</div>
                                                            <div className="text-xs font-medium text-gray-600">Value</div>
                                                        </div>
                                                    )}
                                                    <div className="space-y-2">
                                                        {(config.bodyParams || []).map((param, index) => (
                                                            <div key={index} className="flex gap-2 items-center">
                                                                <div className="flex-1">
                                                                    <ExpandableTextarea
                                                                        value={param.name || ''}
                                                                        onChange={(newValue) => {
                                                                            const newParams = [...(config.bodyParams || [])];
                                                                            newParams[index] = { ...newParams[index], name: newValue };
                                                                            setConfig({ ...config, bodyParams: newParams });
                                                                        }}
                                                                        inputData={inputData}
                                                                        rows={1}
                                                                        placeholder="Name"
                                                                    />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <ExpandableTextarea
                                                                        value={param.value || ''}
                                                                        onChange={(newValue) => {
                                                                            const newParams = [...(config.bodyParams || [])];
                                                                            newParams[index] = { ...newParams[index], value: newValue };
                                                                            setConfig({ ...config, bodyParams: newParams });
                                                                        }}
                                                                        inputData={inputData}
                                                                        rows={1}
                                                                        placeholder="Value"
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newParams = config.bodyParams.filter((_, i) => i !== index);
                                                                        setConfig({ ...config, bodyParams: newParams });
                                                                    }}
                                                                    className="text-red-600 hover:text-red-700"
                                                                    title="Remove parameter"
                                                                >
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <button
                                                            onClick={() => {
                                                                setConfig({ 
                                                                    ...config, 
                                                                    bodyParams: [...(config.bodyParams || []), { name: '', value: '' }]
                                                                });
                                                            }}
                                                            className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 text-sm"
                                                        >
                                                            + Add Parameter
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Raw Body Content */}
                                            {(config.bodyType !== 'json' || config.specifyBody === 'raw') && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        {config.bodyType === 'json' ? 'Raw Body Content' : 'Body Content'}
                                                    </label>
                                                    <ExpandableTextarea
                                                        value={config.bodyContent || ''}
                                                        onChange={(newValue) => setConfig({ ...config, bodyContent: newValue })}
                                                        placeholder="Enter body content"
                                                        rows={5}
                                                        inputData={inputData}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Info */}
                            <div className="text-xs text-gray-500 italic">
                                You can view the raw requests this node makes in your browser's developer console.
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-gray-900">OUTPUT</h3>
                                </div>
                                {getDisplayOutput() && (
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => setOutputViewMode('schema')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'schema'
                                                    ? 'bg-primary-soft text-primary shadow-card'
                                                    : 'text-muted hover:bg-surface-muted'
                                            }`}
                                        >
                                            Schema
                                        </button>
                                        <button
                                            onClick={() => setOutputViewMode('table')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'table'
                                                    ? 'bg-primary-soft text-primary shadow-card'
                                                    : 'text-muted hover:bg-surface-muted'
                                            }`}
                                        >
                                            Table
                                        </button>
                                        <button
                                            onClick={() => setOutputViewMode('json')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'json'
                                                    ? 'bg-primary-soft text-primary shadow-card'
                                                    : 'text-muted hover:bg-surface-muted'
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Read-only indicator */}
                                {readOnly && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-medium">
                                        📖 Viewing execution history (Read-only)
                                    </span>
                                )}
                                {/* Test Button */}
                                {onTest && !readOnly && (
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
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                    <p className="text-center">Testing request...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <div className="relative">
                                    {outputViewMode === 'schema' && (
                                        <div className="bg-white p-3 rounded-lg border border-gray-200">
                                            {renderDraggableJSON(getDisplayOutput(), 'output')}
                                        </div>
                                    )}
                                    
                                    {outputViewMode === 'table' && (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Field</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {Object.entries(getDisplayOutput() || {}).map(([key, value]) => {
                                                        const typeInfo = getTypeInfo(value);
                                                        return (
                                                            <tr key={key} className="hover:bg-gray-50">
                                                                <td className="px-3 py-2 text-sm text-gray-900 font-medium">{key}</td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                                                                        {typeInfo.label}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-xs text-gray-600 font-mono max-w-xs truncate">
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
                                        <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-auto whitespace-pre-wrap text-gray-800">
                                            {JSON.stringify(getDisplayOutput(), null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
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

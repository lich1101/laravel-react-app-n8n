import React, { useState, useEffect } from 'react';
import VariableInput from './VariableInput';
import CredentialModal from './CredentialModal';
import axios from '../config/axios';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';
import JSONViewer from './common/JSONViewer';
import { buildVariablePath } from '../utils/variablePath';

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

    const [selectedVariable, setSelectedVariable] = useState(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [selectedCredentialType, setSelectedCredentialType] = useState('bearer');

    // Custom handleSave để xử lý bodyParams conversion
    const customHandleSave = () => {
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
        
        // Remove bodyParams from saved config (only save bodyContent for backward compat)
        delete configToSave.bodyParams;
        delete configToSave.specifyBody;
        
        onSave(configToSave);
    };

    // Custom handleTest để xử lý bodyParams conversion
    const customHandleTest = async (configToTest) => {
        if (!onTest) return null;
        
        // Convert bodyParams to bodyContent if using fields mode (same as handleSave)
        const testConfig = { ...configToTest };
        if (configToTest.specifyBody === 'fields' && configToTest.bodyParams && configToTest.bodyParams.length > 0) {
            const bodyObj = {};
            configToTest.bodyParams.forEach(param => {
                if (param.name && param.name.trim() !== '') {
                    bodyObj[param.name] = param.value || '';
                }
            });
            testConfig.bodyContent = JSON.stringify(bodyObj, null, 2);
        }
        
        return await onTest(testConfig);
    };

    // Sử dụng custom hook cho logic chung
    const {
        testResults,
        isTesting,
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput,
        setInputViewMode,
        setOutputViewMode,
        handleSave,
        handleClose,
        handleTest,
        handleStopTest,
        togglePathCollapse,
    } = useConfigModal({
        onTest: (config) => customHandleTest(config),
        onSave: customHandleSave,
        onClose,
        onTestResult,
        node,
        config,
        inputData,
        outputData,
        readOnly
    });

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

    // Helper functions for table mode (only used in HttpRequestConfigModal)
    const getTypeInfo = (value) => {
        if (value === null) return { icon: '∅', color: 'gray', label: 'null' };
        if (Array.isArray(value)) return { icon: '[]', color: 'purple', label: 'array' };
        if (typeof value === 'object') return { icon: '{}', color: 'blue', label: 'object' };
        if (typeof value === 'string') return { icon: 'Abc', color: 'green', label: 'string' };
        if (typeof value === 'number') return { icon: '123', color: 'orange', label: 'number' };
        if (typeof value === 'boolean') return { icon: '✓', color: 'teal', label: 'boolean' };
        return { icon: '?', color: 'gray', label: 'unknown' };
    };

    const truncateText = (text, maxLength = 150) => {
        if (typeof text !== 'string') return text;
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
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

    // Removed handleSave, handleClose, handleTest, handleStopTest, getDisplayOutput, truncateText, getTypeInfo - now using shared hooks

    // Test buttons
    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Stop step
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={!config.url}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Test step
                </button>
            )}
        </>
    ) : null;

    return (
        <ConfigModalLayout
            node={node}
            onRename={onRename}
            onClose={handleClose}
            title="HTTP Request"
            icon="🌐"
            readOnly={readOnly}
            isTesting={false}
            testButtons={testButtons}
        >
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
                        <>
                            {inputViewMode === 'schema' && (
                                <TestResultViewer
                                    data={inputData}
                                    viewMode="schema"
                                    collapsedPaths={collapsedPaths}
                                    onToggleCollapse={togglePathCollapse}
                                    showViewModeToggle={false}
                                    emptyState={null}
                                />
                            )}
                            
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
                                                    const variablePath = buildVariablePath(nodeName, key);
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
                            
                            {inputViewMode === 'json' && (
                                <TestResultViewer
                                    data={inputData}
                                    viewMode="json"
                                    collapsedPaths={collapsedPaths}
                                    onToggleCollapse={togglePathCollapse}
                                    showViewModeToggle={false}
                                    emptyState={null}
                                />
                            )}
                        </>
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
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
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
                                    disabled={readOnly}
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
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                            disabled={readOnly}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        {!readOnly && (
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
                                        )}
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
                                        disabled={readOnly}
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
                                            disabled={readOnly}
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
                                                disabled={readOnly}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <ExpandableTextarea
                                                value={param.value}
                                                onChange={(newValue) => updateParam('queryParams', index, 'value', newValue)}
                                                inputData={inputData}
                                                rows={1}
                                                placeholder="Value"
                                                disabled={readOnly}
                                            />
                                        </div>
                                        {!readOnly && (
                                            <button
                                                onClick={() => removeParam('queryParams', index)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {config.queryParams.length > 0 && !readOnly && (
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
                                            disabled={readOnly}
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
                                                disabled={readOnly}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <ExpandableTextarea
                                                value={header.value}
                                                onChange={(newValue) => updateParam('headers', index, 'value', newValue)}
                                                inputData={inputData}
                                                rows={1}
                                                placeholder="Value"
                                                disabled={readOnly}
                                            />
                                        </div>
                                        {!readOnly && (
                                            <button
                                                onClick={() => removeParam('headers', index)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {config.headers.length > 0 && !readOnly && (
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
                                    disabled={readOnly}
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
                                                disabled={readOnly}
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
                                                    disabled={readOnly}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                        disabled={readOnly}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                                        disabled={readOnly}
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
                                                                        disabled={readOnly}
                                                                    />
                                                                </div>
                                                                {!readOnly && (
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
                                                                )}
                                                            </div>
                                                        ))}
                                                        {!readOnly && (
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
                                                        )}
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
                                                        disabled={readOnly}
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
                                {displayOutput && (
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
                                {/* Test/Stop Button */}
                                {onTest && !readOnly && (
                                    <>
                                        {isTesting ? (
                                            <button
                                                onClick={handleStopTest}
                                                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded text-sm font-medium"
                                            >
                                                Stop step
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleTest}
                                                disabled={!config.url}
                                                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                                            >
                                                Test step
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                    <p className="text-center">Testing request...</p>
                                </div>
                            ) : displayOutput ? (
                                <>
                                    {outputViewMode === 'schema' && (
                                        <div className="bg-white p-3 rounded-lg border border-gray-200">
                                            <JSONViewer
                                                data={displayOutput}
                                                prefix="output"
                                                collapsedPaths={collapsedPaths}
                                                onToggleCollapse={togglePathCollapse}
                                            />
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
                                                    {Object.entries(displayOutput || {}).map(([key, value]) => {
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
                                            {JSON.stringify(displayOutput, null, 2)}
                                        </pre>
                                    )}
                                </>
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

            {/* Credential Modal */}
            <CredentialModal
                isOpen={showCredentialModal}
                onClose={() => setShowCredentialModal(false)}
                onSave={handleCredentialSaved}
                credentialType={selectedCredentialType}
            />
        </ConfigModalLayout>
    );
}

export default HttpRequestConfigModal;

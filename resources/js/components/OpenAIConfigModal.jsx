import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import ResultDisplay from './ResultDisplay';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';

function OpenAIConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        model: 'gpt-4o',
        systemMessageEnabled: false,
        systemMessage: '',
        messages: [
            { role: 'user', content: '' }
        ],
        credentialId: null,
        temperature: 0.7,
        top_p: 1,
        max_tokens: 512,
        presence_penalty: 0,
        frequency_penalty: 0,
        stop: [],
        logprobs: false,
        top_logprobs: null,
        response_format: { type: 'text' },
        tools: [],
        tool_choice: 'auto',
        stream: false,
        metadata: {},
        advancedOptions: {},
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');
    const [models, setModels] = useState([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    useEffect(() => {
        if (node?.data?.config) {
            setConfig(prev => ({
                ...prev,
                ...node.data.config,
            }));
        }
        fetchCredentials();
    }, [node]);

    useEffect(() => {
        if (config.credentialId) {
            fetchOpenAIModels();
        } else {
            setModels([]);
        }
    }, [config.credentialId]);

    const fetchCredentials = async () => {
        try {
            const response = await axios.get('/credentials', { params: { type: 'openai' } });
            setCredentials(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching credentials:', error);
            setCredentials([]);
        }
    };

    const fetchOpenAIModels = async () => {
        setLoadingModels(true);
        try {
            const response = await axios.post('/openai/get-models', {
                credentialId: config.credentialId
            });
            
            if (response.data && Array.isArray(response.data.models)) {
                const modelList = response.data.models
                    .filter(m => m.id && !m.id.includes('search') && !m.id.includes('similarity') && !m.id.includes('edit') && !m.id.includes('audio'))
                    .map(m => ({
                        value: m.id,
                        label: m.id
                    }));
                setModels(modelList);
                
                if (modelList.length > 0 && !modelList.find(m => m.value === config.model)) {
                    setConfig({ ...config, model: modelList[0].value });
                }
            }
        } catch (error) {
            console.error('Error fetching OpenAI models:', error);
            setModels([
                { value: 'gpt-4o', label: 'GPT-4o' },
                { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
                { value: 'gpt-4', label: 'GPT-4' },
                { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
            ]);
        } finally {
            setLoadingModels(false);
        }
    };

    const handleCredentialSaved = (credential) => {
        fetchCredentials();
        setConfig({ ...config, credentialId: credential.id });
        setShowCredentialModal(false);
    };

    const addMessagePair = () => {
        const newMessages = [...config.messages];
        const lastRole = newMessages[newMessages.length - 1]?.role;
        
        if (lastRole === 'user') {
            newMessages.push({ role: 'assistant', content: '' });
        } else {
            newMessages.push({ role: 'user', content: '' });
        }
        
        setConfig({ ...config, messages: newMessages });
    };

    const updateMessage = (index, content) => {
        const newMessages = [...config.messages];
        newMessages[index].content = content;
        setConfig({ ...config, messages: newMessages });
    };

    const deleteMessage = (index) => {
        const newMessages = config.messages.filter((_, i) => i !== index);
        if (newMessages.length === 0) {
            newMessages.push({ role: 'user', content: '' });
        }
        setConfig({ ...config, messages: newMessages });
    };

    const addStopSequence = () => {
        setConfig({
            ...config,
            stop: [...(config.stop || []), '']
        });
    };

    const updateStopSequence = (index, value) => {
        const newStop = [...(config.stop || [])];
        newStop[index] = value;
        setConfig({ ...config, stop: newStop });
    };

    const removeStopSequence = (index) => {
        const newStop = config.stop.filter((_, i) => i !== index);
        setConfig({ ...config, stop: newStop });
    };

    const addTool = () => {
        const newTools = [...(config.tools || []), {
            type: 'function',
            function: {
                name: '',
                description: '',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        }];
        setConfig({ ...config, tools: newTools });
    };

    const updateTool = (index, field, value) => {
        const newTools = [...(config.tools || [])];
        if (field === 'name' || field === 'description') {
            newTools[index].function[field] = value;
        } else if (field === 'parameters') {
            try {
                newTools[index].function.parameters = JSON.parse(value);
            } catch (e) {
                // Invalid JSON, keep as is
            }
        }
        setConfig({ ...config, tools: newTools });
    };

    const removeTool = (index) => {
        const newTools = config.tools.filter((_, i) => i !== index);
        setConfig({ ...config, tools: newTools });
    };

    const addMetadataField = () => {
        setConfig({
            ...config,
            metadata: { ...(config.metadata || {}), '': '' }
        });
    };

    const updateMetadataField = (key, newKey, value) => {
        const newMetadata = { ...(config.metadata || {}) };
        if (key !== newKey) {
            delete newMetadata[key];
        }
        newMetadata[newKey] = value;
        setConfig({ ...config, metadata: newMetadata });
    };

    const removeMetadataField = (key) => {
        const newMetadata = { ...(config.metadata || {}) };
        delete newMetadata[key];
        setConfig({ ...config, metadata: newMetadata });
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

    const getDisplayOutput = () => {
        if (testResults) return testResults;
        if (outputData) return outputData;
        return null;
    };

    const truncateText = (text, maxLength = 150) => {
        if (typeof text !== 'string') return text;
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
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
                        <span className="text-xs font-medium text-gray-700">
                            {currentPrefix || 'Array'} ({obj.length} items)
                        </span>
                        <span className="text-xs text-gray-500">{typeInfo}</span>
                    </div>
                    {!isCollapsed && obj.map((item, index) => {
                        const itemPath = buildArrayPath(currentPrefix || prefix, index);
                        return (
                            <div key={index} className="border-l-2 border-gray-200 pl-3">
                                <div className="text-xs text-gray-500 mb-1">[{index}]</div>
                                {renderDraggableJSON(item, itemPath, indent + 1)}
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            const typeInfo = getTypeInfo(obj);
            const objectPath = currentPrefix || prefix;
            const objectCollapsed = collapsedPaths.has(objectPath);

            if (keys.length === 0) {
                return <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">empty object</span>;
            }

            return (
                <div className="space-y-1">
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
                        onClick={() => toggleCollapse(objectPath)}
                    >
                        <span className="text-gray-500 text-xs">
                            {objectCollapsed ? '▶' : '▼'}
                        </span>
                        <span className="text-xs font-medium text-gray-700">
                            {currentPrefix || 'Object'} ({keys.length} keys)
                        </span>
                        <span className="text-xs text-gray-500">{typeInfo}</span>
                    </div>
                    {!objectCollapsed && keys.map(key => {
                        const valuePath = buildVariablePath(objectPath, key);
                        return (
                            <div key={key} className="border-l-2 border-gray-200 pl-3 space-y-1">
                                <div className="flex items-center gap-2 group">
                                    <span className="text-xs font-medium text-blue-600">{key}:</span>
                                    <button
                                        onClick={() => {
                                            const fullPath = valuePath;
                                            navigator.clipboard.writeText(`{{${fullPath}}}`);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-xs text-blue-600 hover:text-blue-800"
                                        title="Copy variable path"
                                    >
                                        📋
                                    </button>
                                </div>
                                {renderDraggableJSON(obj[key], valuePath, indent + 1)}
                            </div>
                        );
                    })}
                </div>
            );
        }

        return (
            <div className="flex items-center gap-2 py-1">
                <span className="text-xs text-gray-700">{String(obj)}</span>
                <button
                    onClick={() => {
                        const fullPath = currentPrefix || prefix;
                        navigator.clipboard.writeText(`{{${fullPath}}}`);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-xs text-blue-600 hover:text-blue-800"
                    title="Copy variable path"
                >
                    📋
                </button>
            </div>
        );
    };

    const getTypeInfo = (obj) => {
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '(empty array)';
            const firstType = typeof obj[0];
            return `(${firstType}[])`;
        }
        if (typeof obj === 'object' && obj !== null) {
            return '(object)';
        }
        return `(${typeof obj})`;
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">OpenAI Configuration</h2>
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
                    <div className="w-1/3 border-r border-gray-200 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900">INPUT</h3>
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
                                    {inputViewMode === 'schema' && Object.entries(inputData).map(([nodeName, data]) => (
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
                                    ))}
                                    
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
                                        Kéo thả biến từ đây vào messages
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Configuration */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <button className="px-4 py-1.5 bg-orange-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {/* Credential Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    OpenAI API Credential *
                                </label>
                                <div className="flex space-x-2">
                                    <select
                                        value={config.credentialId || ''}
                                        onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
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
                                        title="Create new credential"
                                    >
                                        + New
                                    </button>
                                </div>
                                {!config.credentialId && (
                                    <p className="mt-1 text-xs text-orange-600">
                                        ⚠️ Nhấn "+ New" để tạo credential OpenAI API
                                    </p>
                                )}
                            </div>

                            {/* Model Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Model *
                                </label>
                                <select
                                    value={config.model}
                                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                                    disabled={loadingModels || models.length === 0}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50"
                                >
                                    {loadingModels && <option>Loading models...</option>}
                                    {!loadingModels && models.length === 0 && <option>Select credential first</option>}
                                    {!loadingModels && models.map(model => (
                                        <option key={model.value} value={model.value}>{model.label}</option>
                                    ))}
                                </select>
                                {loadingModels && (
                                    <p className="text-xs text-blue-600 mt-1">
                                        🔄 Đang tải danh sách models từ OpenAI API...
                                    </p>
                                )}
                            </div>

                            {/* System Message */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Enable System Message
                                    </label>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.systemMessageEnabled}
                                            onChange={(e) => setConfig({ ...config, systemMessageEnabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                    </label>
                                </div>
                                {config.systemMessageEnabled && (
                                    <ExpandableTextarea
                                        value={config.systemMessage}
                                        onChange={(newValue) => setConfig({ ...config, systemMessage: newValue })}
                                        placeholder="You are a helpful assistant..."
                                        rows={4}
                                        label="System Message"
                                        hint="💡 Kéo thả biến từ INPUT panel hoặc dùng cú pháp {{variable}}"
                                        inputData={inputData}
                                    />
                                )}
                            </div>

                            {/* Messages */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Messages
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addMessagePair}
                                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                                    >
                                        + Add Message
                                    </button>
                                </div>
                                {config.messages.map((msg, index) => (
                                    <div key={index} className="mb-3 p-3 border border-gray-200 rounded">
                                        <div className="flex items-center justify-between mb-2">
                                            <select
                                                value={msg.role}
                                                onChange={(e) => {
                                                    const newMessages = [...config.messages];
                                                    newMessages[index].role = e.target.value;
                                                    setConfig({ ...config, messages: newMessages });
                                                }}
                                                className="text-xs px-2 py-1 border border-gray-300 rounded bg-white text-gray-900"
                                            >
                                                <option value="system">System</option>
                                                <option value="user">User</option>
                                                <option value="assistant">Assistant</option>
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => deleteMessage(index)}
                                                className="text-xs text-red-600 hover:text-red-800"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                        <ExpandableTextarea
                                            value={msg.content}
                                            onChange={(newValue) => updateMessage(index, newValue)}
                                            placeholder={`Enter ${msg.role} message...`}
                                            rows={3}
                                            inputData={inputData}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Basic Parameters */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Temperature
                                    </label>
                                    <input
                                        type="number"
                                        value={config.temperature}
                                        onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0.7 })}
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Top P
                                    </label>
                                    <input
                                        type="number"
                                        value={config.top_p}
                                        onChange={(e) => setConfig({ ...config, top_p: parseFloat(e.target.value) || 1 })}
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Max Tokens
                                    </label>
                                    <input
                                        type="number"
                                        value={config.max_tokens}
                                        onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 512 })}
                                        min="1"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Presence Penalty
                                    </label>
                                    <input
                                        type="number"
                                        value={config.presence_penalty}
                                        onChange={(e) => setConfig({ ...config, presence_penalty: parseFloat(e.target.value) || 0 })}
                                        min="-2"
                                        max="2"
                                        step="0.1"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Frequency Penalty
                                    </label>
                                    <input
                                        type="number"
                                        value={config.frequency_penalty}
                                        onChange={(e) => setConfig({ ...config, frequency_penalty: parseFloat(e.target.value) || 0 })}
                                        min="-2"
                                        max="2"
                                        step="0.1"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    />
                                </div>
                            </div>

                            {/* Stop Sequences */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Stop Sequences
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addStopSequence}
                                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                                    >
                                        + Add
                                    </button>
                                </div>
                                {config.stop && config.stop.map((stop, index) => (
                                    <div key={index} className="flex items-center gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={stop}
                                            onChange={(e) => updateStopSequence(index, e.target.value)}
                                            placeholder="Stop sequence"
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeStopSequence(index)}
                                            className="text-xs text-red-600 hover:text-red-800"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Logprobs */}
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700">
                                    Enable Logprobs
                                </label>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.logprobs}
                                        onChange={(e) => setConfig({ ...config, logprobs: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                </label>
                            </div>

                            {config.logprobs && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Top Logprobs
                                    </label>
                                    <input
                                        type="number"
                                        value={config.top_logprobs || ''}
                                        onChange={(e) => setConfig({ ...config, top_logprobs: e.target.value ? parseInt(e.target.value) : null })}
                                        min="0"
                                        max="20"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        placeholder="0-20"
                                    />
                                </div>
                            )}

                            {/* Response Format */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Response Format
                                </label>
                                <select
                                    value={config.response_format?.type || 'text'}
                                    onChange={(e) => setConfig({ ...config, response_format: { type: e.target.value } })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                >
                                    <option value="text">Text</option>
                                    <option value="json_object">JSON Object</option>
                                </select>
                            </div>

                            {/* Tools */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Tools (Functions)
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addTool}
                                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                                    >
                                        + Add Tool
                                    </button>
                                </div>
                                {config.tools && config.tools.map((tool, index) => (
                                    <div key={index} className="mb-3 p-3 border border-gray-200 rounded">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-gray-700">Tool {index + 1}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeTool(index)}
                                                className="text-xs text-red-600 hover:text-red-800"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <input
                                                type="text"
                                                value={tool.function?.name || ''}
                                                onChange={(e) => updateTool(index, 'name', e.target.value)}
                                                placeholder="Function name"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
                                            />
                                            <textarea
                                                value={tool.function?.description || ''}
                                                onChange={(e) => updateTool(index, 'description', e.target.value)}
                                                placeholder="Function description"
                                                rows={2}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
                                            />
                                            <textarea
                                                value={JSON.stringify(tool.function?.parameters || {}, null, 2)}
                                                onChange={(e) => updateTool(index, 'parameters', e.target.value)}
                                                placeholder='{"type": "object", "properties": {}, "required": []}'
                                                rows={4}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Tool Choice */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tool Choice
                                </label>
                                <select
                                    value={config.tool_choice || 'auto'}
                                    onChange={(e) => setConfig({ ...config, tool_choice: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                >
                                    <option value="auto">Auto</option>
                                    <option value="none">None</option>
                                    <option value="required">Required</option>
                                </select>
                            </div>

                            {/* Stream */}
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700">
                                    Enable Streaming
                                </label>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.stream}
                                        onChange={(e) => setConfig({ ...config, stream: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                </label>
                            </div>

                            {/* Metadata */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Metadata
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addMetadataField}
                                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                                    >
                                        + Add Field
                                    </button>
                                </div>
                                {config.metadata && Object.entries(config.metadata).map(([key, value], index) => (
                                    <div key={index} className="flex items-center gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={key}
                                            onChange={(e) => updateMetadataField(key, e.target.value, value)}
                                            placeholder="Key"
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        />
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={(e) => updateMetadataField(key, key, e.target.value)}
                                            placeholder="Value"
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeMetadataField(key)}
                                            className="text-xs text-red-600 hover:text-red-800"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900">OUTPUT</h3>
                                <div className="flex items-center gap-2">
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
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200">
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
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4"></div>
                                    <p className="text-center">Đang gọi OpenAI API...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <div className="relative">
                                    {outputViewMode === 'schema' && (
                                        <div className="bg-white p-3 rounded-lg border border-gray-200">
                                            {renderDraggableJSON(getDisplayOutput(), 'output')}
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
                                        Nhấn "Test step" để xem kết quả từ OpenAI
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
                credentialType="openai"
                lockedType={true}
            />
        </div>
    );
}

export default OpenAIConfigModal;


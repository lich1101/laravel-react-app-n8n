import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import ResultDisplay from './ResultDisplay';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';

function GeminiConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    const truncateText = (text, maxLength = 150) => {
        if (typeof text !== 'string') return text;
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

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

    const renderDraggableJSON = (obj, prefix = '', depth = 0) => {
        const currentPrefix = normalizeVariablePrefix(prefix, depth === 0);

        if (obj === null || obj === undefined) {
            return <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">null</span>;
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
                                        {renderDraggableJSON(item, itemPath, depth + 1)}
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
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500">{keys.length} keys</span>
                    </div>
                    {!objectCollapsed && (
                        <div className="ml-4 space-y-1">
                            {keys.map(key => {
                                const value = obj[key];
                                const variablePath = buildVariablePath(objectPath, key);
                                const isPrimitive = value === null || value === undefined || (typeof value !== 'object' && !Array.isArray(value));
                                const childCollapsed = collapsedPaths.has(variablePath);

                                return (
                                    <div key={key} className="group">
                                        <div className="flex items-center gap-2">
                                            {!isPrimitive && (
                                                <span 
                                                    className="text-gray-500 text-xs cursor-pointer"
                                                    onClick={() => toggleCollapse(variablePath)}
                                                >
                                                    {childCollapsed ? '▶' : '▼'}
                                                </span>
                                            )}
                                            <span className="text-xs font-semibold text-gray-700">{key}:</span>
                                            {isPrimitive ? (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.effectAllowed = 'copy';
                                                        e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                                    }}
                                                    className="cursor-move text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors inline-flex items-center gap-1"
                                                >
                                                    {typeof value === 'string' 
                                                        ? `"${truncateText(value)}"`
                                                        : String(value)
                                                    }
                                                </div>
                                            ) : (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.effectAllowed = 'copy';
                                                    }}
                                                    className="cursor-move text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors inline-flex items-center gap-1"
                                                >
                                                    {typeof value === 'string' 
                                                        ? `"${truncateText(value)}"`
                                                        : String(value)
                                                    }
                                                </div>
                                            )}

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

                                        {!isPrimitive && !childCollapsed && (
                                            <div className="ml-6 mt-1 border-l-2 border-gray-200 pl-3">
                                                {renderDraggableJSON(value, variablePath, depth + 1)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };
    const [config, setConfig] = useState({
        model: 'gemini-2.0-flash',
        systemMessageEnabled: false,
        systemMessage: '',
        messages: [
            { role: 'user', content: '' }
        ],
        credentialId: null,
        timeout: 60,
        functions: [],
        functionCall: 'auto',
        advancedOptions: {},
    });

    const availableOptions = [
        { key: 'max_tokens', label: 'Maximum Tokens', type: 'number', min: 1, max: 100000, step: 1, default: 8192, description: 'Giới hạn độ dài response' },
        { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, default: 0.7, description: 'Độ sáng tạo của câu trả lời (0-2)' },
        { key: 'top_p', label: 'Top P', type: 'number', min: 0, max: 1, step: 0.1, default: 1, description: 'Điều chỉnh độ tập trung câu trả lời (0-1)' },
        { key: 'stream', label: 'Enable Streaming', type: 'boolean', default: false, description: 'Stream response từ API' },
        { key: 'timeout', label: 'Request Timeout (seconds)', type: 'number', min: 10, max: 300, step: 10, default: 60, description: 'Thời gian chờ tối đa cho API response' },
    ];

    const [selectedOption, setSelectedOption] = useState('');

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');
    const [models, setModels] = useState([]);
    const [loadingModels, setLoadingModels] = useState(false);

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
            fetchGeminiModels();
        } else {
            setModels([]);
        }
    }, [config.credentialId]);

    const fetchCredentials = async () => {
        try {
            const response = await axios.get('/credentials', { params: { type: 'gemini' } });
            setCredentials(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching credentials:', error);
            setCredentials([]);
        }
    };

    const fetchGeminiModels = async () => {
        if (!config.credentialId) {
            setModels([]);
            return;
        }

        setLoadingModels(true);
        try {
            const response = await axios.post('/gemini/get-models', {
                credentialId: config.credentialId
            });
            
            // Gemini API returns { models: [...] } format
            let modelArray = null;
            if (response.data && Array.isArray(response.data.models)) {
                modelArray = response.data.models;
            } else if (response.data && Array.isArray(response.data.data)) {
                // Fallback for different response format
                modelArray = response.data.data;
            } else if (Array.isArray(response.data)) {
                // Direct array response
                modelArray = response.data;
            }

            if (modelArray && modelArray.length > 0) {
                // Transform API response to dropdown format
                const modelList = modelArray
                    .filter(m => m.name && m.supportedGenerationMethods?.includes('generateContent'))
                    .map(m => ({
                        value: m.name.replace('models/', ''),
                        label: m.displayName || m.name.replace('models/', '')
                    }));
                setModels(modelList);
                
                // Auto-select first model if current model not in list
                if (modelList.length > 0 && !modelList.find(m => m.value === config.model)) {
                    setConfig({ ...config, model: modelList[0].value });
                }
            } else {
                console.warn('No models found in response:', response.data);
                // Fallback to default models
                setModels([
                    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp' },
                    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
                    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
                ]);
            }
        } catch (error) {
            console.error('Error fetching Gemini models:', error);
            const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Unknown error';
            console.error('Error details:', errorMessage);
            // Fallback to default models
            setModels([
                { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp' },
                { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
                { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
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

    const addFunction = () => {
        const newFunctions = [...config.functions, {
            name: '',
            description: '',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }];
        setConfig({ ...config, functions: newFunctions });
    };

    const updateFunction = (index, field, value) => {
        const newFunctions = [...config.functions];
        if (field === 'name' || field === 'description') {
            newFunctions[index][field] = value;
        } else if (field === 'parameters') {
            newFunctions[index].parameters = value;
        }
        setConfig({ ...config, functions: newFunctions });
    };

    const deleteFunction = (index) => {
        const newFunctions = config.functions.filter((_, i) => i !== index);
        setConfig({ ...config, functions: newFunctions });
    };

    const handleAddOption = (optionKey) => {
        if (!optionKey) return;
        
        const option = availableOptions.find(opt => opt.key === optionKey);
        if (!option) return;

        const newOptions = { ...config.advancedOptions };
        if (newOptions[optionKey] === undefined) {
            newOptions[optionKey] = option.default;
            setConfig({ ...config, advancedOptions: newOptions });
        }
        setSelectedOption('');
    };

    const removeAdvancedOption = (key) => {
        const newOptions = { ...config.advancedOptions };
        delete newOptions[key];
        setConfig({ ...config, advancedOptions: newOptions });
    };

    const updateAdvancedOption = (key, value) => {
        const newOptions = { ...config.advancedOptions };
        newOptions[key] = value;
        setConfig({ ...config, advancedOptions: newOptions });
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
                    error: error.message || 'An error occurred while testing Gemini AI',
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

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl w-[95%] h-[90%] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-purple-100 rounded flex items-center justify-center">
                                <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 flex items-center gap-2" onClick={() => { if (onRename) onRename(); }} title="Click để đổi tên node">
                                    {node?.data?.customName || 'Gemini AI'}
                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </h2>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={handleTest}
                                disabled={isTesting || !config.credentialId}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                            >
                                <span>▲</span>
                                <span>{isTesting ? 'Testing...' : 'Test step'}</span>
                            </button>
                            <button
                                onClick={handleClose}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Body - 3 columns layout */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left Panel - INPUT */}
                        <div className="w-1/3 border-r border-gray-200 flex flex-col">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <h3 className="font-semibold text-gray-900">INPUT</h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto bg-white">
                                {inputData && Object.keys(inputData).length > 0 ? (
                                    <div className="space-y-4">
                                        {Object.entries(inputData).map(([nodeName, data]) => (
                                            <div key={nodeName}>
                                                <div className="text-xs font-semibold text-gray-700 mb-2">{nodeName}:</div>
                                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                                    {renderDraggableJSON(data, nodeName)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                        </svg>
                                        <p className="text-center text-sm">Connect this node to receive input data</p>
                                        <p className="text-center text-xs mt-2">Kéo thả biến từ đây vào messages</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Center Panel - Configuration */}
                        <div className="w-1/3 flex flex-col">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                                    Parameters
                                </button>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                                {/* Credential Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Gemini API Credential *
                                    </label>
                                    <div className="flex space-x-2">
                                        <select
                                            value={config.credentialId || ''}
                                            onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        >
                                            <option value="">Select Credential...</option>
                                            {credentials.map(cred => (
                                                <option key={cred.id} value={cred.id}>{cred.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setShowCredentialModal(true)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                        >
                                            + New
                                        </button>
                                    </div>
                                    {!config.credentialId && (
                                        <p className="mt-1 text-xs text-orange-600">
                                            ⚠️ Tạo credential kiểu "Custom Header" với Header Name = "Authorization" và Header Value = "Bearer YOUR_GEMINI_API_KEY"
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
                                            🔄 Đang tải danh sách models từ Gemini API...
                                        </p>
                                    )}
                                </div>

                                {/* System Message */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-700">
                                            System Message
                                        </label>
                                        <button
                                            onClick={() => setConfig({ ...config, systemMessageEnabled: !config.systemMessageEnabled })}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                                config.systemMessageEnabled ? 'bg-blue-500' : 'bg-surface-muted'
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                    config.systemMessageEnabled ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                    {config.systemMessageEnabled && (
                                        <ExpandableTextarea
                                            value={config.systemMessage}
                                            onChange={(value) => setConfig({ ...config, systemMessage: value })}
                                            placeholder="Enter system message..."
                                            inputData={inputData}
                                            className="w-full px-3 py-2 border border-subtle rounded-xl bg-surface text-secondary"
                                            rows={3}
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
                                            className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                                        >
                                            + Add Message
                                        </button>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {config.messages.map((message, index) => (
                                            <div key={index} className="border border-subtle rounded-2xl p-3 bg-surface-elevated shadow-card">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center space-x-2">
                                                        <span className={`text-xs px-2 py-1 rounded font-semibold ${
                                                            message.role === 'user' 
                                                                ? 'bg-primary-soft text-primary'
                                                                : 'bg-orange-100 text-orange-700'
                                                        }`}>
                                                            {message.role === 'user' ? '👤 User' : '🤖 Assistant'}
                                                        </span>
                                                        <span className="text-xs text-muted">
                                                            Message {index + 1}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteMessage(index)}
                                                        className="text-rose-600 hover:text-rose-500 text-xs"
                                                        title="Delete message"
                                                    >
                                                        × Delete
                                                    </button>
                                                </div>
                                                <ExpandableTextarea
                                                    value={message.content}
                                                    onChange={(value) => updateMessage(index, value)}
                                                    placeholder={message.role === 'user' 
                                                        ? "Enter user message or use {{variable}} syntax" 
                                                        : "Enter assistant's previous response or use {{variable}} syntax"
                                                    }
                                                    inputData={inputData}
                                                    className="w-full px-3 py-2 border border-subtle rounded-xl bg-surface text-secondary text-sm"
                                                    rows={3}
                                                    hint="💡 Kéo thả biến từ INPUT panel"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <p className="text-xs text-muted mt-2">
                                        💡 Messages sẽ tự động xen kẽ: User → Assistant → User → Assistant...
                                    </p>
                                </div>

                                {/* Functions */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-700">
                                            Functions (Optional)
                                        </label>
                                        <button
                                            onClick={addFunction}
                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                                        >
                                            + Add Function
                                        </button>
                                    </div>
                                    {config.functions.length > 0 && (
                                        <div className="space-y-3 mb-3">
                                            {config.functions.map((func, index) => (
                                                <div key={index} className="border border-gray-200 rounded p-3 bg-gray-50">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-medium text-gray-700">
                                                            Function {index + 1}
                                                        </span>
                                                        <button
                                                            onClick={() => deleteFunction(index)}
                                                            className="text-red-600 hover:text-red-700 text-xs"
                                                        >
                                                            × Delete
                                                        </button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <ExpandableTextarea
                                                            value={func.name || ''}
                                                            onChange={(value) => updateFunction(index, 'name', value)}
                                                            placeholder="Function name (e.g., get_weather)"
                                                            inputData={inputData}
                                                            rows={1}
                                                        />
                                                        <ExpandableTextarea
                                                            value={func.description || ''}
                                                            onChange={(value) => updateFunction(index, 'description', value)}
                                                            placeholder="Function description (e.g., Get the current weather)"
                                                            inputData={inputData}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
                                                            rows={2}
                                                        />
                                                        <ExpandableTextarea
                                                            value={JSON.stringify(func.parameters || {}, null, 2)}
                                                            onChange={(value) => {
                                                                try {
                                                                    const params = JSON.parse(value);
                                                                    updateFunction(index, 'parameters', params);
                                                                } catch (err) {
                                                                    // Invalid JSON, keep as is
                                                                }
                                                            }}
                                                            placeholder='{"type": "object", "properties": {"location": {"type": "string"}}, "required": ["location"]}'
                                                            inputData={inputData}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm font-mono"
                                                            rows={4}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Function Call */}
                                {config.functions.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Function Call
                                        </label>
                                        <ExpandableTextarea
                                            value={config.functionCall || ''}
                                            onChange={(newValue) => setConfig({ ...config, functionCall: newValue })}
                                            rows={5}
                                            className="w-full border border-gray-200 rounded-md bg-white text-gray-900 text-sm font-mono"
                                            placeholder='{"name": "setReminders", "arguments": {"text": "Take some time to schedule appointments"}}'
                                            inputData={inputData}
                                        />
                                    </div>
                                )}

                                {/* Advanced Options */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Advanced Options
                                    </label>
                                    <select
                                        value={selectedOption}
                                        onChange={(e) => {
                                            handleAddOption(e.target.value);
                                        }}
                                        className="inline-block px-3 py-2 mb-3 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
                                    >
                                        <option value="">+ Add Option</option>
                                        {availableOptions.filter(opt => config.advancedOptions[opt.key] === undefined).map(option => (
                                            <option key={option.key} value={option.key}>{option.label}</option>
                                        ))}
                                    </select>
                                    
                                    {Object.keys(config.advancedOptions).length === 0 && (
                                        <p className="text-xs text-gray-500">
                                            Chọn option từ dropdown phía trên để thêm vào configuration
                                        </p>
                                    )}

                                    {Object.keys(config.advancedOptions).length > 0 && (
                                        <div className="space-y-2 mt-2">
                                            {Object.entries(config.advancedOptions).map(([key, value]) => {
                                                const option = availableOptions.find(opt => opt.key === key);
                                                if (!option) return null;

                                                return (
                                                    <div key={key} className="border border-gray-200 rounded p-3 bg-gray-50">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="text-sm font-medium text-gray-700">
                                                                {option.label}
                                                            </label>
                                                            <button
                                                                onClick={() => removeAdvancedOption(key)}
                                                                className="text-red-600 hover:text-red-700 text-xs"
                                                            >
                                                                × Remove
                                                            </button>
                                                        </div>
                                                        {option.type === 'boolean' ? (
                                                            <label className="flex items-center space-x-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={value}
                                                                    onChange={(e) => updateAdvancedOption(key, e.target.checked)}
                                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                />
                                                                <span className="text-sm text-gray-600">
                                                                    {option.description}
                                                                </span>
                                                            </label>
                                                        ) : (
                                                            <>
                                                                <ExpandableTextarea
                                                                    value={value !== undefined ? String(value) : ''}
                                                                    onChange={(newValue) => {
                                                                        const parsed = option.step < 1
                                                                            ? parseFloat(newValue)
                                                                            : parseInt(newValue, 10);
                                                                        updateAdvancedOption(key, Number.isNaN(parsed) ? option.default : parsed);
                                                                    }}
                                                                    rows={1}
                                                                    placeholder={String(option.default)}
                                                                />
                                                                <p className="text-xs text-gray-500 mt-1">
                                                                    {option.description}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Panel - OUTPUT */}
                        <div className="w-1/3 border-l border-gray-200 flex flex-col">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <h3 className="font-semibold text-gray-900">
                                    OUTPUT
                                    {outputData && (
                                        <span className="ml-2 text-sm font-normal text-gray-500">
                                            {Array.isArray(outputData) ? `${outputData.length} items` : '1 item'}
                                        </span>
                                    )}
                                </h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto bg-white">
                                {outputData ? (
                                    <ResultDisplay data={outputData} />
                                ) : (
                                    <div className="text-center text-gray-500 py-8">
                                        <p>Click "Test step" to see output</p>
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
                credentialType="gemini"
                lockedType={true}
            />
        </div>
    );
}

export default GeminiConfigModal;


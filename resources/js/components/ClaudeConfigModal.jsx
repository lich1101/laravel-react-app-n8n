import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import ResultDisplay from './ResultDisplay';

function ClaudeConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        model: 'claude-3-5-sonnet-20241022',
        systemMessageEnabled: false,
        systemMessage: '',
        messages: [
            { role: 'user', content: '' }
        ],
        credentialId: null,
        advancedOptions: {},
    });

    const availableOptions = [
        { key: 'max_tokens', label: 'Maximum Tokens', type: 'number', min: 1, max: 100000, step: 1, default: 1024, description: 'Giới hạn độ dài response' },
        { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, default: 0.7, description: 'Độ sáng tạo của câu trả lời (0-2)' },
        { key: 'top_k', label: 'Top K', type: 'number', min: 1, max: 100, step: 1, default: 40, description: 'Top K sampling' },
        { key: 'top_p', label: 'Top P', type: 'number', min: 0, max: 1, step: 0.1, default: 0.9, description: 'Top P sampling' },
        { key: 'timeout', label: 'Request Timeout (seconds)', type: 'number', min: 10, max: 300, step: 10, default: 60, description: 'Thời gian chờ tối đa cho API response' },
    ];

    const models = [
        // Claude 3.5 - Latest and most capable
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest)' },
        { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (June 2024)' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        
        // Claude 3 Family
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
        
        // Legacy models
        { value: 'claude-2.1', label: 'Claude 2.1' },
        { value: 'claude-2.0', label: 'Claude 2.0' },
        { value: 'claude-instant-1.2', label: 'Claude Instant 1.2' },
    ];

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
        fetchCredentials();
    }, [node]);

    const fetchCredentials = async () => {
        try {
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

    // REMOVED: autoEscape - không escape ở UI nữa
    // Escape sẽ được thực hiện ở backend khi xử lý

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
        newMessages[index].content = content; // Không escape ở UI
        setConfig({ ...config, messages: newMessages });
    };

    const deleteMessage = (index) => {
        const newMessages = config.messages.filter((_, i) => i !== index);
        if (newMessages.length === 0) {
            newMessages.push({ role: 'user', content: '' });
        }
        setConfig({ ...config, messages: newMessages });
    };

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

    const updateAdvancedOption = (optionKey, value) => {
        setConfig({
            ...config,
            advancedOptions: {
                ...config.advancedOptions,
                [optionKey]: value
            }
        });
    };

    const removeAdvancedOption = (optionKey) => {
        const newOptions = { ...config.advancedOptions };
        delete newOptions[optionKey];
        setConfig({
            ...config,
            advancedOptions: newOptions
        });
    };

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
                        <span className="text-3xl">🤖</span>
                        <h2 
                            className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename) {
                                    onRename();
                                }
                            }}
                            title="Click để đổi tên node"
                        >
                            {node?.data?.customName || 'Claude AI'}
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
                                {inputData && Object.keys(inputData).length > 0 && (
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
                            {inputData && Object.keys(inputData).length > 0 ? (
                                <div className="space-y-4">
                                    {inputViewMode === 'schema' && Object.entries(inputData).map(([nodeName, data]) => (
                                        <div key={nodeName}>
                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                    {nodeName}
                                                </span>
                                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                                    {Object.keys(data || {}).length} fields
                                                </span>
                                            </div>
                                            <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                                {renderDraggableJSON(data, nodeName)}
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {inputViewMode === 'json' && Object.entries(inputData).map(([nodeName, data]) => (
                                        <div key={nodeName}>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                {nodeName}:
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
                            <button className="px-4 py-1.5 bg-orange-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {/* Credential Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Claude API Credential *
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
                                        title="Create new credential"
                                    >
                                        + New
                                    </button>
                                </div>
                                {!config.credentialId && (
                                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                        ⚠️ Tạo credential kiểu "Custom Header" với Header Name = "x-api-key" và Header Value = "YOUR_CLAUDE_API_KEY"
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

                            {/* System Message Toggle */}
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
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-600"></div>
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
                                                            : 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'
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
                                            <ExpandableTextarea
                                                value={message.content}
                                                onChange={(newValue) => updateMessage(index, newValue)}
                                                placeholder={
                                                    message.role === 'user' 
                                                        ? "Enter user message or use {{variable}} syntax"
                                                        : "Enter assistant's previous response or use {{variable}} syntax"
                                                }
                                                rows={4}
                                                label={`${message.role === 'user' ? 'User' : 'Assistant'} Message ${index + 1}`}
                                                hint="💡 Kéo thả biến từ INPUT panel"
                                                inputData={inputData}
                                            />
                                        </div>
                                    ))}
                                </div>
                                
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                                    ℹ️ Messages sẽ tự động xen kẽ: User → Assistant → User → Assistant...
                                </p>
                            </div>

                            {/* Advanced Options */}
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
                                                    e.target.value = '';
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
                            <div className="text-xs text-gray-500 dark:text-gray-400 italic bg-orange-50 dark:bg-orange-900/30 p-3 rounded border border-orange-200 dark:border-orange-700">
                                <strong>API Endpoint:</strong> https://api.anthropic.com/v1/messages
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">OUTPUT</h3>
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
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4"></div>
                                    <p className="text-center">Đang gọi Claude API...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <div className="relative">
                                    {outputViewMode === 'schema' && (
                                        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                            {renderDraggableJSON(getDisplayOutput(), 'output')}
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
                                        Nhấn "Test step" để xem kết quả từ Claude AI
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

export default ClaudeConfigModal;


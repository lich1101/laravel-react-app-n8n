import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import ResultDisplay from './ResultDisplay';

function GeminiConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
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
        stream: false,
        temperature: 0.7,
        topP: 1,
        advancedOptions: {},
    });

    const availableOptions = [
        { key: 'max_tokens', label: 'Maximum Tokens', type: 'number', min: 1, max: 100000, step: 1, default: 8192, description: 'Giới hạn độ dài response' },
        { key: 'timeout', label: 'Request Timeout (seconds)', type: 'number', min: 10, max: 300, step: 10, default: 60, description: 'Thời gian chờ tối đa cho API response' },
    ];

    const models = [
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-pro', label: 'Gemini Pro' },
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
            const response = await axios.get('/credentials');
            // Filter for custom or bearer types (Gemini uses Bearer token)
            const filtered = Array.isArray(response.data) 
                ? response.data.filter(c => c.type === 'custom' || c.type === 'bearer')
                : [];
            setCredentials(filtered);
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

    const toggleAdvancedOption = (option) => {
        const newOptions = { ...config.advancedOptions };
        if (newOptions[option.key] !== undefined) {
            delete newOptions[option.key];
        } else {
            newOptions[option.key] = option.default;
        }
        setConfig({ ...config, advancedOptions: newOptions });
    };

    const updateAdvancedOption = (option, value) => {
        const newOptions = { ...config.advancedOptions };
        newOptions[option.key] = value;
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
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95%] h-[90%] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded flex items-center justify-center">
                                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Gemini AI
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
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
                        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="font-semibold text-gray-900 dark:text-white">INPUT</h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto">
                                {inputData ? (
                                    <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded">
                                        {JSON.stringify(inputData, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                        <p>No input data available</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Center Panel - Configuration */}
                        <div className="w-1/3 flex flex-col">
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                                    Parameters
                                </button>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                                {/* Credential Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Gemini API Credential *
                                    </label>
                                    <div className="flex space-x-2">
                                        <select
                                            value={config.credentialId || ''}
                                            onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                                        <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                            ⚠️ Tạo credential kiểu "Custom Header" với Header Name = "Authorization" và Header Value = "Bearer YOUR_GEMINI_API_KEY"
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
                                            <option key={model.value} value={model.value}>{model.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* System Message */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                            System Message
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.systemMessageEnabled}
                                                onChange={(e) => setConfig({ ...config, systemMessageEnabled: e.target.checked })}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Enable</span>
                                        </label>
                                    </div>
                                    {config.systemMessageEnabled && (
                                        <ExpandableTextarea
                                            value={config.systemMessage}
                                            onChange={(value) => setConfig({ ...config, systemMessage: value })}
                                            placeholder="Enter system message..."
                                            inputData={inputData}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            rows={3}
                                        />
                                    )}
                                </div>

                                {/* Messages */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Messages
                                        </label>
                                        <button
                                            onClick={addMessagePair}
                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                                        >
                                            + Add Message
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {config.messages.map((message, index) => (
                                            <div key={index} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <select
                                                        value={message.role}
                                                        onChange={(e) => {
                                                            const newMessages = [...config.messages];
                                                            newMessages[index].role = e.target.value;
                                                            setConfig({ ...config, messages: newMessages });
                                                        }}
                                                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                    >
                                                        <option value="system">System</option>
                                                        <option value="user">User</option>
                                                        <option value="assistant">Assistant</option>
                                                    </select>
                                                    <button
                                                        onClick={() => deleteMessage(index)}
                                                        className="text-red-600 hover:text-red-700 text-xs"
                                                    >
                                                        × Delete
                                                    </button>
                                                </div>
                                                <ExpandableTextarea
                                                    value={message.content}
                                                    onChange={(value) => updateMessage(index, value)}
                                                    placeholder={`Enter ${message.role} message...`}
                                                    inputData={inputData}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    rows={3}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Functions */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                                        <div className="space-y-3">
                                            {config.functions.map((func, index) => (
                                                <div key={index} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
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
                                                        <input
                                                            type="text"
                                                            value={func.name || ''}
                                                            onChange={(e) => updateFunction(index, 'name', e.target.value)}
                                                            placeholder="Function name"
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                        />
                                                        <ExpandableTextarea
                                                            value={func.description || ''}
                                                            onChange={(value) => updateFunction(index, 'description', value)}
                                                            placeholder="Function description"
                                                            inputData={inputData}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                            rows={2}
                                                        />
                                                        <ExpandableTextarea
                                                            value={JSON.stringify(func.parameters || {}, null, 2)}
                                                            onChange={(value) => {
                                                                try {
                                                                    const params = JSON.parse(value);
                                                                    updateFunction(index, 'parameters', params);
                                                                } catch (e) {
                                                                    // Invalid JSON, keep as is
                                                                }
                                                            }}
                                                            placeholder='{"type": "object", "properties": {}, "required": []}'
                                                            inputData={inputData}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
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
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Function Call
                                        </label>
                                        <select
                                            value={config.functionCall}
                                            onChange={(e) => setConfig({ ...config, functionCall: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="auto">Auto</option>
                                            <option value="none">None</option>
                                            {config.functions.map((func, index) => (
                                                <option key={index} value={func.name}>{func.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Stream */}
                                <div>
                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={config.stream}
                                            onChange={(e) => setConfig({ ...config, stream: e.target.checked })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">Enable Streaming</span>
                                    </label>
                                </div>

                                {/* Temperature */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Temperature: {config.temperature}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={config.temperature}
                                        onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Độ sáng tạo của câu trả lời (0-2)
                                    </p>
                                </div>

                                {/* Top P */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Top P: {config.topP}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={config.topP}
                                        onChange={(e) => setConfig({ ...config, topP: parseFloat(e.target.value) })}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Điều chỉnh độ tập trung câu trả lời (0-1)
                                    </p>
                                </div>

                                {/* Advanced Options */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Advanced Options
                                    </label>
                                    <div className="space-y-2">
                                        {availableOptions.map(option => (
                                            <div key={option.key} className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    checked={config.advancedOptions[option.key] !== undefined}
                                                    onChange={() => toggleAdvancedOption(option)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                                                    {option.label}
                                                </label>
                                                {config.advancedOptions[option.key] !== undefined && (
                                                    <input
                                                        type={option.type}
                                                        value={config.advancedOptions[option.key]}
                                                        onChange={(e) => updateAdvancedOption(option, option.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                                                        min={option.min}
                                                        max={option.max}
                                                        step={option.step}
                                                        className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Panel - OUTPUT */}
                        <div className="w-1/3 border-l border-gray-200 dark:border-gray-700 flex flex-col">
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                    OUTPUT
                                    {outputData && (
                                        <span className="ml-2 text-sm font-normal text-gray-500">
                                            {Array.isArray(outputData) ? `${outputData.length} items` : '1 item'}
                                        </span>
                                    )}
                                </h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto">
                                {outputData ? (
                                    <ResultDisplay data={outputData} />
                                ) : (
                                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                        <p>Click "Test step" to see output</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showCredentialModal && (
                <CredentialModal
                    onClose={() => setShowCredentialModal(false)}
                    onSave={handleCredentialSaved}
                    initialType="custom"
                />
            )}
        </>
    );
}

export default GeminiConfigModal;


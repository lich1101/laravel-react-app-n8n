import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
// Removed ResultDisplay - now using TestResultViewer
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function GeminiConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    // Removed: truncateText, getTypeInfo, toggleCollapse, renderDraggableJSON
    // Now using shared components and hooks
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
    const testAbortControllerRef = useRef(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [models, setModels] = useState([]);
    const [loadingModels, setLoadingModels] = useState(false);

    // Use shared hook for common modal state and logic
    const {
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput,
        setInputViewMode,
        setOutputViewMode,
        togglePathCollapse,
        handleSave: handleSaveCommon,
        handleClose: handleCloseCommon,
    } = useConfigModal({
        onTest: null, // Custom test logic below
        onSave: () => onSave(config),
        onClose: () => {
            // Stop test if currently testing
            if (isTesting && testAbortControllerRef.current) {
                handleStopTest();
            }
            onSave(config);
            onClose();
        },
        onTestResult,
        node,
        config,
        inputData,
        outputData: testResults || outputData,
        readOnly
    });

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

    // handleSave and handleClose are now handled by useConfigModal
    // But we override handleClose below to include test stop logic

    const handleTest = async () => {
        if (onTest) {
            setIsTesting(true);
            setTestResults(null);
            
            // Create AbortController for this test
            const abortController = new AbortController();
            testAbortControllerRef.current = abortController;
            
            try {
                const result = await onTest(config);
                
                // Check if test was cancelled
                if (abortController.signal.aborted) {
                    console.log('Test was cancelled');
                    return;
                }
                
                setTestResults(result);

                if (onTestResult && node?.id) {
                    onTestResult(node.id, result);
                }
            } catch (error) {
                // Check if test was cancelled
                if (abortController.signal.aborted) {
                    console.log('Test was cancelled');
                    return;
                }
                
                const errorResult = {
                    error: error.message || 'An error occurred while testing Gemini AI',
                };
                setTestResults(errorResult);
                
                if (onTestResult && node?.id) {
                    onTestResult(node.id, errorResult);
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setIsTesting(false);
                }
                testAbortControllerRef.current = null;
            }
        }
    };

    const handleStopTest = () => {
        if (testAbortControllerRef.current) {
            testAbortControllerRef.current.abort();
            setIsTesting(false);
            setTestResults(null);
            testAbortControllerRef.current = null;
            console.log('Test stopped by user');
        }
    };

    // Custom handleClose that stops test before closing
    const handleClose = () => {
        if (isTesting && testAbortControllerRef.current) {
            handleStopTest();
        }
        handleSaveCommon();
        handleCloseCommon();
    };

    // Test buttons
    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>■</span>
                    <span>Stop step</span>
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={!config.credentialId}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>▲</span>
                    <span>Test step</span>
                </button>
            )}
        </>
    ) : null;

    // Update displayOutput when testResults change
    const currentDisplayOutput = testResults || outputData || displayOutput;

    return (
        <>
        <ConfigModalLayout
            node={node}
            onRename={onRename}
            onClose={handleClose}
            title="Gemini AI"
            iconPath="/icons/nodes/gemini.svg"
            readOnly={readOnly}
            isTesting={false}
            testButtons={testButtons}
            size="large"
        >
            {/* Left Panel - INPUT */}
            <div className="w-1/3 border-r border-gray-200 flex flex-col">
                <TestResultViewer
                    data={inputData}
                    viewMode={inputViewMode}
                    onViewModeChange={setInputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="INPUT"
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            <p className="text-center text-sm">Connect this node to receive input data</p>
                            <p className="text-center text-xs mt-2">Kéo thả biến từ đây vào messages</p>
                        </div>
                    }
                />
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
                <TestResultViewer
                    data={currentDisplayOutput}
                    viewMode={outputViewMode}
                    onViewModeChange={setOutputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="OUTPUT"
                    isTesting={isTesting}
                    testingMessage="Đang gọi Gemini API..."
                    emptyState={
                        <div className="text-center text-gray-500 py-8">
                            <p>Click "Test step" to see output</p>
                        </div>
                    }
                />
            </div>
        </ConfigModalLayout>

        {/* Credential Modal */}
        <CredentialModal
            isOpen={showCredentialModal}
            onClose={() => setShowCredentialModal(false)}
            onSave={handleCredentialSaved}
            credentialType="gemini"
            lockedType={true}
        />
        </>
    );
}

export default GeminiConfigModal;


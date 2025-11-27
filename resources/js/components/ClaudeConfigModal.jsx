import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import ResultDisplay from './ResultDisplay';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';
import JSONViewer from './common/JSONViewer';

function ClaudeConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        model: 'claude-3-7-sonnet-20250219',
        systemMessageEnabled: false,
        systemMessage: '',
        messages: [
            { role: 'user', content: '' }
        ],
        credentialId: null,
        advancedOptions: {},
        thinkingEnabled: false,
        thinkingBudget: 5000,
    });

    const availableOptions = [
        { key: 'max_tokens', label: 'Maximum Tokens', type: 'number', min: 1, max: 100000, step: 1, default: 1024, description: 'Giới hạn độ dài response' },
        { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, default: 0.7, description: 'Độ sáng tạo của câu trả lời (0-2)' },
        { key: 'top_k', label: 'Top K', type: 'number', min: 1, max: 100, step: 1, default: 40, description: 'Top K sampling' },
        { key: 'top_p', label: 'Top P', type: 'number', min: 0, max: 1, step: 0.1, default: 0.9, description: 'Top P sampling' },
        { key: 'timeout', label: 'Request Timeout (seconds)', type: 'number', min: 10, max: 300, step: 10, default: 60, description: 'Thời gian chờ tối đa cho API response' },
    ];

    const models = [
        { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
        // Claude 4 Family (Latest versions)
        { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    
        // Claude 3 Family
        { value: 'claude-3-7-sonnet-20250219', label: 'Claude Sonnet 3.7' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude Sonnet 3.5' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 3.5' },
        { value: 'claude-3-haiku-20240307', label: 'Claude Haiku 3' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    
        // Legacy models
        { value: 'claude-2.1', label: 'Claude 2.1' },
        { value: 'claude-2.0', label: 'Claude 2.0' },
        { value: 'claude-instant-1.2', label: 'Claude Instant 1.2' },
    ];
    

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const testAbortControllerRef = useRef(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);

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
                thinkingEnabled: node.data.config.thinkingEnabled ?? prev.thinkingEnabled ?? false,
                thinkingBudget: Number.isFinite(Number(node.data.config.thinkingBudget))
                    ? Number(node.data.config.thinkingBudget)
                    : (prev.thinkingBudget ?? 5000),
            }));
        }
        fetchCredentials();
    }, [node]);

    const fetchCredentials = async () => {
        try {
            const response = await axios.get('/credentials', { params: { type: 'claude' } });
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
                    error: error.message || 'An error occurred while testing the request',
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

    // Removed: getDisplayOutput, truncateText, getTypeInfo, toggleCollapse, renderDraggableJSON
    // Now using shared components and hooks

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
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Stop step
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={
                        !config.credentialId || 
                        !config.messages || 
                        config.messages.length === 0 ||
                        !config.messages.some(msg => msg.content && msg.content.trim())
                    }
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Test step
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
            title="Claude AI"
            icon="🤖"
            readOnly={readOnly}
            isTesting={false}
            testButtons={testButtons}
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
                            <p className="text-center text-sm">
                                Connect this node to receive input data
                            </p>
                            <p className="text-center text-xs mt-2">
                                Kéo thả biến từ đây vào messages
                            </p>
                        </div>
                    }
                />
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
                                    Claude API Credential *
                                </label>
                                <div className="flex space-x-2">
                                    <select
                                        value={config.credentialId || ''}
                                        onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                        disabled={readOnly}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <option value="">Select Credential...</option>
                                        {credentials.map(cred => (
                                            <option key={cred.id} value={cred.id}>
                                                {cred.name}
                                            </option>
                                        ))}
                                    </select>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={() => setShowCredentialModal(true)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                            title="Create new credential"
                                        >
                                            + New
                                        </button>
                                    )}
                                </div>
                                {!config.credentialId && (
                                    <p className="mt-1 text-xs text-orange-600">
                                        ⚠️ Nhấn "+ New" để tạo credential Claude API
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
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    <label className="block text-sm font-medium text-gray-700">
                                        Enable System Message
                                    </label>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.systemMessageEnabled}
                                            onChange={(e) => setConfig({ ...config, systemMessageEnabled: e.target.checked })}
                                            disabled={readOnly}
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
                                        disabled={readOnly}
                                    />
                                )}
                            </div>

                            {/* Thinking Toggle */}
                            <div className="border border-gray-200 rounded-2xl p-4 bg-orange-50/70">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">Thinking Mode</p>
                                        <p className="text-xs text-gray-500">
                                            Bật để gửi <code>thinking.type = "enabled"</code> cùng <code>thinking.budget_tokens</code> tới Claude.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={!!config.thinkingEnabled}
                                            onChange={(e) => setConfig({ ...config, thinkingEnabled: e.target.checked })}
                                        />
                                        <div
                                            className={`w-11 h-6 flex items-center px-1 rounded-full transition-colors duration-200 focus-within:ring-4 focus-within:ring-orange-300 ${
                                                config.thinkingEnabled ? 'bg-orange-600' : 'bg-gray-300'
                                            }`}
                                        >
                                            <span
                                                className={`h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                                                    config.thinkingEnabled ? 'translate-x-4' : 'translate-x-0'
                                                }`}
                                            />
                                        </div>
                                    </label>
                                </div>
                                {config.thinkingEnabled && (
                                    <div className="mt-3 space-y-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Budget Tokens
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            step={100}
                                            value={config.thinkingBudget ?? ''}
                                            onChange={(e) => {
                                                const value = Number(e.target.value);
                                                setConfig({
                                                    ...config,
                                                    thinkingBudget: Number.isNaN(value) ? '' : value,
                                                });
                                            }}
                                            className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                            placeholder="Nhập số token dành cho thinking (mặc định: 10000)"
                                        />
                                        <p className="text-xs text-gray-500">
                                            Ví dụ: 10000. Giá trị càng cao thì Claude càng có nhiều ngân sách để reasoning.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Messages List */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Messages
                                    </label>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={addMessagePair}
                                            className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                                        >
                                            + Add Message
                                        </button>
                                    )}
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
                                                {config.messages.length > 1 && !readOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteMessage(index)}
                                                        className="text-rose-600 hover:text-rose-500 text-xs"
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
                                                disabled={readOnly}
                                            />
                                        </div>
                                    ))}
                                </div>
                                
                                <p className="mt-2 text-xs text-gray-500 italic">
                                    ℹ️ Messages sẽ tự động xen kẽ: User → Assistant → User → Assistant...
                                </p>
                            </div>

                            {/* Advanced Options */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
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
                                            className="text-xs px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-900"
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
                                    <div className="space-y-3 bg-gray-50 p-3 rounded-md border border-gray-200">
                                        {Object.entries(config.advancedOptions).map(([optionKey, optionValue]) => {
                                            const optionDef = availableOptions.find(opt => opt.key === optionKey);
                                            if (!optionDef) return null;

                                            return (
                                                <div key={optionKey} className="border border-gray-300 rounded-md p-3 bg-white">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="block text-xs font-semibold text-gray-700">
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
                                                    
                                                    <ExpandableTextarea
                                                        value={optionValue !== undefined ? String(optionValue) : ''}
                                                        onChange={(newValue) => {
                                                            const raw = optionDef.step < 1
                                                                ? parseFloat(newValue)
                                                                : parseInt(newValue, 10);
                                                            updateAdvancedOption(optionKey, Number.isNaN(raw) ? optionDef.default : raw);
                                                        }}
                                                        rows={1}
                                                        placeholder={String(optionDef.default)}
                                                        disabled={readOnly}
                                                    />
                                                    
                                                    {optionDef.description && (
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            {optionDef.description}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                
                                {Object.keys(config.advancedOptions).length === 0 && (
                                    <p className="text-xs text-gray-500 italic">
                                        Chọn option từ dropdown phía trên để thêm vào configuration
                                    </p>
                                )}
                            </div>

                            {/* Info */}
                            <div className="text-xs text-gray-500 italic bg-orange-50 p-3 rounded border border-orange-200">
                                <strong>API Endpoint:</strong> https://api.anthropic.com/v1/messages
                            </div>
                        </div>
                    </div>

            {/* Right Panel - OUTPUT */}
            <div className="w-1/3 flex flex-col">
                <TestResultViewer
                    data={currentDisplayOutput}
                    viewMode={outputViewMode}
                    onViewModeChange={setOutputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="OUTPUT"
                    isTesting={isTesting}
                    testingMessage="Đang gọi Claude API..."
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-center">
                                Nhấn "Test step" để xem kết quả từ Claude AI
                            </p>
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
            credentialType="claude"
            lockedType={true}
        />
        </>
    );
}

export default ClaudeConfigModal;


import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import VariableInput from './VariableInput';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';
import JSONViewer from './common/JSONViewer';

const WebhookConfigModal = ({ node, onSave, onClose, workflowId, onTestResult, onRename, outputData, readOnly = false }) => {
    const [config, setConfig] = useState({
        method: 'POST',
        path: '',
        auth: 'none',
        authType: 'bearer', // bearer, basic, apiKey, digest, oauth2, custom
        credentialId: null,
        apiKeyName: '',
        apiKeyValue: '',
        username: '',
        password: '',
        customHeaderName: '',
        customHeaderValue: '',
        respond: 'immediately',
        customResponseEnabled: false,
        customResponse: '{\n  "success": true,\n  "message": "Webhook received"\n}',
        ...node?.data?.config,
    });

    const [isListening, setIsListening] = useState(false);
    const [testOutput, setTestOutput] = useState(null);
    const [testError, setTestError] = useState(null);
    const [credentials, setCredentials] = useState([]);
    const [selectedCredential, setSelectedCredential] = useState(null);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [selectedCredentialType, setSelectedCredentialType] = useState('bearer');
    const [pathError, setPathError] = useState(null);
    const [isCheckingPath, setIsCheckingPath] = useState(false);
    const [activeTab, setActiveTab] = useState('schema');
    const pollingIntervalRef = useRef(null);
    const testRunIdRef = useRef(null);
    const pathCheckTimeoutRef = useRef(null);

    useEffect(() => {
        fetchCredentials();
        
        // Cleanup polling on unmount
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            if (pathCheckTimeoutRef.current) {
                clearTimeout(pathCheckTimeoutRef.current);
            }
        };
    }, []);

    // Load selected credential when credentialId changes
    useEffect(() => {
        const loadSelectedCredential = async () => {
            if (config.credentialId) {
                try {
                    console.log('🔵 Loading credential:', config.credentialId);
                    const response = await axios.get(`/credentials/${config.credentialId}`);
                    console.log('✅ Credential loaded:', {
                        id: response.data?.id,
                        type: response.data?.type,
                        has_data: !!response.data?.data,
                        data_keys: response.data?.data ? Object.keys(response.data.data) : [],
                        has_token: !!(response.data?.data?.token || response.data?.data?.headerValue),
                    });
                    setSelectedCredential(response.data);
                } catch (error) {
                    console.error('❌ Error loading credential:', error);
                    setSelectedCredential(null);
                }
            } else {
                setSelectedCredential(null);
            }
        };
        
        loadSelectedCredential();
    }, [config.credentialId]);

    // Check path duplicate when path changes
    useEffect(() => {
        if (pathCheckTimeoutRef.current) {
            clearTimeout(pathCheckTimeoutRef.current);
        }

        if (!config.path || config.path.trim() === '') {
            setPathError(null);
            return;
        }

        // Debounce path check
        pathCheckTimeoutRef.current = setTimeout(async () => {
            setIsCheckingPath(true);
            try {
                const response = await axios.post('/webhook/check-path-duplicate', {
                    path: config.path,
                    workflow_id: workflowId,
                    node_id: node.id
                });

                if (response.data.duplicate) {
                    setPathError(response.data.message);
                } else {
                    setPathError(null);
                }
            } catch (error) {
                console.error('Error checking path duplicate:', error);
                setPathError(null);
            } finally {
                setIsCheckingPath(false);
            }
        }, 500); // Wait 500ms after user stops typing

        return () => {
            if (pathCheckTimeoutRef.current) {
                clearTimeout(pathCheckTimeoutRef.current);
            }
        };
    }, [config.path, workflowId, node.id]);

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

    const handleClose = async () => {
        // Check if there's a path error before allowing close/save
        if (pathError) {
            alert('Không thể lưu: ' + pathError);
            return;
        }

        // Stop listening if active
        if (isListening || pollingIntervalRef.current) {
            // Stop polling immediately
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }

            // Stop listening on backend
            if (testRunIdRef.current) {
                try {
                    await axios.post(`/workflows/${workflowId}/webhook-test-stop/${testRunIdRef.current}`);
                } catch (error) {
                    console.error('Error stopping webhook test on close:', error);
                }
            }
        }

        // Auto-save config when closing
        onSave(config);
        onClose();
    };

    const baseUrl = window.location.origin;

    // Function to render text with variable highlighting
    const renderWithVariableHighlight = (text) => {
        if (!text || typeof text !== 'string') return text;

        const parts = text.split(/(\{\{[^}]+\}\})/g);
        return parts.map((part, index) => {
            if (part.match(/^\{\{[^}]+\}\}$/)) {
                return (
                    <span key={index} className="text-blue-400 font-mono bg-blue-900/30 px-1 rounded">
                        {part}
                    </span>
                );
            }
            return <span key={index}>{part}</span>;
        });
    };

    const handleTestStep = async () => {
        console.log('🔵 handleTestStep called', { path: config.path, workflowId, nodeId: node?.id });
        
        if (!config.path) {
            setTestError('Please enter a webhook path first');
            console.error('❌ Webhook path is required');
            return;
        }

        try {
            setIsListening(true);
            setTestOutput(null);
            setTestError(null);

            console.log('📡 Starting webhook test listen...', {
                workflowId,
                nodeId: node?.id,
                path: config.path,
                method: config.method
            });

            // Start listening on the backend
            console.log('📤 Sending webhook-test-listen request:', {
                workflowId,
                nodeId: node?.id,
                path: config.path,
                method: config.method,
                auth: config.auth,
                auth_type: config.authType,
                credential_id: config.credentialId,
                has_selected_credential: !!selectedCredential,
                credential_data_keys: selectedCredential?.data ? Object.keys(selectedCredential.data) : [],
            });
            
            const response = await axios.post(`/workflows/${workflowId}/webhook-test-listen`, {
                node_id: node?.id,
                path: config.path,
                method: config.method,
                auth: config.auth,
                auth_type: config.authType,
                credential_id: config.credentialId, // For bearer/oauth2
                auth_config: {
                    apiKeyValue: config.apiKeyValue,
                    username: config.username,
                    password: config.password,
                    apiKeyName: config.apiKeyName,
                    customHeaderName: config.customHeaderName,
                    customHeaderValue: config.customHeaderValue,
                },
                custom_response_enabled: Boolean(config.customResponseEnabled),
                custom_response: String(config.customResponse || ''),
            });

            testRunIdRef.current = response.data.test_run_id;
            console.log('✅ Webhook test listener started, testRunId:', testRunIdRef.current);

            // Start polling for test results
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const statusResponse = await axios.get(`/workflows/${workflowId}/webhook-test-status/${testRunIdRef.current}`);

                    if (statusResponse.data.status === 'received') {
                        const receivedData = statusResponse.data.data;

                        // Stop polling first
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;

                        // Stop listening on backend
                        if (testRunIdRef.current) {
                            try {
                                await axios.post(`/workflows/${workflowId}/webhook-test-stop/${testRunIdRef.current}`);
                            } catch (error) {
                                console.error('Error stopping backend listener:', error);
                            }
                        }

                        setTestOutput(receivedData);
                        setIsListening(false);

                        // Save test result to node output data (so downstream nodes can use it)
                        if (onTestResult && node?.id) {
                            // Format the data similar to actual webhook execution
                            const formattedOutput = {
                                method: receivedData.method,
                                headers: receivedData.headers,
                                body: receivedData.body,
                                query: receivedData.query,
                            };
                            onTestResult(node.id, formattedOutput);
                        }
                    } else if (statusResponse.data.status === 'stopped') {
                        // User stopped the listener
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                        setIsListening(false);
                    } else if (statusResponse.data.status === 'timeout') {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;

                        // Stop listening on backend
                        if (testRunIdRef.current) {
                            try {
                                await axios.post(`/workflows/${workflowId}/webhook-test-stop/${testRunIdRef.current}`);
                            } catch (error) {
                                console.error('Error stopping backend listener:', error);
                            }
                        }

                        setTestError('Test timeout: No request received');
                        setIsListening(false);
                    }
                } catch (error) {
                    console.error('Error polling test status:', error);
                }
            }, 1000); // Poll every second

        } catch (error) {
            console.error('Error starting webhook test:', error);
            setTestError(error.response?.data?.message || 'Failed to start webhook test');
            setIsListening(false);
        }
    };

    const handleStopListening = async () => {
        // Stop polling immediately
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }

        // Stop listening on backend
        try {
            if (testRunIdRef.current) {
                await axios.post(`/workflows/${workflowId}/webhook-test-stop/${testRunIdRef.current}`);
            }
        } catch (error) {
            console.error('Error stopping webhook test:', error);
        }

        setIsListening(false);
        testRunIdRef.current = null;
        setTestOutput(null);
        setTestError(null);
    };

    // Test buttons for Webhook
    const testButtons = !readOnly ? (
        <button
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Test button clicked', { isListening, hasTestOutput: !!testOutput });
                if (isListening) {
                    handleStopListening();
                } else {
                    handleTestStep();
                }
            }}
            disabled={isListening && !testOutput}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                isListening 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
            } ${(isListening && !testOutput) ? 'opacity-50 cursor-not-allowed' : 'disabled:bg-gray-400 disabled:cursor-not-allowed'}`}
            title={isListening && !testOutput ? 'Wait for test output to stop' : ''}
        >
            {isListening ? 'Stop Listening' : 'Test step'}
        </button>
    ) : null;

    return (
        <>
            <style>{`
                .variable-highlight {
                    background-color: rgba(96, 165, 250, 0.2);
                    color: #93c5fd;
                    border-radius: 3px;
                    padding: 0 2px;
                    font-family: monospace;
                }
            `}</style>
            <ConfigModalLayout
                node={node}
                onRename={onRename}
                onClose={handleClose}
                title="Webhook"
                iconPath="/icons/nodes/webhook.svg"
                readOnly={readOnly}
                isTesting={false}
                testButtons={testButtons}
                size="default"
            >
                <div className="flex h-[calc(90vh-80px)]" style={{ width: '100%' }}>
                    {/* Left Panel - Config */}
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        <div>
                            {/* Webhook URL */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-secondary mb-2">Webhook URL</label>
                                <div className="bg-surface border border-subtle rounded-lg px-3 py-2 text-sm text-secondary">
                                    {config.method} {baseUrl}/api/webhook/{config.path || 'your-path'}
                                </div>
                            </div>

                            {/* HTTP Method */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-secondary mb-2">HTTP Method</label>
                                <select
                                    value={config.method}
                                    onChange={(e) => setConfig({ ...config, method: e.target.value })}
                                    disabled={readOnly}
                                    className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="GET">GET</option>
                                    <option value="POST">POST</option>
                                    <option value="PUT">PUT</option>
                                    <option value="PATCH">PATCH</option>
                                    <option value="DELETE">DELETE</option>
                                </select>
                            </div>

                            {/* Path */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-secondary mb-2">Path</label>
                                <div className="relative">
                                    <VariableInput
                                        value={config.path}
                                        onChange={(newValue) => setConfig({ ...config, path: newValue })}
                                        rows={1}
                                        placeholder="test"
                                        disabled={readOnly}
                                        className={`w-full bg-surface border rounded-lg px-3 py-2 text-secondary ${
                                            pathError ? 'border-danger-color' : 'border-subtle'
                                        }`}
                                    />
                                    {isCheckingPath && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                {pathError && (
                                    <p className="mt-2 text-sm text-danger flex items-start">
                                        <svg className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                        <span>{pathError}</span>
                                    </p>
                                )}
                            </div>

                            {/* Authentication */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-secondary mb-2">Authentication</label>
                                <select
                                    value={config.auth}
                                    onChange={(e) => setConfig({ ...config, auth: e.target.value, authType: 'bearer' })}
                                    disabled={readOnly}
                                    className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="none">None</option>
                                    <option value="header">Header Auth</option>
                                    <option value="query">Query Auth</option>
                                </select>
                            </div>

                            {/* Authentication Type (if auth is not none) */}
                            {config.auth !== 'none' && (
                                <>
                                    <div className="mb-6">
                                        <label className="block text-sm font-medium text-secondary mb-2">Authentication Type</label>
                                        <select
                                            value={config.authType}
                                            onChange={(e) => setConfig({ ...config, authType: e.target.value })}
                                            disabled={readOnly}
                                            className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <option value="bearer">Bearer Token</option>
                                            <option value="basic">Basic Auth</option>
                                            <option value="apiKey">API Key</option>
                                            <option value="digest">Digest Auth</option>
                                            <option value="oauth2">OAuth 2.0</option>
                                            <option value="custom">Custom Header</option>
                                        </select>
                                    </div>

                                    {/* Bearer Token */}
                                    {config.authType === 'bearer' && (
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-secondary mb-2">Bearer Token Credential</label>
                                            <div className="flex space-x-2">
                                                <select
                                                    value={config.credentialId || ''}
                                                    onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                                    disabled={readOnly}
                                                    className="flex-1 bg-surface border border-subtle rounded-lg px-3 py-2 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <option value="">Select Credential...</option>
                                                    {Array.isArray(credentials) && credentials
                                                        .filter(cred => cred.type === 'bearer')
                                                        .map(cred => (
                                                            <option key={cred.id} value={cred.id}>
                                                                {cred.name}
                                                            </option>
                                                        ))}
                                                </select>
                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedCredentialType('bearer');
                                                            setShowCredentialModal(true);
                                                        }}
                                                        className="btn btn-success text-sm whitespace-nowrap"
                                                        title="Create new Bearer Token"
                                                    >
                                                        + New
                                                    </button>
                                                )}
                                            </div>
                                            {!config.credentialId && (
                                                <p className="mt-1 text-xs text-warning">
                                                    ⚠️ No credential selected - webhook will work but without security
                                                </p>
                                            )}
                                            {config.credentialId && (
                                                <p className="mt-1 text-xs text-success">
                                                    ✓ Credential selected
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Basic Auth */}
                                    {config.authType === 'basic' && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-secondary mb-1">Username</label>
                                                <ExpandableTextarea
                                                    value={config.username || ''}
                                                    onChange={(newValue) => setConfig({ ...config, username: newValue })}
                                                    placeholder="Username"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-secondary mb-1">Password</label>
                                                <ExpandableTextarea
                                                    value={config.password || ''}
                                                    onChange={(newValue) => setConfig({ ...config, password: newValue })}
                                                    placeholder="Password"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* API Key */}
                                    {config.authType === 'apiKey' && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-secondary mb-1">Header/Query Param Name</label>
                                                <ExpandableTextarea
                                                    value={config.apiKeyName || ''}
                                                    onChange={(newValue) => setConfig({ ...config, apiKeyName: newValue })}
                                                    placeholder="X-API-KEY"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-secondary mb-1">API Key Value</label>
                                                <ExpandableTextarea
                                                    value={config.apiKeyValue || ''}
                                                    onChange={(newValue) => setConfig({ ...config, apiKeyValue: newValue })}
                                                    placeholder="Your API Key"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Digest Auth */}
                                    {config.authType === 'digest' && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-secondary mb-1">Username</label>
                                                <ExpandableTextarea
                                                    value={config.username || ''}
                                                    onChange={(newValue) => setConfig({ ...config, username: newValue })}
                                                    placeholder="Username"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-secondary mb-1">Password</label>
                                                <ExpandableTextarea
                                                    value={config.password || ''}
                                                    onChange={(newValue) => setConfig({ ...config, password: newValue })}
                                                    placeholder="Password"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* OAuth 2.0 */}
                                    {config.authType === 'oauth2' && (
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-secondary mb-2">OAuth2 Credential</label>
                                            <div className="flex space-x-2">
                                                <select
                                                    value={config.credentialId || ''}
                                                    onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                                    disabled={readOnly}
                                                    className="flex-1 bg-surface border border-subtle rounded-lg px-3 py-2 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <option value="">Select Credential...</option>
                                                    {Array.isArray(credentials) && credentials
                                                        .filter(cred => cred.type === 'oauth2')
                                                        .map(cred => (
                                                            <option key={cred.id} value={cred.id}>
                                                                {cred.name}
                                                            </option>
                                                        ))}
                                                </select>
                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedCredentialType('oauth2');
                                                            setShowCredentialModal(true);
                                                        }}
                                                        className="btn btn-success text-sm whitespace-nowrap"
                                                        title="Create new OAuth2 Credential"
                                                    >
                                                        + New
                                                    </button>
                                                )}
                                            </div>
                                            {!config.credentialId && (
                                                <p className="mt-1 text-xs text-warning">
                                                    ⚠️ No OAuth2 credential selected - webhook will work but without security
                                                </p>
                                            )}
                                            {config.credentialId && (
                                                <p className="mt-1 text-xs text-success">
                                                    ✓ OAuth2 credential selected
                                                </p>
                                            )}
                                            <p className="mt-2 text-xs text-gray-500">
                                                💡 OAuth2 credentials include Client ID, Client Secret, and redirect URL configuration
                                            </p>
                                        </div>
                                    )}

                                    {/* Custom Header */}
                                    {config.authType === 'custom' && (
                                        <>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-secondary mb-2">Header Name</label>
                                                <ExpandableTextarea
                                                    value={config.customHeaderName || ''}
                                                    onChange={(newValue) => setConfig({ ...config, customHeaderName: newValue })}
                                                    placeholder="X-Custom-Header"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-secondary mb-2">Header Value</label>
                                                <ExpandableTextarea
                                                    value={config.customHeaderValue || ''}
                                                    onChange={(newValue) => setConfig({ ...config, customHeaderValue: newValue })}
                                                    placeholder="Header value"
                                                    rows={1}
                                                    disabled={readOnly}
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {/* Respond */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-secondary mb-2">Respond</label>
                                <select
                                    value={config.respond}
                                    onChange={(e) => setConfig({ ...config, respond: e.target.value })}
                                    disabled={readOnly}
                                    className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="immediately">Immediately</option>
                                    <option value="when_last_node_finishes">When last node finishes</option>
                                </select>
                            </div>

                            {/* Custom Response */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-secondary">Custom Response</label>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.customResponseEnabled || false}
                                            onChange={(e) => setConfig({ ...config, customResponseEnabled: e.target.checked })}
                                            disabled={readOnly}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"></div>
                                    </label>
                                </div>
                                {config.customResponseEnabled && (
                                    <div className="mt-2">
                                        <label className="block text-xs text-muted mb-1">Response JSON</label>
                                        <ExpandableTextarea
                                            value={config.customResponse || ''}
                                            onChange={(newValue) => setConfig({ ...config, customResponse: newValue })}
                                            placeholder='{"success": true, "message": "Webhook received"}'
                                            rows={8}
                                            disabled={readOnly}
                                            className="font-mono text-sm"
                                        />
                                        <p className="mt-1 text-xs text-muted">
                                            JSON response sẽ được trả về khi webhook được gọi thành công. Có thể sử dụng biến {'{{variable}}'} để động.
                                        </p>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>

                {/* Right Panel - Output */}
                <div className="w-1/2 border-l border-subtle px-6 py-4 bg-surface flex flex-col">
                    <h3 className="text-sm font-medium text-secondary mb-4">OUTPUT</h3>
                    
                    {/* Tabs */}
                    {(testOutput || outputData) && (
                        <div className="flex gap-2 mb-3 border-b border-subtle">
                            <button
                                onClick={() => setActiveTab('schema')}
                                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                    activeTab === 'schema'
                                        ? 'text-primary border-b-2 border-primary'
                                        : 'text-muted hover:text-secondary'
                                }`}
                            >
                                Schema
                            </button>
                            <button
                                onClick={() => setActiveTab('json')}
                                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                    activeTab === 'json'
                                        ? 'text-primary border-b-2 border-primary'
                                        : 'text-muted hover:text-secondary'
                                }`}
                            >
                                JSON
                            </button>
                        </div>
                    )}
                    
                    <div className="flex-1 bg-surface-muted rounded-lg p-4 overflow-y-auto border border-subtle">
                        {isListening ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <div className="animate-pulse mb-4">
                                        <svg className="w-16 h-16 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                    </div>
                                    <p className="text-success font-medium mb-2">Listening for webhook...</p>
                                    <p className="text-muted text-sm">Send a request to the webhook URL below</p>
                                    
                                    <div className="mt-4 w-full max-w-lg space-y-3">
                                        {/* Test URL */}
                                        <div className="bg-surface rounded-lg border border-subtle p-3 text-left">
                                            <p className="text-xs text-muted mb-1">Test URL:</p>
                                            <code className="text-xs text-success break-all">
                                                {config.method} {baseUrl}/api/webhook-test/{config.path}
                                            </code>
                                        </div>

                                        {/* Authentication Info */}
                                        {config.auth !== 'none' && (
                                            <div className="bg-warning/10 border border-warning/40 rounded-lg p-3 text-left">
                                                <p className="text-xs text-warning font-semibold mb-2">🔐 Authentication Required:</p>
                                                
                                                {/* Bearer Token */}
                                                {config.authType === 'bearer' && config.credentialId && (
                                                    <>
                                                        <p className="text-xs text-secondary mb-1">Type: <span className="text-primary">Bearer Token</span></p>
                                                        {selectedCredential ? (
                                                            <>
                                                                {config.auth === 'header' ? (
                                                                    <>
                                                                        <p className="text-xs text-muted mt-2">Header:</p>
                                                                        <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 break-all border border-subtle">
                                                                            Authorization: Bearer {(selectedCredential.data?.token || selectedCredential.data?.headerValue || '')?.replace('Bearer ', '') || '[TOKEN NOT FOUND]'}
                                                                        </code>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <p className="text-xs text-muted mt-2">Query Parameter:</p>
                                                                        <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 break-all border border-subtle">
                                                                            ?token={(selectedCredential.data?.token || selectedCredential.data?.headerValue || '')?.replace('Bearer ', '') || '[TOKEN NOT FOUND]'}
                                                                        </code>
                                                                    </>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <p className="text-xs text-muted mt-2">Loading credential...</p>
                                                        )}
                                                    </>
                                                )}

                                                {/* Basic Auth */}
                                                {config.authType === 'basic' && (
                                                    <>
                                                        <p className="text-xs text-secondary mb-1">Type: <span className="text-primary">Basic Auth</span></p>
                                                        {config.auth === 'header' ? (
                                                            <>
                                                                <p className="text-xs text-muted mt-2">Header:</p>
                                                                <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 border border-subtle">
                                                                    Authorization: Basic {btoa(`${config.username}:${config.password}`)}
                                                                </code>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <p className="text-xs text-muted mt-2">Query Parameters:</p>
                                                                <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 border border-subtle">
                                                                    ?username={config.username}&password={config.password}
                                                                </code>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                {/* API Key */}
                                                {config.authType === 'apiKey' && (
                                                    <>
                                                        <p className="text-xs text-secondary mb-1">Type: <span className="text-primary">API Key</span></p>
                                                        {config.auth === 'header' ? (
                                                            <>
                                                                <p className="text-xs text-muted mt-2">Header:</p>
                                                                <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 border border-subtle">
                                                                    {config.apiKeyName}: {config.apiKeyValue}
                                                                </code>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <p className="text-xs text-muted mt-2">Query Parameter:</p>
                                                                <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 border border-subtle">
                                                                    ?{config.apiKeyName}={config.apiKeyValue}
                                                                </code>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                {/* Custom Header */}
                                                {config.authType === 'custom' && (
                                                    <>
                                                        <p className="text-xs text-secondary mb-1">Type: <span className="text-primary">Custom Header</span></p>
                                                        {config.auth === 'header' ? (
                                                            <>
                                                                <p className="text-xs text-muted mt-2">Header:</p>
                                                                <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 border border-subtle">
                                                                    {config.customHeaderName}: {config.customHeaderValue}
                                                                </code>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <p className="text-xs text-muted mt-2">Query Parameter:</p>
                                                                <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 border border-subtle">
                                                                    ?{config.customHeaderName}={config.customHeaderValue}
                                                                </code>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                {/* OAuth2 */}
                                                {config.authType === 'oauth2' && config.credentialId && (
                                                    <>
                                                        <p className="text-xs text-secondary mb-1">Type: <span className="text-primary">OAuth 2.0</span></p>
                                                        {selectedCredential ? (
                                                            <>
                                                                {config.auth === 'header' ? (
                                                                    <>
                                                                        <p className="text-xs text-muted mt-2">Header:</p>
                                                                        <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 break-all border border-subtle">
                                                                            Authorization: Bearer {selectedCredential.data?.accessToken?.replace('Bearer ', '') || '[TOKEN NOT FOUND]'}
                                                                        </code>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <p className="text-xs text-muted mt-2">Query Parameter:</p>
                                                                        <code className="text-xs text-primary bg-surface px-2 py-1 rounded block mt-1 break-all border border-subtle">
                                                                            ?access_token={selectedCredential.data?.accessToken?.replace('Bearer ', '') || '[TOKEN NOT FOUND]'}
                                                                        </code>
                                                                    </>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <p className="text-xs text-muted mt-2">Loading credential...</p>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : testError ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <svg className="w-12 h-12 text-danger mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <p className="text-danger font-medium">{testError}</p>
                                </div>
                        ) : (testOutput || outputData) ? (
                            <div className="space-y-2">
                                {activeTab === 'schema' ? (
                                    <div className="bg-surface p-3 rounded-lg border border-subtle">
                                        <JSONViewer
                                            data={testOutput || outputData}
                                            collapsedPaths={new Set()}
                                            onToggleCollapse={() => {}}
                                        />
                                    </div>
                                ) : (
                                    <pre className="text-xs text-secondary whitespace-pre-wrap font-mono">
                                        {JSON.stringify(testOutput || outputData, null, 2)}
                                    </pre>
                                )}
                            </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center text-muted text-sm">
                                    <svg className="w-12 h-12 mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    <p>Click "Test step" to start listening for webhook requests</p>
                                </div>
                            )}
                    </div>
                </div>
            </div>
        </ConfigModalLayout>

        {/* Credential Modal */}
        <CredentialModal
            isOpen={showCredentialModal}
            onClose={() => setShowCredentialModal(false)}
            onSave={handleCredentialSaved}
            credentialType={selectedCredentialType}
        />
        </>
    );
};

// Removed JsonViewer component - now using JSONViewer from shared components

export default WebhookConfigModal;

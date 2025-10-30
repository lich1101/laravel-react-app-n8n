import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import VariableInput from './VariableInput';
import CredentialModal from './CredentialModal';

const WebhookConfigModal = ({ node, onSave, onClose, workflowId, onTestResult, onRename }) => {
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
        ...node?.data?.config,
    });

    const [isListening, setIsListening] = useState(false);
    const [testOutput, setTestOutput] = useState(null);
    const [testError, setTestError] = useState(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [selectedCredentialType, setSelectedCredentialType] = useState('bearer');
    const [pathError, setPathError] = useState(null);
    const [isCheckingPath, setIsCheckingPath] = useState(false);
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
        if (!config.path) {
            setTestError('Please enter a webhook path first');
            return;
        }

        try {
            setIsListening(true);
            setTestOutput(null);
            setTestError(null);

            // Start listening on the backend
            const response = await axios.post(`/workflows/${workflowId}/webhook-test-listen`, {
                node_id: node?.id,
                path: config.path,
                method: config.method,
                auth: config.auth,
                auth_type: config.authType,
                auth_config: {
                    apiKeyValue: config.apiKeyValue,
                    username: config.username,
                    password: config.password,
                    apiKeyName: config.apiKeyName,
                    customHeaderName: config.customHeaderName,
                    customHeaderValue: config.customHeaderValue,
                }
            });

            testRunIdRef.current = response.data.test_run_id;

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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleClose}>
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🔗</span>
                        <h2 
                            className="text-xl font-semibold text-white cursor-pointer hover:text-blue-400 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename) {
                                    onRename();
                                }
                            }}
                            title="Click để đổi tên node"
                        >
                            {node?.data?.customName || 'Webhook'}
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={isListening ? handleStopListening : handleTestStep}
                            disabled={isListening && !testOutput}
                            className={`px-4 py-2 rounded text-sm font-medium ${
                                isListening
                                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                        >
                            {isListening ? 'Stop Listening' : 'Test step'}
                        </button>
                        <button 
                            onClick={handleClose} 
                            disabled={pathError}
                            className={`${
                                pathError 
                                    ? 'text-gray-600 cursor-not-allowed' 
                                    : 'text-gray-400 hover:text-white'
                            }`}
                            title={pathError ? 'Phải sửa lỗi path trước khi đóng' : 'Close'}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex h-[calc(90vh-80px)]">
                    {/* Left Panel - Config */}
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        <div>
                            {/* Webhook URL */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Webhook URL</label>
                                <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300">
                                    {config.method} {baseUrl}/api/webhook/{config.path || 'your-path'}
                                </div>
                            </div>

                            {/* HTTP Method */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-300 mb-2">HTTP Method</label>
                                <select
                                    value={config.method}
                                    onChange={(e) => setConfig({ ...config, method: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
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
                                <label className="block text-sm font-medium text-gray-300 mb-2">Path</label>
                                <div className="relative">
                                    <VariableInput
                                        type="text"
                                        value={config.path}
                                        onChange={(e) => setConfig({ ...config, path: e.target.value })}
                                        placeholder="test"
                                        className={`w-full bg-gray-900 border rounded px-3 py-2 text-white ${
                                            pathError ? 'border-red-500' : 'border-gray-700'
                                        }`}
                                    />
                                    {isCheckingPath && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                {pathError && (
                                    <p className="mt-2 text-sm text-red-400 flex items-start">
                                        <svg className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                        <span>{pathError}</span>
                                    </p>
                                )}
                            </div>

                            {/* Authentication */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Authentication</label>
                                <select
                                    value={config.auth}
                                    onChange={(e) => setConfig({ ...config, auth: e.target.value, authType: 'bearer' })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
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
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Authentication Type</label>
                                        <select
                                            value={config.authType}
                                            onChange={(e) => setConfig({ ...config, authType: e.target.value })}
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
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
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Bearer Token Credential</label>
                                            <div className="flex space-x-2">
                                                <select
                                                    value={config.credentialId || ''}
                                                    onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
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
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedCredentialType('bearer');
                                                        setShowCredentialModal(true);
                                                    }}
                                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                                    title="Create new Bearer Token"
                                                >
                                                    + New
                                                </button>
                                            </div>
                                            {!config.credentialId && (
                                                <p className="mt-1 text-xs text-orange-400">
                                                    ⚠️ Please select a credential or create a new one
                                                </p>
                                            )}
                                            {config.credentialId && (
                                                <p className="mt-1 text-xs text-green-400">
                                                    ✓ Credential selected
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Basic Auth */}
                                    {config.authType === 'basic' && (
                                        <>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
                                                <input
                                                    type="text"
                                                    value={config.username}
                                                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                                                    placeholder="username"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                                                <input
                                                    type="password"
                                                    value={config.password}
                                                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                                                    placeholder="password"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* API Key */}
                                    {config.authType === 'apiKey' && (
                                        <>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">API Key Name</label>
                                                <input
                                                    type="text"
                                                    value={config.apiKeyName}
                                                    onChange={(e) => setConfig({ ...config, apiKeyName: e.target.value })}
                                                    placeholder="X-API-Key"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">API Key Value</label>
                                                <VariableInput
                                                    type="text"
                                                    value={config.apiKeyValue}
                                                    onChange={(e) => setConfig({ ...config, apiKeyValue: e.target.value })}
                                                    placeholder="your-api-key"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* Digest Auth */}
                                    {config.authType === 'digest' && (
                                        <>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
                                                <input
                                                    type="text"
                                                    value={config.username}
                                                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                                                    placeholder="username"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                                                <input
                                                    type="password"
                                                    value={config.password}
                                                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                                                    placeholder="password"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* OAuth 2.0 */}
                                    {config.authType === 'oauth2' && (
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-gray-300 mb-2">OAuth2 Credential</label>
                                            <div className="flex space-x-2">
                                                <select
                                                    value={config.credentialId || ''}
                                                    onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
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
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedCredentialType('oauth2');
                                                        setShowCredentialModal(true);
                                                    }}
                                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                                    title="Create new OAuth2 Credential"
                                                >
                                                    + New
                                                </button>
                                            </div>
                                            {!config.credentialId && (
                                                <p className="mt-1 text-xs text-orange-400">
                                                    ⚠️ Please select an OAuth2 credential or create a new one
                                                </p>
                                            )}
                                            {config.credentialId && (
                                                <p className="mt-1 text-xs text-green-400">
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
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Header Name</label>
                                                <input
                                                    type="text"
                                                    value={config.customHeaderName}
                                                    onChange={(e) => setConfig({ ...config, customHeaderName: e.target.value })}
                                                    placeholder="X-Custom-Header"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Header Value</label>
                                                <VariableInput
                                                    type="text"
                                                    value={config.customHeaderValue}
                                                    onChange={(e) => setConfig({ ...config, customHeaderValue: e.target.value })}
                                                    placeholder="header value"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {/* Respond */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Respond</label>
                                <select
                                    value={config.respond}
                                    onChange={(e) => setConfig({ ...config, respond: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                >
                                    <option value="immediately">Immediately</option>
                                    <option value="when_last_node_finishes">When last node finishes</option>
                                </select>
                            </div>

                        </div>
                    </div>

                    {/* Right Panel - Output */}
                    <div className="w-1/2 border-l border-gray-700 px-6 py-4 bg-gray-900 flex flex-col">
                        <h3 className="text-sm font-medium text-gray-400 mb-4">OUTPUT</h3>
                        <div className="flex-1 bg-gray-950 rounded p-4 overflow-y-auto">
                            {isListening ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <div className="animate-pulse mb-4">
                                        <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                    </div>
                                    <p className="text-green-400 font-medium mb-2">Listening for webhook...</p>
                                    <p className="text-gray-400 text-sm">Send a request to the webhook URL above</p>
                                    <div className="mt-4 bg-gray-900 rounded p-3 text-left max-w-md">
                                        <p className="text-xs text-gray-400 mb-1">Test URL:</p>
                                        <code className="text-xs text-green-400 break-all">
                                            {config.method} {baseUrl}/api/webhook-test/{config.path}
                                        </code>
                                    </div>
                                </div>
                            ) : testError ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <svg className="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <p className="text-red-400 font-medium">{testError}</p>
                                </div>
                            ) : testOutput ? (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-gray-400 mb-2">Request Data:</h4>
                                    <JsonViewer data={testOutput} />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 text-sm">
                                    <svg className="w-12 h-12 mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    <p>Click "Test step" to start listening for webhook requests</p>
                                </div>
                            )}
                        </div>
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
        </>
    );
};

// JSON Viewer Component with Syntax Highlighting
const JsonViewer = ({ data }) => {
    const renderValue = (value, key = null, indent = 0) => {
        const indentSpaces = '  '.repeat(indent);
        
        if (value === null) {
            return <span className="text-gray-500">null</span>;
        }
        
        if (typeof value === 'string') {
            return <span className="text-green-400">"{value}"</span>;
        }
        
        if (typeof value === 'number') {
            return <span className="text-blue-400">{value}</span>;
        }
        
        if (typeof value === 'boolean') {
            return <span className="text-purple-400">{value.toString()}</span>;
        }
        
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return <span className="text-gray-400">[]</span>;
            }
            return (
                <div>
                    <span className="text-gray-400">[</span>
                    {value.map((item, index) => (
                        <div key={index} className="ml-4">
                            {renderValue(item, null, indent + 1)}
                            {index < value.length - 1 && <span className="text-gray-400">,</span>}
                        </div>
                    ))}
                    <div>{indentSpaces}<span className="text-gray-400">]</span></div>
                </div>
            );
        }
        
        if (typeof value === 'object') {
            const entries = Object.entries(value);
            if (entries.length === 0) {
                return <span className="text-gray-400">{'{}'}</span>;
            }
            return (
                <div>
                    <span className="text-gray-400">{'{'}</span>
                    {entries.map(([k, v], index) => (
                        <div key={k} className="ml-4">
                            <span className="text-cyan-400">"{k}"</span>
                            <span className="text-gray-400">: </span>
                            {renderValue(v, k, indent + 1)}
                            {index < entries.length - 1 && <span className="text-gray-400">,</span>}
                        </div>
                    ))}
                    <div>{indentSpaces}<span className="text-gray-400">{'}'}</span></div>
                </div>
            );
        }
        
        return <span className="text-gray-300">{String(value)}</span>;
    };

    return (
        <pre className="text-xs bg-gray-900 p-4 rounded border border-gray-700 overflow-x-auto font-mono">
            {renderValue(data)}
        </pre>
    );
};

export default WebhookConfigModal;

import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import VariableInput from './VariableInput';

const WebhookConfigModal = ({ node, onSave, onClose, workflowId, onTestResult }) => {
    const [config, setConfig] = useState({
        method: 'POST',
        path: '',
        auth: 'none',
        authType: 'bearer', // bearer, basic, apiKey, digest, oauth2, custom
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
    const pollingIntervalRef = useRef(null);
    const testRunIdRef = useRef(null);

    useEffect(() => {
        // Cleanup polling on unmount
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    const handleClose = async () => {
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span>Webhook</span>
                    </h2>
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
                        <button onClick={handleClose} className="text-gray-400 hover:text-white">
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
                                <VariableInput
                                    type="text"
                                    value={config.path}
                                    onChange={(e) => setConfig({ ...config, path: e.target.value })}
                                    placeholder="test"
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                />
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
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Bearer Token</label>
                                            <VariableInput
                                                type="text"
                                                value={config.apiKeyValue}
                                                onChange={(e) => setConfig({ ...config, apiKeyValue: e.target.value })}
                                                placeholder="Bearer token..."
                                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                            />
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
                                            <label className="block text-sm font-medium text-gray-300 mb-2">OAuth Token</label>
                                            <VariableInput
                                                type="text"
                                                value={config.apiKeyValue}
                                                onChange={(e) => setConfig({ ...config, apiKeyValue: e.target.value })}
                                                placeholder="OAuth access token"
                                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                                            />
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

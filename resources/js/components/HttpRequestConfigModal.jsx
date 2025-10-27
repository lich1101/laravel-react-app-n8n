import React, { useState, useEffect } from 'react';
import VariableInput from './VariableInput';

function HttpRequestConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes }) {
    const [config, setConfig] = useState({
        method: 'GET',
        url: '',
        auth: 'none',
        credential: '',
        queryParams: [],
        headers: [],
        bodyType: 'json',
        bodyContent: '',
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [selectedVariable, setSelectedVariable] = useState(null);

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
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

    // Render draggable JSON with clickable values
    const renderDraggableJSON = (obj, prefix = '', indent = 0) => {
        if (obj === null || obj === undefined) {
            return <span className="text-gray-500">null</span>;
        }

        if (Array.isArray(obj)) {
            return (
                <div className="ml-2">
                    [
                    <div className="ml-4 space-y-1">
                        {obj.map((item, index) => (
                            <div key={index} className="flex items-start">
                                <span className="text-gray-400">{index}:</span>
                                <span className="ml-1">{renderDraggableJSON(item, `${prefix}[${index}]`, indent + 1)}</span>
                                {index < obj.length - 1 && <span className="text-gray-400">,</span>}
                            </div>
                        ))}
                    </div>
                    ]
                </div>
            );
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            return (
                <div className="ml-2">
                    {'{'}
                    <div className="ml-4 space-y-1">
                        {keys.map((key, index) => {
                            const value = obj[key];
                            const isPrimitive = typeof value !== 'object' || value === null;
                            const variablePath = prefix ? `${prefix}.${key}` : key;

                            return (
                                <div key={key} className="flex items-start">
                                    <span className="text-blue-400">"{key}"</span>
                                    <span className="text-gray-400">:</span>
                                    <span className="ml-1">
                                        {isPrimitive ? (
                                            <div className="inline-flex items-center gap-1">
                                                <span className="text-green-400 font-mono text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 rounded border border-green-300 dark:border-green-700">
                                                    {typeof value === 'string' ? `"${value}"` : String(value)}
                                                </span>
                                                <button
                                                    className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded border border-blue-600 hover:border-blue-700 shadow-sm transition-colors"
                                                    draggable="true"
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                                        e.dataTransfer.effectAllowed = 'copy';
                                                    }}
                                                    onClick={() => {
                                                        const variable = `{{${variablePath}}}`;
                                                        setSelectedVariable(variable);
                                                        console.log('Use button clicked, variable:', variable);

                                                        // Show a simple prompt for now
                                                        const result = prompt(`Variable: ${variable}\n\nPaste this into any input field:`, variable);
                                                        if (result) {
                                                            // Find the currently focused input
                                                            const activeElement = document.activeElement;
                                                            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                                                                const input = activeElement;
                                                                const start = input.selectionStart;
                                                                const end = input.selectionEnd;
                                                                const currentValue = input.value;
                                                                const newValue = currentValue.substring(0, start) + result + currentValue.substring(end);

                                                                // Find which field this is
                                                                if (input.name === 'url') {
                                                                    setConfig(prev => ({ ...prev, url: newValue }));
                                                                } else if (input.name === 'credential') {
                                                                    setConfig(prev => ({ ...prev, credential: newValue }));
                                                                } else if (input.name && input.name.startsWith('queryParam')) {
                                                                    const [type, index, field] = input.name.split('-');
                                                                    updateParam(type, parseInt(index), field, newValue);
                                                                } else if (input.name && input.name.startsWith('header')) {
                                                                    const [type, index, field] = input.name.split('-');
                                                                    updateParam(type, parseInt(index), field, newValue);
                                                                }

                                                                input.focus();
                                                                setTimeout(() => {
                                                                    input.setSelectionRange(start + result.length, start + result.length);
                                                                }, 0);
                                                            } else {
                                                                alert(`Copy this variable: ${variable}`);
                                                            }
                                                        }
                                                    }}
                                                    title={`Drag to drop or click to insert {{${variablePath}}}`}
                                                >
                                                    Use
                                                </button>
                                            </div>
                                        ) : (
                                            renderDraggableJSON(value, variablePath, indent + 1)
                                        )}
                                    </span>
                                    {index < keys.length - 1 && <span className="text-gray-400">,</span>}
                                </div>
                            );
                        })}
                    </div>
                    {'}'}
                </div>
            );
        }

        return <span className="text-green-400 font-mono">{typeof obj === 'string' ? `"${obj}"` : String(obj)}</span>;
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

    const handleSave = () => {
        onSave(config);
        // Optional: close modal after save
        // onClose();
    };

    const handleClose = () => {
        // Auto-save config when closing
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

                // Save test result to output data
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        HTTP Request Configuration
                    </h2>
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
                            <h3 className="font-semibold text-gray-900 dark:text-white">INPUT</h3>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {inputData && inputData.length > 0 ? (
                                <div className="space-y-2">
                                    {inputData.map((data, index) => (
                                        <div key={index} className="mb-3">
                                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                                                Input {index + 1}:
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-950 p-2 rounded border border-gray-200 dark:border-gray-700">
                                                {renderDraggableJSON(data, `input-${index}`)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    <p className="text-center">
                                        This node can only receive input data if you connect it to another node.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Configuration */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-2">
                            <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                            <button className="px-4 py-1.5 text-gray-600 dark:text-gray-400 text-sm font-medium">
                                Settings
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {/* Method */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Method
                                </label>
                                <select
                                    value={config.method}
                                    onChange={(e) => setConfig({ ...config, method: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    URL
                                </label>
                                <VariableInput
                                    type="text"
                                    name="url"
                                    value={config.url}
                                    onChange={(e) => setConfig({ ...config, url: e.target.value })}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const variable = e.dataTransfer.getData('text/plain');
                                        const start = e.target.selectionStart;
                                        const end = e.target.selectionEnd;
                                        const currentValue = e.target.value;
                                        const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                        setConfig(prev => ({ ...prev, url: newValue }));
                                        setTimeout(() => {
                                            e.target.setSelectionRange(start + variable.length, start + variable.length);
                                        }, 0);
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    placeholder="https://example.com/api"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Authentication */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Authentication
                                </label>
                                <select
                                    value={config.auth}
                                    onChange={(e) => setConfig({ ...config, auth: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="none">None</option>
                                    <option value="basic">Basic Auth</option>
                                    <option value="bearer">Bearer Token</option>
                                    <option value="custom">Custom Header</option>
                                </select>
                            </div>

                            {(config.auth !== 'none') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Credential
                                    </label>
                                    <VariableInput
                                        type="text"
                                        name="credential"
                                        value={config.credential}
                                        onChange={(e) => setConfig({ ...config, credential: e.target.value })}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const variable = e.dataTransfer.getData('text/plain');
                                            const start = e.target.selectionStart;
                                            const end = e.target.selectionEnd;
                                            const currentValue = e.target.value;
                                            const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                            setConfig(prev => ({ ...prev, credential: newValue }));
                                            setTimeout(() => {
                                                e.target.setSelectionRange(start + variable.length, start + variable.length);
                                            }, 0);
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        placeholder="Enter credential"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            )}

                            {/* Query Parameters */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                {config.queryParams.map((param, index) => (
                                    <div key={index} className="flex space-x-2 mb-2">
                                        <input
                                            type="text"
                                            name={`queryParam-${index}-name`}
                                            placeholder="Name"
                                            value={param.name}
                                            onChange={(e) => updateParam('queryParams', index, 'name', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('queryParams', index, 'name', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            type="text"
                                            name={`queryParam-${index}-value`}
                                            placeholder="Value"
                                            value={param.value}
                                            onChange={(e) => updateParam('queryParams', index, 'value', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('queryParams', index, 'value', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <button
                                            onClick={() => removeParam('queryParams', index)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {config.queryParams.length > 0 && (
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
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                {config.headers.map((header, index) => (
                                    <div key={index} className="flex space-x-2 mb-2">
                                        <input
                                            type="text"
                                            name={`header-${index}-name`}
                                            placeholder="Name"
                                            value={header.name}
                                            onChange={(e) => updateParam('headers', index, 'name', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('headers', index, 'name', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            type="text"
                                            name={`header-${index}-value`}
                                            placeholder="Value"
                                            value={header.value}
                                            onChange={(e) => updateParam('headers', index, 'value', e.target.value)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const variable = e.dataTransfer.getData('text/plain');
                                                const start = e.target.selectionStart;
                                                const end = e.target.selectionEnd;
                                                const currentValue = e.target.value;
                                                const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                updateParam('headers', index, 'value', newValue);
                                                setTimeout(() => {
                                                    e.target.setSelectionRange(start + variable.length, start + variable.length);
                                                }, 0);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <button
                                            onClick={() => removeParam('headers', index)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {config.headers.length > 0 && (
                                    <button
                                        onClick={() => addParam('headers')}
                                        className="text-blue-600 hover:text-blue-700 text-sm"
                                    >
                                        + Add Header
                                    </button>
                                )}
                            </div>

                            {/* Body */}
                            {['POST', 'PUT', 'PATCH'].includes(config.method) && (
                                <div>
                                    <div className="flex items-center mb-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
                                            Send Body
                                        </label>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.bodyType !== 'none'}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setConfig({ ...config, bodyType: 'json' });
                                                    } else {
                                                        setConfig({ ...config, bodyType: 'none' });
                                                    }
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                    {config.bodyType !== 'none' && (
                                        <>
                                            <select
                                                value={config.bodyType}
                                                onChange={(e) => setConfig({ ...config, bodyType: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-2"
                                            >
                                                <option value="json">JSON</option>
                                                <option value="form">Form-Data</option>
                                                <option value="urlencoded">Form Urlencoded</option>
                                                <option value="raw">Raw</option>
                                            </select>
                                            <textarea
                                                value={config.bodyContent}
                                                onChange={(e) => setConfig({ ...config, bodyContent: e.target.value })}
                                                placeholder="Enter body content"
                                                rows={5}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                            />
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Info */}
                            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                                You can view the raw requests this node makes in your browser's developer console.
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">OUTPUT</h3>
                            {onTest && (
                                <button
                                    onClick={handleTest}
                                    disabled={isTesting || !config.url}
                                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                                >
                                    {isTesting ? 'Testing...' : 'Test step'}
                                </button>
                            )}
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                    <p className="text-center">Testing request...</p>
                                </div>
                            ) : testResults ? (
                                <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                    {JSON.stringify(testResults, null, 2)}
                                </pre>
                            ) : outputData ? (
                                <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                    {JSON.stringify(outputData, null, 2)}
                                </pre>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
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
                </div>
            </div>
        </div>
    );
}

export default HttpRequestConfigModal;

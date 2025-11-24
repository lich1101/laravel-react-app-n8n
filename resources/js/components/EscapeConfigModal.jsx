import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import ExpandableTextarea from './ExpandableTextarea';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';

function EscapeConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
    // Add readOnly support
    const readOnly = false; // TODO: Get from props
    const [config, setConfig] = useState({
        fields: [
            { name: '', value: '' }
        ],
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const testAbortControllerRef = useRef(null);
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
    }, [node]);


    const handleSave = () => {
        onSave(config);
    };

    const handleClose = () => {
        // Stop test if currently testing
        if (isTesting && testAbortControllerRef.current) {
            handleStopTest();
        }
        handleSave();
        onClose();
    };

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
                    error: error.message || 'An error occurred',
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

    const getDisplayOutput = () => {
        if (testResults) return testResults;
        if (outputData) return outputData;
        return null;
    };

    // Add new field
    const addField = () => {
        setConfig({
            ...config,
            fields: [...config.fields, { name: '', value: '' }]
        });
    };

    // Update field
    const updateField = (index, key, value) => {
        const newFields = [...config.fields];
        newFields[index][key] = value;
        setConfig({ ...config, fields: newFields });
    };

    // Remove field
    const removeField = (index) => {
        const newFields = config.fields.filter((_, i) => i !== index);
        // Always keep at least one field
        if (newFields.length === 0) {
            newFields.push({ name: '', value: '' });
        }
        setConfig({ ...config, fields: newFields });
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
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500">{obj.length} items</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-4 space-y-1">
                            {obj.map((item, index) => (
                                <div key={index} className="border-l-2 border-gray-200 pl-3">
                                    <div className="text-xs text-gray-500 mb-1">[{index}]</div>
                                    {renderDraggableJSON(item, buildArrayPath(currentPrefix, index), indent + 1)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            const basePath = currentPrefix || prefix;
            const baseCollapsed = collapsedPaths.has(basePath);
            return (
                <div className="space-y-1">
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
                        onClick={() => toggleCollapse(basePath)}
                    >
                        <span className="text-gray-500 text-xs">
                            {baseCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${getTypeInfo(obj).color}-100 text-${getTypeInfo(obj).color}-700 rounded font-mono`}>
                            {getTypeInfo(obj).icon}
                        </span>
                        <span className="text-xs text-gray-500">{keys.length} keys</span>
                    </div>
                    {!baseCollapsed && (
                        <div className="ml-4 space-y-1">
                            {keys.map((key) => {
                                const value = obj[key];
                                const variablePath = buildVariablePath(basePath, key);
                                const isPrimitive = value === null || value === undefined || (typeof value !== 'object' && !Array.isArray(value));
                                const childCollapsed = collapsedPaths.has(variablePath);
                                const typeInfo = getTypeInfo(value);

                                return (
                                    <div key={key} className="group">
                                        <div className="flex items-start gap-2 py-1 hover:bg-gray-100 rounded px-2 -mx-2">
                                            {!isPrimitive && (
                                                <span 
                                                    className="text-gray-500 text-xs cursor-pointer mt-1"
                                                    onClick={() => toggleCollapse(variablePath)}
                                                >
                                                    {childCollapsed ? '▶' : '▼'}
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
                                                    <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono flex-shrink-0`}>
                                                        {typeInfo.icon}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-700 truncate">
                                                        {key}
                                                    </span>
                                                    {!isPrimitive && childCollapsed && (
                                                        <span className="text-xs text-gray-500">
                                                            {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {isPrimitive && (
                                                    <div 
                                                        className="mt-1 text-xs text-gray-600 font-mono break-all cursor-move"
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

                                        {!isPrimitive && !childCollapsed && (
                                            <div className="ml-6 mt-1 border-l-2 border-gray-200 pl-3">
                                                {renderDraggableJSON(value, variablePath, indent + 1)}
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

        const typeInfo = getTypeInfo(obj);
        return (
            <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                    {typeInfo.icon}
                </span>
                <span className="text-xs text-gray-600 font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">⚡</span>
                        <h2 
                            className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename) {
                                    onRename();
                                }
                            }}
                            title="Click để đổi tên node"
                        >
                            {node?.data?.customName || 'Escape'}
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
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
                                    {inputViewMode === 'schema' && Object.entries(inputData).map(([nodeName, data]) => {
                                        return (
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
                                        );
                                    })}
                                    
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
                                        Kéo thả fields vào Value để escape
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Fields Configuration */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <button className="px-4 py-1.5 bg-yellow-600 text-white rounded text-sm font-medium">
                                Fields to Escape & Set
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            <div className="text-sm text-gray-700 mb-4">
                                <p className="font-medium mb-2">💡 Escape Rules:</p>
                                <div className="text-xs bg-gray-100 p-2 rounded space-y-1">
                                    <p>• Backslash → \\\\</p>
                                    <p>• Quotes → \\"</p>
                                    <p>• Newline → \\n</p>
                                    <p>• Tab → \\t</p>
                                    <p>• Multiple spaces → single space</p>
                                    <p>• Trim whitespace</p>
                                </div>
                            </div>

                            {/* Fields List */}
                            <div className="space-y-3">
                                {config.fields.map((field, index) => (
                                    <div key={index} className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-semibold text-gray-700">
                                                Field {index + 1}
                                            </span>
                                            {config.fields.length > 1 && (
                                                <button
                                                    onClick={() => removeField(index)}
                                                    className="text-red-600 hover:text-red-700"
                                                    title="Remove field"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        
                                        {/* Field Name */}
                                        <div className="mb-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                Output Field Name
                                            </label>
                                            <ExpandableTextarea
                                                value={field.name}
                                                onChange={(newValue) => updateField(index, 'name', newValue)}
                                                placeholder="e.g., body.content or systemMessage"
                                                rows={1}
                                                inputData={inputData}
                                            />
                                            <p className="mt-1 text-xs text-gray-500">
                                                Tên field trong output (support nested: a.b.c)
                                            </p>
                                        </div>

                                        {/* Field Value */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                Value (will be escaped)
                                            </label>
                                            <ExpandableTextarea
                                                value={field.value}
                                                onChange={(newValue) => updateField(index, 'value', newValue)}
                                                placeholder="Drag variables or type content"
                                                rows={4}
                                                inputData={inputData}
                                            />
                                            <p className="mt-1 text-xs text-gray-500">
                                                💡 Dùng {`{{variable}}`} hoặc kéo thả từ INPUT
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add Field Button */}
                            <button
                                onClick={addField}
                                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-yellow-500 hover:text-yellow-600 transition-colors"
                            >
                                + Add Field
                            </button>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-gray-900">OUTPUT</h3>
                                </div>
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
                            <div className="flex items-center gap-2">
                                {onTest && (
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
                                                disabled={config.fields.every(f => !f.name || !f.value)}
                                                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                                            >
                                                Test step
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 mb-4"></div>
                                    <p className="text-center">Escaping & processing fields...</p>
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
                                        Click "Test step" để xem output sau khi escape
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

export default EscapeConfigModal;


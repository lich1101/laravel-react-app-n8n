import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';

function CodeConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        language: 'javascript',
        code: `// Access input data from previous nodes
const item = $input.first();    // Get first input
const allItems = $input.all();  // Get all inputs as array
// const item2 = $input.item(1);  // Get specific input by index

// You can access fields directly
// Example: item.choices[0].message.content

// Process your data
const result = {
  message: 'Hello from Code node',
  processedData: item,
  totalInputs: allItems.length
};

// Must return output for next nodes
return result;`,
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
                    error: error.message || 'An error occurred while executing code',
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
                    <span className="text-xs px-1.5 py-0.5 bg-surface-muted text-secondary rounded">null</span>
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
                        className="flex items-center gap-2 cursor-pointer hover:bg-surface-muted rounded px-1 -mx-1"
                        onClick={() => toggleCollapse(collapseKey)}
                    >
                        <span className="text-muted text-xs">
                            {isCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-muted">{obj.length} items</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-4 space-y-1">
                            {obj.map((item, index) => {
                                const itemPath = buildArrayPath(currentPrefix, index);
                                return (
                                    <div key={index} className="border-l border-subtle opacity-70 pl-3">
                                        <div className="text-xs text-muted mb-1">[{index}]</div>
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
                        const variablePath = buildVariablePath(currentPrefix, key);
                        const typeInfo = getTypeInfo(value);
                        const isCollapsed = collapsedPaths.has(variablePath);

                        return (
                            <div key={key} className="group">
                                <div className="flex items-start gap-2 py-1 hover:bg-surface-muted rounded px-2 -mx-2 transition-colors">
                                    {!isPrimitive && (
                                        <span 
                                            className="text-muted text-xs cursor-pointer mt-1"
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
                                            <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono flex-shrink-0`}>
                                                {typeInfo.icon}
                                            </span>
                                            <span className="text-sm font-medium text-secondary truncate">
                                                {key}
                                            </span>
                                            {!isPrimitive && isCollapsed && (
                                                <span className="text-xs text-muted">
                                                    {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {isPrimitive && (
                                            <div 
                                                className="mt-1 text-xs text-secondary font-mono break-all cursor-move"
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
                                        className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-primary-color text-white rounded transition-opacity flex-shrink-0 shadow-card"
                                        title="Copy variable"
                                    >
                                        📋
                                    </button>
                                </div>

                                {!isPrimitive && !isCollapsed && (
                                    <div className="ml-6 mt-1 border-l border-subtle opacity-70 pl-3">
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
                <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                    {typeInfo.icon}
                </span>
                <span className="text-xs text-secondary font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-surface-elevated border border-subtle rounded-3xl shadow-xl w-full max-w-[90vw] h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="border-b border-subtle px-6 py-4 flex items-center justify-between bg-surface">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">💻</span>
                        <h2 
                            className={`text-xl font-semibold text-primary ${!readOnly ? 'cursor-pointer hover:text-primary/80' : 'cursor-default'} transition-colors flex items-center gap-2`}
                            onClick={() => {
                                if (onRename && !readOnly) {
                                    onRename();
                                }
                            }}
                            title={readOnly ? "Read-only mode" : "Click để đổi tên node"}
                        >
                            {node?.data?.customName || 'Code'}
                            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-muted hover:text-primary transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel - INPUT */}
                    <div className="w-1/3 border-r border-subtle flex flex-col bg-surface">
                        <div className="bg-surface-muted px-4 py-3 border-b border-subtle">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-primary">INPUT</h3>
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
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-subtle">
                                                    <span className="text-xs font-semibold text-secondary">
                                                        {nodeName}
                                                    </span>
                                                    <span className="text-xs px-2 py-0.5 bg-primary-soft text-primary rounded">
                                                        {Object.keys(data || {}).length} fields
                                                    </span>
                                                </div>
                                                <div className="bg-surface p-3 rounded-lg border border-subtle shadow-inner">
                                                    {renderDraggableJSON(data, nodeName)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {inputViewMode === 'json' && Object.entries(inputData).map(([nodeName, data]) => (
                                        <div key={nodeName}>
                                            <div className="text-xs font-semibold text-secondary mb-2">
                                                {nodeName}:
                                            </div>
                                            <pre className="text-xs bg-surface p-3 rounded border border-subtle overflow-auto whitespace-pre-wrap text-secondary">
                                                {JSON.stringify(data, null, 2)}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted">
                                    <svg className="w-16 h-16 mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    <p className="text-center text-sm">
                                        Connect this node to receive input data
                                    </p>
                                    <p className="text-center text-xs mt-2 text-muted">
                                        Access via $input.first() hoặc $input.all()
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Code Editor */}
                    <div className="w-1/3 flex flex-col bg-surface">
                        <div className="bg-surface-muted px-4 py-3 border-b border-subtle">
                            <button className="btn text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-card transition-colors">
                                JavaScript Code
                            </button>
                        </div>
                        <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
                            {/* Language Selector */}
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    Language
                                </label>
                                <select
                                    value={config.language}
                                    onChange={(e) => setConfig({ ...config, language: e.target.value })}
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-subtle rounded-lg bg-surface text-primary shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="javascript">JavaScript</option>
                                </select>
                            </div>

                            {/* Code Editor */}
                            <div className="flex-1 flex flex-col">
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    JavaScript Code *
                                </label>
                                <textarea
                                    value={config.code}
                                    onChange={(e) => setConfig({ ...config, code: e.target.value })}
                                    placeholder="// Write your JavaScript code here..."
                                    disabled={readOnly}
                                    className="flex-1 px-3 py-3 border border-subtle rounded-xl bg-surface text-secondary font-mono text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ minHeight: '400px', fontFamily: 'Monaco, Menlo, monospace' }}
                                />
                            </div>

                            {/* Help Text */}
                            <div className="text-xs text-muted space-y-3">
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 space-y-2 text-secondary">
                                    <p><strong>💡 Input Helper:</strong></p>
                                    <p>• <code className="bg-surface-muted px-1 rounded">$input.first()</code> - Lấy input đầu tiên</p>
                                    <p>• <code className="bg-surface-muted px-1 rounded">$input.all()</code> - Lấy tất cả inputs (array)</p>
                                    <p>• <code className="bg-surface-muted px-1 rounded">$input.item(0)</code> - Lấy input theo index</p>
                                </div>
                                
                                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 space-y-2 text-secondary">
                                    <p><strong>✅ Example:</strong></p>
                                    <pre className="bg-surface text-secondary border border-subtle rounded-lg p-3 text-xs overflow-x-auto shadow-inner">
{`const item = $input.first();
const text = item.choices[0].message.content;

return {
  processedText: text.toUpperCase(),
  length: text.length
};`}
                                    </pre>
                                </div>
                                
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-secondary">
                                    <p><strong>⚠️ Lưu ý:</strong></p>
                                    <p>• Code chạy trên <strong>Node.js v18</strong></p>
                                    <p>• Phải có <code className="bg-surface-muted px-1 rounded">return</code> để trả output</p>
                                    <p>• Support async/await</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col bg-surface">
                        <div className="bg-surface-muted px-4 py-3 border-b border-subtle">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-primary">OUTPUT</h3>
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
                                {onTest && !readOnly && (
                                    <>
                                        {isTesting ? (
                                            <button
                                                onClick={handleStopTest}
                                                className="btn text-sm px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                                            >
                                                Stop step
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleTest}
                                                disabled={!config.code}
                                                className="btn text-sm px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white disabled:bg-surface-muted disabled:text-muted disabled:cursor-not-allowed transition-colors"
                                            >
                                                Test step
                                            </button>
                                        )}
                                    </>
                                )}
                                {readOnly && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-medium">
                                        📖 Viewing execution history (Read-only)
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-color mb-4"></div>
                                    <p className="text-center">Executing JavaScript code...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <div className="relative">
                                    {outputViewMode === 'schema' && (
                                        <div className="bg-surface p-3 rounded-lg border border-subtle shadow-inner">
                                            {renderDraggableJSON(getDisplayOutput(), 'output')}
                                        </div>
                                    )}
                                    
                                    {outputViewMode === 'json' && (
                                        <pre className="text-xs bg-surface p-3 rounded border border-subtle overflow-auto whitespace-pre-wrap text-secondary shadow-inner">
                                            {JSON.stringify(getDisplayOutput(), null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted">
                                    <svg className="w-16 h-16 mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-center">
                                        Click "Test step" để execute code và xem kết quả
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

export default CodeConfigModal;


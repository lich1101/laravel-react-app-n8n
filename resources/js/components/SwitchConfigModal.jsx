import React, { useState, useEffect, useRef } from 'react';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';
import ExpandableTextarea from './ExpandableTextarea';

// Operators for Switch
const OPERATORS = [
    { value: 'equal', label: 'is equal to' },
    { value: 'notEqual', label: 'is not equal to' },
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' },
    { value: 'startsWith', label: 'starts with' },
    { value: 'endsWith', label: 'ends with' },
    { value: 'regex', label: 'matches regex' },
    { value: 'exists', label: 'exists' },
    { value: 'notExists', label: 'does not exist' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
];

function SwitchConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
    const [config, setConfig] = useState({
        mode: 'rules',
        rules: [
            {
                value: '',
                operator: 'equal',
                value2: '',
                outputName: 'Output 1',
            }
        ],
        fallbackOutput: 'No Match',
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const testAbortControllerRef = useRef(null);
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
    }, [node]);

    const addRule = () => {
        setConfig({
            ...config,
            rules: [
                ...config.rules,
                {
                    value: '',
                    operator: 'equal',
                    value2: '',
                    outputName: `Output ${config.rules.length + 1}`,
                }
            ]
        });
    };

    const updateRule = (index, field, value) => {
        const newRules = [...config.rules];
        newRules[index][field] = value;
        setConfig({ ...config, rules: newRules });
    };

    const deleteRule = (index) => {
        if (config.rules.length <= 1) {
            alert('Phải có ít nhất 1 rule');
            return;
        }
        const newRules = config.rules.filter((_, i) => i !== index);
        setConfig({ ...config, rules: newRules });
    };

    const handleDragStart = (index) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        setDragOverIndex(null);
        
        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null);
            return;
        }

        const newRules = [...config.rules];
        const draggedRule = newRules[draggedIndex];
        
        // Remove dragged item
        newRules.splice(draggedIndex, 1);
        
        // Insert at new position
        newRules.splice(dropIndex, 0, draggedRule);
        
        setConfig({ ...config, rules: newRules });
        setDraggedIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

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
                    error: error.message || 'An error occurred while testing',
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

    const renderDraggableJSON = (obj, prefix = '', depth = 0) => {
        const currentPrefix = normalizeVariablePrefix(prefix, depth === 0);

        if (obj === null || obj === undefined) {
            return <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">null</span>;
        }

        if (Array.isArray(obj)) {
            const typeInfo = getTypeInfo(obj);
            const collapseKey = currentPrefix || prefix;
            const isCollapsed = collapsedPaths.has(collapseKey);
            return (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1" onClick={() => toggleCollapse(collapseKey)}>
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
                                    {renderDraggableJSON(item, buildArrayPath(currentPrefix, index), depth + 1)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            const typeInfo = getTypeInfo(obj);
            const basePath = currentPrefix || prefix;
            const baseCollapsed = collapsedPaths.has(basePath);

            if (keys.length === 0) {
                return <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">empty object</span>;
            }

            return (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1" onClick={() => toggleCollapse(basePath)}>
                        <span className="text-gray-500 text-xs">
                            {baseCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                            {typeInfo.icon}
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
                                                }}
                                                title={`Kéo thả để sử dụng {{${variablePath}}}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                                                        {typeInfo.icon}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-700 truncate">
                                                        {key}
                                                    </span>
                                                </div>
                                                {isPrimitive && (
                                                    <div className="mt-1 text-xs text-gray-600 font-mono break-all">
                                                        {typeof value === 'string' ? `"${truncateText(value)}"` : String(value)}
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
                                                {renderDraggableJSON(value, variablePath, depth + 1)}
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
                        <span className="text-3xl">🔀</span>
                        <h2 className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2" onClick={() => { if (onRename) { onRename(); } }} title="Click để đổi tên node">
                            {node?.data?.customName || 'Switch'}
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
                    <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
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
                            <h3 className="font-semibold text-gray-900">INPUT</h3>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {inputData && Object.keys(inputData).length > 0 ? (
                                <div className="space-y-4">
                                    {Object.entries(inputData).map(([nodeName, data]) => (
                                        <div key={nodeName}>
                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                                                <span className="text-xs font-semibold text-gray-700">{nodeName}</span>
                                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                                    {Object.keys(data || {}).length} fields
                                                </span>
                                            </div>
                                            <div className="bg-white p-3 rounded-lg border border-gray-200">
                                                {renderDraggableJSON(data, nodeName)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    <p className="text-center text-sm">Connect this node to receive input data</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Configuration */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <button className="px-4 py-1.5 bg-cyan-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {/* Mode Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Mode
                                </label>
                                <select value={config.mode} onChange={(e) => setConfig({ ...config, mode: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900">
                                    <option value="rules">Rules</option>
                                </select>
                            </div>

                            {/* Routing Rules */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Routing Rules
                                    </label>
                                    <button type="button" onClick={addRule} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-medium">
                                        + Add Rule
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {config.rules.map((rule, index) => (
                                        <div 
                                            key={index} 
                                            draggable
                                            onDragStart={() => handleDragStart(index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, index)}
                                            onDragEnd={handleDragEnd}
                                            className={`border rounded-lg p-4 cursor-move transition-all ${
                                                draggedIndex === index 
                                                    ? 'opacity-50 border-blue-500 border-2 bg-blue-50' 
                                                    : dragOverIndex === index
                                                    ? 'border-green-500 border-2 bg-green-50 shadow-lg'
                                                    : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:shadow-md'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <svg 
                                                        className="w-5 h-5 text-gray-400 cursor-move" 
                                                        fill="none" 
                                                        stroke="currentColor" 
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                                    </svg>
                                                    <span className="text-sm font-semibold text-gray-900">
                                                        Rule {index + 1}
                                                    </span>
                                                </div>
                                                {config.rules.length > 1 && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => deleteRule(index)} 
                                                        className="text-red-600 hover:text-red-700 text-xs"
                                                        title="Xóa rule"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Value to check */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Value
                                                </label>
                                                <ExpandableTextarea
                                                    value={rule.value}
                                                    onChange={(newValue) => updateRule(index, 'value', newValue)}
                                                    inputData={inputData}
                                                    rows={1}
                                                    placeholder="{{variable}} or value"
                                                />
                                            </div>

                                            {/* Operator */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Operator
                                                </label>
                                                <select value={rule.operator} onChange={(e) => updateRule(index, 'operator', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm">
                                                    {OPERATORS.map(op => (
                                                        <option key={op.value} value={op.value}>{op.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Value2 (if operator needs it) */}
                                            {!['exists', 'notExists', 'isEmpty', 'isNotEmpty'].includes(rule.operator) && (
                                                <div className="mb-3">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Compare to
                                                    </label>
                                                    <ExpandableTextarea
                                                        value={rule.value2}
                                                        onChange={(newValue) => updateRule(index, 'value2', newValue)}
                                                        inputData={inputData}
                                                        rows={1}
                                                        placeholder="value or {{variable}}"
                                                    />
                                                </div>
                                            )}

                                            {/* Output Name */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Output Name
                                                </label>
                                                <ExpandableTextarea
                                                    value={rule.outputName}
                                                    onChange={(newValue) => updateRule(index, 'outputName', newValue)}
                                                    rows={1}
                                                    placeholder="Output name"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Fallback Output Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Fallback Output Name
                                </label>
                                <ExpandableTextarea
                                    value={config.fallbackOutput}
                                    onChange={(newValue) => setConfig({ ...config, fallbackOutput: newValue })}
                                    rows={1}
                                    placeholder="No Match"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Tên output khi không có rule nào match
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-900">OUTPUT</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {onTest && (
                                    <>
                                        {isTesting ? (
                                            <button onClick={handleStopTest} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded text-sm font-medium">
                                                Stop step
                                            </button>
                                        ) : (
                                            <button onClick={handleTest} disabled={!config.rules || config.rules.length === 0} className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium">
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
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mb-4"></div>
                                    <p className="text-center">Đang test Switch node...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <div className="relative">
                                    <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-auto whitespace-pre-wrap text-gray-800">
                                        {JSON.stringify(getDisplayOutput(), null, 2)}
                                    </pre>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-center">Nhấn "Test step" để xem kết quả routing</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SwitchConfigModal;


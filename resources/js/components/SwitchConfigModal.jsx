import React, { useState, useEffect } from 'react';

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
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

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
                    error: error.message || 'An error occurred while testing',
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

    const renderDraggableJSON = (obj, prefix = '') => {
        if (obj === null || obj === undefined) {
            return <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">null</span>;
        }

        if (Array.isArray(obj)) {
            const typeInfo = getTypeInfo(obj);
            const isCollapsed = collapsedPaths.has(prefix);
            return (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 -mx-1" onClick={() => toggleCollapse(prefix)}>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{obj.length} items</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-4 space-y-1">
                            {obj.map((item, index) => (
                                <div key={index} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">[{index}]</div>
                                    {renderDraggableJSON(item, `${prefix}[${index}]`)}
                                </div>
                            ))}
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
                        const variablePath = prefix ? `${prefix}.${key}` : key;
                        const typeInfo = getTypeInfo(value);
                        const isCollapsed = collapsedPaths.has(variablePath);

                        return (
                            <div key={key} className="group">
                                <div className="flex items-start gap-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-2 -mx-2">
                                    {!isPrimitive && (
                                        <span className="text-gray-500 dark:text-gray-400 text-xs cursor-pointer mt-1" onClick={() => toggleCollapse(variablePath)}>
                                            {isCollapsed ? '▶' : '▼'}
                                        </span>
                                    )}
                                    <div className="flex-1 min-w-0 cursor-move" draggable="true" onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }} title={`Kéo thả để sử dụng {{${variablePath}}}`}>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono flex-shrink-0`}>
                                                {typeInfo.icon}
                                            </span>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{key}</span>
                                        </div>
                                        {isPrimitive && (
                                            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                                                {typeof value === 'string' ? `"${truncateText(value)}"` : String(value)}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => {
                                        const variable = `{{${variablePath}}}`;
                                        navigator.clipboard.writeText(variable);
                                        alert(`✓ Đã copy: ${variable}`);
                                    }} className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-opacity flex-shrink-0">
                                        📋
                                    </button>
                                </div>
                                {!isPrimitive && !isCollapsed && (
                                    <div className="ml-6 mt-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                        {renderDraggableJSON(value, variablePath)}
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
                <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                    {typeInfo.icon}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🔀</span>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2" onClick={() => { if (onRename) { onRename(); } }} title="Click để đổi tên node">
                            {node?.data?.customName || 'Switch'}
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
                    <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
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
                            {inputData && Object.keys(inputData).length > 0 ? (
                                <div className="space-y-4">
                                    {Object.entries(inputData).map(([nodeName, data]) => (
                                        <div key={nodeName}>
                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{nodeName}</span>
                                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                                    {Object.keys(data || {}).length} fields
                                                </span>
                                            </div>
                                            <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                                {renderDraggableJSON(data, nodeName)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
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
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <button className="px-4 py-1.5 bg-cyan-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {/* Mode Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Mode
                                </label>
                                <select value={config.mode} onChange={(e) => setConfig({ ...config, mode: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                    <option value="rules">Rules</option>
                                </select>
                            </div>

                            {/* Routing Rules */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Routing Rules
                                    </label>
                                    <button type="button" onClick={addRule} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-medium">
                                        + Add Rule
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {config.rules.map((rule, index) => (
                                        <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    Rule {index + 1}
                                                </span>
                                                {config.rules.length > 1 && (
                                                    <button type="button" onClick={() => deleteRule(index)} className="text-red-600 hover:text-red-700 text-xs">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Value to check */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Value
                                                </label>
                                                <input type="text" value={rule.value} onChange={(e) => updateRule(index, 'value', e.target.value)} onDrop={(e) => {
                                                    e.preventDefault();
                                                    const variable = e.dataTransfer.getData('text/plain');
                                                    updateRule(index, 'value', variable);
                                                }} onDragOver={(e) => e.preventDefault()} placeholder="{{variable}} or value" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm" />
                                            </div>

                                            {/* Operator */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Operator
                                                </label>
                                                <select value={rule.operator} onChange={(e) => updateRule(index, 'operator', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                                                    {OPERATORS.map(op => (
                                                        <option key={op.value} value={op.value}>{op.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Value2 (if operator needs it) */}
                                            {!['exists', 'notExists', 'isEmpty', 'isNotEmpty'].includes(rule.operator) && (
                                                <div className="mb-3">
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Compare to
                                                    </label>
                                                    <input type="text" value={rule.value2} onChange={(e) => updateRule(index, 'value2', e.target.value)} onDrop={(e) => {
                                                        e.preventDefault();
                                                        const variable = e.dataTransfer.getData('text/plain');
                                                        updateRule(index, 'value2', variable);
                                                    }} onDragOver={(e) => e.preventDefault()} placeholder="value or {{variable}}" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm" />
                                                </div>
                                            )}

                                            {/* Output Name */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Output Name
                                                </label>
                                                <input type="text" value={rule.outputName} onChange={(e) => updateRule(index, 'outputName', e.target.value)} placeholder="Output name" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Fallback Output Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Fallback Output Name
                                </label>
                                <input type="text" value={config.fallbackOutput} onChange={(e) => setConfig({ ...config, fallbackOutput: e.target.value })} placeholder="No Match" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Tên output khi không có rule nào match
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-900 dark:text-white">OUTPUT</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {onTest && (
                                    <button onClick={handleTest} disabled={isTesting || !config.rules || config.rules.length === 0} className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium">
                                        {isTesting ? 'Testing...' : 'Test step'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mb-4"></div>
                                    <p className="text-center">Đang test Switch node...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <div className="relative">
                                    <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                        {JSON.stringify(getDisplayOutput(), null, 2)}
                                    </pre>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
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


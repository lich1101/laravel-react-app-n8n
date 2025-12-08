import React, { useState, useEffect } from 'react';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';

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

function SwitchConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
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

    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Sử dụng custom hook cho logic chung
    const {
        isTesting,
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput,
        setInputViewMode,
        setOutputViewMode,
        handleSave,
        handleClose,
        handleTest,
        handleStopTest,
        togglePathCollapse,
    } = useConfigModal({
        onTest,
        onSave: () => onSave(config),
        onClose,
        onTestResult,
        node,
        config,
        inputData,
        outputData,
        readOnly
    });

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

    // Test buttons
    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="btn text-sm w-full bg-orange-600 hover:bg-orange-700 text-white"
                >
                    Stop step
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={config.rules.some(r => !r.value)}
                    className="btn btn-danger text-sm w-full disabled:bg-gray-300 disabled:text-white disabled:cursor-not-allowed"
                >
                    Test step
                </button>
            )}
        </>
    ) : null;

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
        <ConfigModalLayout
            node={node}
            onRename={onRename}
            onClose={handleClose}
            title="Switch"
            iconPath="/icons/nodes/switch.svg"
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
                            <p className="text-center text-sm">Connect this node to receive input data</p>
                        </div>
                    }
                />
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
                                <select value={config.mode} onChange={(e) => setConfig({ ...config, mode: e.target.value })} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <option value="rules">Rules</option>
                                </select>
                            </div>

                            {/* Routing Rules */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Routing Rules
                                    </label>
                                    {!readOnly && (
                                        <button type="button" onClick={addRule} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-medium">
                                            + Add Rule
                                        </button>
                                    )}
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
                                                {config.rules.length > 1 && !readOnly && (
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
                                                    disabled={readOnly}
                                                />
                                            </div>

                                            {/* Operator */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Operator
                                                </label>
                                                <select value={rule.operator} onChange={(e) => updateRule(index, 'operator', e.target.value)} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
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
                                                        disabled={readOnly}
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
                                                    disabled={readOnly}
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
                                    disabled={readOnly}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Tên output khi không có rule nào match
                                </p>
                            </div>
                        </div>
                    </div>

            {/* Right Panel - OUTPUT */}
            <div className="w-1/3 flex flex-col">
                <TestResultViewer
                    data={displayOutput}
                    viewMode={outputViewMode}
                    onViewModeChange={setOutputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="OUTPUT"
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-center">Nhấn "Test step" để xem kết quả routing</p>
                        </div>
                    }
                />
            </div>
        </ConfigModalLayout>
    );
}

export default SwitchConfigModal;


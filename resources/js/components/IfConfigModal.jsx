import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

// Operators by data type
const OPERATORS_BY_TYPE = {
    string: [
        { value: 'exists', label: 'exists' },
        { value: 'notExists', label: 'does not exist' },
        { value: 'isEmpty', label: 'is empty' },
        { value: 'isNotEmpty', label: 'is not empty' },
        { value: 'equal', label: 'is equal to' },
        { value: 'notEqual', label: 'is not equal to' },
        { value: 'contains', label: 'contains' },
        { value: 'notContains', label: 'does not contain' },
        { value: 'startsWith', label: 'starts with' },
        { value: 'notStartsWith', label: 'does not start with' },
        { value: 'endsWith', label: 'ends with' },
        { value: 'notEndsWith', label: 'does not end with' },
        { value: 'regex', label: 'matches regex' },
        { value: 'notRegex', label: 'does not match regex' },
    ],
    number: [
        { value: 'exists', label: 'exists' },
        { value: 'notExists', label: 'does not exist' },
        { value: 'isEmpty', label: 'is empty' },
        { value: 'isNotEmpty', label: 'is not empty' },
        { value: 'equal', label: 'is equal to' },
        { value: 'notEqual', label: 'is not equal to' },
        { value: 'gt', label: 'is greater than' },
        { value: 'lt', label: 'is less than' },
        { value: 'gte', label: 'is greater than or equal to' },
        { value: 'lte', label: 'is less than or equal to' },
    ],
    dateTime: [
        { value: 'exists', label: 'exists' },
        { value: 'notExists', label: 'does not exist' },
        { value: 'isEmpty', label: 'is empty' },
        { value: 'isNotEmpty', label: 'is not empty' },
        { value: 'equal', label: 'is equal to' },
        { value: 'notEqual', label: 'is not equal to' },
        { value: 'after', label: 'is after' },
        { value: 'before', label: 'is before' },
        { value: 'afterOrEqual', label: 'is after or equal to' },
        { value: 'beforeOrEqual', label: 'is before or equal to' },
    ],
    boolean: [
        { value: 'exists', label: 'exists' },
        { value: 'notExists', label: 'does not exist' },
        { value: 'isEmpty', label: 'is empty' },
        { value: 'isNotEmpty', label: 'is not empty' },
        { value: 'true', label: 'is true' },
        { value: 'false', label: 'is false' },
        { value: 'equal', label: 'is equal to' },
        { value: 'notEqual', label: 'is not equal to' },
    ],
    array: [
        { value: 'exists', label: 'exists' },
        { value: 'notExists', label: 'does not exist' },
        { value: 'isEmpty', label: 'is empty' },
        { value: 'isNotEmpty', label: 'is not empty' },
        { value: 'contains', label: 'contains' },
        { value: 'notContains', label: 'does not contain' },
        { value: 'lengthEqual', label: 'length equal to' },
        { value: 'lengthNotEqual', label: 'length not equal to' },
        { value: 'lengthGt', label: 'length greater than' },
        { value: 'lengthLt', label: 'length less than' },
        { value: 'lengthGte', label: 'length greater than or equal to' },
        { value: 'lengthLte', label: 'length less than or equal to' },
    ],
    object: [
        { value: 'exists', label: 'exists' },
        { value: 'notExists', label: 'does not exist' },
        { value: 'isEmpty', label: 'is empty' },
        { value: 'isNotEmpty', label: 'is not empty' },
    ],
};

function IfConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
    const [config, setConfig] = useState({
        conditions: [
            {
                dataType: 'string',
                value1: '',
                operator: 'equal',
                value2: '',
            }
        ],
        combineOperation: 'AND', // AND or OR
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
    }, [node]);

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
                    error: error.message || 'An error occurred',
                    result: false,
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

    const addCondition = () => {
        setConfig({
            ...config,
            conditions: [
                ...config.conditions,
                {
                    dataType: 'string',
                    value1: '',
                    operator: 'equal',
                    value2: '',
                }
            ]
        });
    };

    const removeCondition = (index) => {
        if (config.conditions.length > 1) {
            const newConditions = config.conditions.filter((_, i) => i !== index);
            setConfig({ ...config, conditions: newConditions });
        }
    };

    const updateCondition = (index, field, value) => {
        const newConditions = [...config.conditions];
        newConditions[index][field] = value;
        
        // Reset operator if data type changes
        if (field === 'dataType') {
            newConditions[index].operator = OPERATORS_BY_TYPE[value][0].value;
        }
        
        setConfig({ ...config, conditions: newConditions });
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

    const renderDraggableJSON = (obj, prefix = '', indent = 0) => {
        if (obj === null || obj === undefined) {
            return (
                <div className="flex items-center gap-2 py-1">
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">null</span>
                </div>
            );
        }

        if (Array.isArray(obj)) {
            const typeInfo = getTypeInfo(obj);
            return (
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{obj.length} items</span>
                    </div>
                    <div className="ml-4 space-y-1">
                        {obj.map((item, index) => {
                            const itemPath = `${prefix}[${index}]`;
                            return (
                                <div key={index} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">[{index}]</div>
                                    {renderDraggableJSON(item, itemPath, indent + 1)}
                                </div>
                            );
                        })}
                    </div>
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

                        return (
                            <div key={key} className="group">
                                <div className="flex items-start gap-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-2 -mx-2">
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
                                            <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono flex-shrink-0`}>
                                                {typeInfo.icon}
                                            </span>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                                                {key}
                                            </span>
                                        </div>
                                        
                                        {isPrimitive && (
                                            <div 
                                                className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono break-all cursor-move"
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
                                </div>

                                {!isPrimitive && (
                                    <div className="ml-6 mt-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
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
                <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
                    {typeInfo.icon}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };

    const getDataTypeIcon = (type) => {
        switch (type) {
            case 'string': return 'A';
            case 'number': return '#';
            case 'dateTime': return '📅';
            case 'boolean': return '✓';
            case 'array': return '=';
            case 'object': return '{}';
            default: return 'A';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🔀</span>
                        <h2 
                            className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename) {
                                    onRename();
                                }
                            }}
                            title="Click để đổi tên node"
                        >
                            {node?.data?.customName || 'If'}
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
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
                    <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900 dark:text-white">INPUT</h3>
                                {inputData && inputData.length > 0 && (
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => setInputViewMode('schema')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'schema'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            Schema
                                        </button>
                                        <button
                                            onClick={() => setInputViewMode('json')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                inputViewMode === 'json'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {inputData && inputData.length > 0 ? (
                                <div className="space-y-4">
                                    {inputViewMode === 'schema' && inputData.map((data, index) => (
                                        <div key={index}>
                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                    Input {index + 1}
                                                </span>
                                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                                    {Object.keys(data || {}).length} fields
                                                </span>
                                            </div>
                                            <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                                {renderDraggableJSON(data, `input-${index}`)}
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {inputViewMode === 'json' && inputData.map((data, index) => (
                                        <div key={index}>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                Input {index + 1}:
                                            </div>
                                            <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                                {JSON.stringify(data, null, 2)}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    <p className="text-center text-sm">No input data yet</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel - Configuration */}
                    <div className="w-1/2 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <button className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-medium">
                                Parameters
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Conditions</h3>
                                
                                {/* Conditions List */}
                                <div className="space-y-3">
                                    {config.conditions.map((condition, index) => (
                                        <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    Condition {index + 1}
                                                </span>
                                                {config.conditions.length > 1 && (
                                                    <button
                                                        onClick={() => removeCondition(index)}
                                                        className="text-red-600 hover:text-red-700"
                                                        title="Remove condition"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Data Type Selector */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Data Type
                                                </label>
                                                <select
                                                    value={condition.dataType}
                                                    onChange={(e) => updateCondition(index, 'dataType', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                >
                                                    <option value="string">{getDataTypeIcon('string')} String</option>
                                                    <option value="number">{getDataTypeIcon('number')} Number</option>
                                                    <option value="dateTime">{getDataTypeIcon('dateTime')} Date & Time</option>
                                                    <option value="boolean">{getDataTypeIcon('boolean')} Boolean</option>
                                                    <option value="array">{getDataTypeIcon('array')} Array</option>
                                                    <option value="object">{getDataTypeIcon('object')} Object</option>
                                                </select>
                                            </div>

                                            {/* Value 1 */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Value 1
                                                </label>
                                                <input
                                                    type="text"
                                                    value={condition.value1}
                                                    onChange={(e) => updateCondition(index, 'value1', e.target.value)}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        const variable = e.dataTransfer.getData('text/plain');
                                                        updateCondition(index, 'value1', condition.value1 + variable);
                                                    }}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    placeholder="Drag variable or type value"
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                                />
                                            </div>

                                            {/* Operator */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Operator
                                                </label>
                                                <select
                                                    value={condition.operator}
                                                    onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                >
                                                    {OPERATORS_BY_TYPE[condition.dataType].map(op => (
                                                        <option key={op.value} value={op.value}>{op.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Value 2 (not shown for unary operators) */}
                                            {!['exists', 'notExists', 'isEmpty', 'isNotEmpty', 'true', 'false'].includes(condition.operator) && (
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Value 2
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={condition.value2}
                                                        onChange={(e) => updateCondition(index, 'value2', e.target.value)}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            const variable = e.dataTransfer.getData('text/plain');
                                                            updateCondition(index, 'value2', condition.value2 + variable);
                                                        }}
                                                        onDragOver={(e) => e.preventDefault()}
                                                        placeholder="Drag variable or type value"
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Add Condition Button */}
                                <button
                                    onClick={addCondition}
                                    className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                                >
                                    + Add Condition
                                </button>

                                {/* Combine Operation (if multiple conditions) */}
                                {config.conditions.length > 1 && (
                                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Combine Conditions
                                        </label>
                                        <div className="flex gap-3">
                                            <label className="flex items-center">
                                                <input
                                                    type="radio"
                                                    value="AND"
                                                    checked={config.combineOperation === 'AND'}
                                                    onChange={(e) => setConfig({ ...config, combineOperation: e.target.value })}
                                                    className="mr-2"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">AND (All must be true)</span>
                                            </label>
                                            <label className="flex items-center">
                                                <input
                                                    type="radio"
                                                    value="OR"
                                                    checked={config.combineOperation === 'OR'}
                                                    onChange={(e) => setConfig({ ...config, combineOperation: e.target.value })}
                                                    className="mr-2"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">OR (Any can be true)</span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/4 flex flex-col">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-900 dark:text-white">OUTPUT</h3>
                                {testResults && (
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => setOutputViewMode('result')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'result'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            Result
                                        </button>
                                        <button
                                            onClick={() => setOutputViewMode('json')}
                                            className={`text-xs px-2 py-1 rounded ${
                                                outputViewMode === 'json'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleTest}
                                disabled={isTesting || config.conditions.some(c => !c.value1)}
                                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium w-full"
                            >
                                {isTesting ? 'Testing...' : 'Test step'}
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                                    <p className="text-center">Evaluating conditions...</p>
                                </div>
                            ) : testResults ? (
                                <div className="relative">
                                    {outputViewMode === 'result' && (
                                        <div className="space-y-3">
                                            <div className={`p-4 rounded-lg border-2 ${
                                                testResults.result 
                                                    ? 'bg-green-50 dark:bg-green-900/20 border-green-500' 
                                                    : 'bg-red-50 dark:bg-red-900/20 border-red-500'
                                            }`}>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-3xl">
                                                        {testResults.result ? '✓' : '✗'}
                                                    </span>
                                                    <div>
                                                        <div className={`text-lg font-bold ${
                                                            testResults.result 
                                                                ? 'text-green-700 dark:text-green-300' 
                                                                : 'text-red-700 dark:text-red-300'
                                                        }`}>
                                                            {testResults.result ? 'TRUE' : 'FALSE'}
                                                        </div>
                                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                                            Condition result
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {testResults.error && (
                                                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                                                        Error: {testResults.error}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-3 bg-gray-100 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                    Will execute path:
                                                </div>
                                                <div className={`text-sm font-mono ${
                                                    testResults.result 
                                                        ? 'text-green-600 dark:text-green-400' 
                                                        : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                    {testResults.result ? '→ TRUE branch' : '→ FALSE branch'}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {outputViewMode === 'json' && (
                                        <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                            {JSON.stringify(testResults, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-center">
                                        Click "Test step" to evaluate conditions
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

export default IfConfigModal;


import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';

function GoogleSheetsConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

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

        // Handle arrays
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
                            {obj.map((item, index) => {
                                const itemPath = buildArrayPath(currentPrefix, index);
                                return (
                                    <div key={index} className="border-l-2 border-gray-200 pl-3">
                                        <div className="text-xs text-gray-500 mb-1">[{index}]</div>
                                        {renderDraggableJSON(item, itemPath, depth + 1)}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        // Handle objects
        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            const typeInfo = getTypeInfo(obj);
            const objectPath = currentPrefix || prefix;
            const objectCollapsed = collapsedPaths.has(objectPath);

            if (keys.length === 0) {
                return <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">empty object</span>;
            }

            return (
                <div className="space-y-1">
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
                        onClick={() => toggleCollapse(objectPath)}
                    >
                        <span className="text-gray-500 text-xs">
                            {objectCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500">{keys.length} keys</span>
                    </div>
                    {!objectCollapsed && (
                        <div className="ml-4 space-y-1">
                            {keys.map(key => {
                                const value = obj[key];
                                const variablePath = buildVariablePath(objectPath, key);
                                const isPrimitive = value === null || value === undefined || 
                                    (typeof value !== 'object' && !Array.isArray(value));
                                const childCollapsed = collapsedPaths.has(variablePath);

                                return (
                                    <div key={key} className="group">
                                        <div className="flex items-center gap-2">
                                            {!isPrimitive && (
                                                <span 
                                                    className="text-gray-500 text-xs cursor-pointer"
                                                    onClick={() => toggleCollapse(variablePath)}
                                                >
                                                    {childCollapsed ? '▶' : '▼'}
                                                </span>
                                            )}
                                            <span className="text-xs font-semibold text-gray-700">{key}:</span>
                                            {isPrimitive ? (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.effectAllowed = 'copy';
                                                        e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                                    }}
                                                    className="cursor-move text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors inline-flex items-center gap-1"
                                                >
                                                    {typeof value === 'string' 
                                                        ? `"${truncateText(value)}"`
                                                        : String(value)
                                                    }
                                                </div>
                                            ) : (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.effectAllowed = 'copy';
                                                    }}
                                                    className="cursor-move text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors inline-flex items-center gap-1"
                                                >
                                                    {typeof value === 'string' 
                                                        ? `"${truncateText(value)}"`
                                                        : String(value)
                                                    }
                                                </div>
                                            )}

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
    const [config, setConfig] = useState({
        credentialId: null,
        resource: 'sheet',
        operation: 'get', // 'get', 'append', 'update'
        // Common fields
        documentUrl: '',
        sheetUrl: '',
        // Get fields
        filters: [],
        combineFilters: 'AND',
        // Append/Update fields
        mappingMode: 'manual',
        columnValues: {}, // Dynamic columns from sheet
        // Update specific
        columnToMatch: 'row_number',
    });

    const [isTesting, setIsTesting] = useState(false);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [sheetColumns, setSheetColumns] = useState([]);
    const [isLoadingColumns, setIsLoadingColumns] = useState(false);
    const [columnError, setColumnError] = useState('');
    const [testResults, setTestResults] = useState(null);

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
        fetchCredentials();
    }, [node]);

    // Fetch columns when documentUrl and sheetUrl change
    useEffect(() => {
        if (config.credentialId && config.documentUrl && config.sheetUrl && 
            (config.operation === 'append' || config.operation === 'update')) {
            fetchSheetColumns();
        }
    }, [config.credentialId, config.documentUrl, config.sheetUrl, config.operation]);

    const fetchCredentials = async () => {
        try {
            const response = await axios.get('/credentials');
            // Filter for oauth2 type (Google Sheets uses same OAuth2 as Google Docs)
            const filtered = Array.isArray(response.data) 
                ? response.data.filter(c => c.type === 'oauth2')
                : [];
            setCredentials(filtered);
        } catch (error) {
            console.error('Error fetching credentials:', error);
            setCredentials([]);
        }
    };

    const fetchSheetColumns = async () => {
        setIsLoadingColumns(true);
        setColumnError('');
        try {
            const response = await axios.post('/google-sheets/get-columns', {
                credentialId: config.credentialId,
                documentUrl: config.documentUrl,
                sheetUrl: config.sheetUrl,
            });

            if (response.data.columns && response.data.columns.length > 0) {
                setSheetColumns(response.data.columns);
                // Preserve existing columnValues, especially for built-in fields like row_number
                const initialValues = { ...config.columnValues };
                // Update/initialize values for columns from sheet
                response.data.columns.forEach(col => {
                    if (initialValues[col] === undefined) {
                        initialValues[col] = '';
                    }
                });
                // Also preserve columnToMatch value if it's not in sheet columns (e.g., row_number)
                if (config.columnToMatch && !response.data.columns.includes(config.columnToMatch)) {
                    // Keep the existing value for columnToMatch
                    if (initialValues[config.columnToMatch] === undefined) {
                        initialValues[config.columnToMatch] = config.columnValues[config.columnToMatch] || '';
                    }
                }
                setConfig({ ...config, columnValues: initialValues });
                setColumnError('');
            } else {
                setSheetColumns([]);
                setColumnError(config.operation === 'append' ? 'Sheet trắng - chưa có dữ liệu' : 'Sheet đang chưa có tên cột');
            }
        } catch (error) {
            console.error('Error fetching columns:', error);
            setSheetColumns([]);
            setColumnError(error.response?.data?.error || 'Không thể lấy thông tin cột từ sheet');
        } finally {
            setIsLoadingColumns(false);
        }
    };

    const handleCredentialSaved = (credential) => {
        fetchCredentials();
        setConfig({ ...config, credentialId: credential.id });
        setShowCredentialModal(false);
    };

    const addFilter = () => {
        setConfig({
            ...config,
            filters: [
                ...config.filters,
                { column: '', operator: '=', value: '' }
            ]
        });
    };

    const updateFilter = (index, field, value) => {
        const newFilters = [...config.filters];
        newFilters[index][field] = value;
        setConfig({ ...config, filters: newFilters });
    };

    const deleteFilter = (index) => {
        const newFilters = config.filters.filter((_, i) => i !== index);
        setConfig({ ...config, filters: newFilters });
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
                    error: error.message || 'An error occurred while testing the Google Sheets operation',
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
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl w-[95%] h-[90%] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-green-100 rounded flex items-center justify-center">
                                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 flex items-center gap-2" onClick={() => { if (onRename) onRename(); }} title="Click để đổi tên node">
                                    {node?.data?.customName || 'Google Sheets'}
                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </h2>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={handleTest}
                                disabled={isTesting || !config.credentialId}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                            >
                                <span>▲</span>
                                <span>{isTesting ? 'Testing...' : 'Test step'}</span>
                            </button>
                            <button
                                onClick={handleClose}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Body - 3 columns layout */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left Panel - INPUT */}
                        <div className="w-1/3 border-r border-gray-200 flex flex-col">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <h3 className="font-semibold text-gray-900">INPUT</h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto bg-white">
                                {inputData && Object.keys(inputData).length > 0 ? (
                                    <div className="space-y-4">
                                        {Object.entries(inputData).map(([nodeName, data]) => (
                                            <div key={nodeName}>
                                                <div className="text-xs font-semibold text-gray-700 mb-2">{nodeName}:</div>
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
                                        <p className="text-center text-xs mt-2">Kéo thả biến từ đây vào messages</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Center Panel - Configuration */}
                        <div className="w-1/3 flex flex-col">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                                    Parameters
                                </button>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                                {/* Credential Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Credential to connect with *
                                    </label>
                                    <div className="flex space-x-2">
                                        <select
                                            value={config.credentialId || ''}
                                            onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        >
                                            <option value="">Select Credential...</option>
                                            {credentials.map(cred => (
                                                <option key={cred.id} value={cred.id}>{cred.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setShowCredentialModal(true)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                            title="Create new OAuth2 credential for Google Sheets"
                                        >
                                            + New
                                        </button>
                                    </div>
                                </div>

                                {/* Resource */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Resource
                                    </label>
                                    <select
                                        value={config.resource}
                                        onChange={(e) => setConfig({ ...config, resource: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    >
                                        <option value="sheet">Sheet Within Document</option>
                                    </select>
                                </div>

                                {/* Operation */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Operation
                                    </label>
                                    <select
                                        value={config.operation}
                                        onChange={(e) => setConfig({ ...config, operation: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    >
                                        <option value="get">Get Row(s)</option>
                                        <option value="append">Append Row</option>
                                        <option value="update">Update Row</option>
                                    </select>
                                </div>

                                {/* Document URL */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Document *
                                    </label>
                                    <div className="space-y-2">
                                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900">
                                            <option value="url">By URL</option>
                                        </select>
                                        <ExpandableTextarea
                                            value={config.documentUrl}
                                            onChange={(value) => setConfig({ ...config, documentUrl: value })}
                                            placeholder="https://docs.google.com/spreadsheets/d/..."
                                            inputData={inputData}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* Sheet URL */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Sheet *
                                    </label>
                                    <div className="space-y-2">
                                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900">
                                            <option value="url">By URL</option>
                                        </select>
                                        <ExpandableTextarea
                                            value={config.sheetUrl}
                                            onChange={(value) => setConfig({ ...config, sheetUrl: value })}
                                            placeholder="https://docs.google.com/spreadsheets/d/..."
                                            inputData={inputData}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* Operation-specific fields */}
                                {config.operation === 'get' && (
                                    <>
                                        {/* Filters */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Filters
                                            </label>
                                            {config.filters.length === 0 ? (
                                                <p className="text-sm text-gray-500 mb-2">
                                                    Currently no items exist
                                                </p>
                                            ) : (
                                                <div className="space-y-2 mb-2">
                                                    {config.filters.map((filter, index) => (
                                                        <div key={index} className="flex space-x-2">
                                                            <div className="flex-1">
                                                                <ExpandableTextarea
                                                                    value={filter.column}
                                                                    onChange={(newValue) => updateFilter(index, 'column', newValue)}
                                                                    rows={1}
                                                                    placeholder="Column"
                                                                    inputData={inputData}
                                                                />
                                                            </div>
                                                            <select
                                                                value={filter.operator}
                                                                onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                                                                className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
                                                            >
                                                                <option value="=">=</option>
                                                                <option value="!=">!=</option>
                                                                <option value=">">{'>'}</option>
                                                                <option value="<">{'<'}</option>
                                                                <option value="contains">contains</option>
                                                            </select>
                                                            <div className="flex-1">
                                                                <ExpandableTextarea
                                                                    value={filter.value}
                                                                    onChange={(newValue) => updateFilter(index, 'value', newValue)}
                                                                    rows={1}
                                                                    placeholder="Value"
                                                                    inputData={inputData}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => deleteFilter(index)}
                                                                className="px-3 py-2 text-red-600 hover:text-red-700"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <button
                                                onClick={addFilter}
                                                className="text-sm text-blue-600 hover:text-blue-700"
                                            >
                                                + Add Filter
                                            </button>
                                        </div>

                                        {/* Combine Filters */}
                                        {config.filters.length > 1 && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Combine Filters
                                                </label>
                                                <select
                                                    value={config.combineFilters}
                                                    onChange={(e) => setConfig({ ...config, combineFilters: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                                >
                                                    <option value="AND">AND</option>
                                                    <option value="OR">OR</option>
                                                </select>
                                            </div>
                                        )}
                                    </>
                                )}

                                {(config.operation === 'append' || config.operation === 'update') && (
                                    <>
                                        {/* Mapping Mode */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Mapping Column Mode
                                            </label>
                                            <select
                                                value={config.mappingMode}
                                                onChange={(e) => setConfig({ ...config, mappingMode: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                            >
                                                <option value="manual">Map Each Column Manually</option>
                                            </select>
                                        </div>

                                        {/* Column to Match (Update only) */}
                                        {config.operation === 'update' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Column to match on
                                                </label>
                                                <select
                                                    value={config.columnToMatch}
                                                    onChange={(e) => setConfig({ ...config, columnToMatch: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                                >
                                                    <option value="row_number">row_number</option>
                                                    {sheetColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    The column to use when matching rows in Google Sheets to the input items of this node. Usually an ID.
                                                </p>
                                            </div>
                                        )}

                                        {/* Column Values */}
                                        <div>
                                            {isLoadingColumns ? (
                                                <p className="text-sm text-gray-500">
                                                    Đang tải cột...
                                                </p>
                                            ) : columnError ? (
                                                <p className="text-sm text-red-500">
                                                    {columnError}
                                                </p>
                                            ) : sheetColumns.length > 0 ? (
                                                <div className="space-y-4">
                                                    {/* For Update: Show match column first */}
                                                    {config.operation === 'update' && (
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                Value to Match
                                                            </label>
                                                            <div>
                                                                <label className="block text-xs text-gray-600 mb-1">
                                                                    {config.columnToMatch} <span className="text-blue-500">(using to match)</span>
                                                                </label>
                                                                <ExpandableTextarea
                                                                    value={config.columnValues[config.columnToMatch] || ''}
                                                                    onChange={(value) => setConfig({
                                                                        ...config,
                                                                        columnValues: {
                                                                            ...config.columnValues,
                                                                            [config.columnToMatch]: value
                                                                        }
                                                                    })}
                                                                    placeholder={`Enter ${config.columnToMatch} value to find the row`}
                                                                    inputData={inputData}
                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
                                                                    rows={2}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Values to Send/Update */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            {config.operation === 'append' ? 'Values to Send' : 'Values to Update'}
                                                        </label>
                                                        <div className="space-y-3">
                                                            {sheetColumns
                                                                .filter(col => config.operation === 'append' || col !== config.columnToMatch)
                                                                .map(col => (
                                                                    <div key={col}>
                                                                        <label className="block text-xs text-gray-600 mb-1">
                                                                            {col}
                                                                        </label>
                                                                        <ExpandableTextarea
                                                                            value={config.columnValues[col] || ''}
                                                                            onChange={(value) => setConfig({
                                                                                ...config,
                                                                                columnValues: {
                                                                                    ...config.columnValues,
                                                                                    [col]: value
                                                                                }
                                                                            })}
                                                                            placeholder={`Enter value for ${col}`}
                                                                            inputData={inputData}
                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
                                                                            rows={2}
                                                                        />
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-500">
                                                    Nhập Document và Sheet URL để tải cột
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Right Panel - OUTPUT */}
                        <div className="w-1/3 border-l border-gray-200 flex flex-col">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <h3 className="font-semibold text-gray-900">
                                    OUTPUT
                                    {outputData && (
                                        <span className="ml-2 text-sm font-normal text-gray-500">
                                            {Array.isArray(outputData) ? `${outputData.length} items` : '1 item'}
                                        </span>
                                    )}
                                </h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto bg-white">
                                {outputData ? (
                                    <pre className="text-xs bg-gray-100 text-gray-900 p-3 rounded border border-gray-200 whitespace-pre-wrap">
                                        {JSON.stringify(outputData, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-center text-gray-500 py-8">
                                        <p>Click "Test step" to see output</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showCredentialModal && (
                <CredentialModal
                    onClose={() => setShowCredentialModal(false)}
                    onSave={handleCredentialSaved}
                    initialType="oauth2"
                />
            )}
        </>
    );
}

export default GoogleSheetsConfigModal;


import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';

function GoogleSheetsConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
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
                // Initialize columnValues with empty strings for each column
                const initialValues = {};
                response.data.columns.forEach(col => {
                    initialValues[col] = config.columnValues[col] || '';
                });
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
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95%] h-[90%] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded flex items-center justify-center">
                                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Google Sheets
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
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
                        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="font-semibold text-gray-900 dark:text-white">INPUT</h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto">
                                {inputData ? (
                                    <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded">
                                        {JSON.stringify(inputData, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                        <p>No input data available</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Center Panel - Configuration */}
                        <div className="w-1/3 flex flex-col">
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                                    Parameters
                                </button>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                                {/* Credential Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Credential to connect with *
                                    </label>
                                    <div className="flex space-x-2">
                                        <select
                                            value={config.credentialId || ''}
                                            onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Resource
                                    </label>
                                    <select
                                        value={config.resource}
                                        onChange={(e) => setConfig({ ...config, resource: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="sheet">Sheet Within Document</option>
                                    </select>
                                </div>

                                {/* Operation */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Operation
                                    </label>
                                    <select
                                        value={config.operation}
                                        onChange={(e) => setConfig({ ...config, operation: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="get">Get Row(s)</option>
                                        <option value="append">Append Row</option>
                                        <option value="update">Update Row</option>
                                    </select>
                                </div>

                                {/* Document URL */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Document *
                                    </label>
                                    <div className="space-y-2">
                                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                            <option value="url">By URL</option>
                                        </select>
                                        <ExpandableTextarea
                                            value={config.documentUrl}
                                            onChange={(value) => setConfig({ ...config, documentUrl: value })}
                                            placeholder="https://docs.google.com/spreadsheets/d/..."
                                            inputData={inputData}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* Sheet URL */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Sheet *
                                    </label>
                                    <div className="space-y-2">
                                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                            <option value="url">By URL</option>
                                        </select>
                                        <ExpandableTextarea
                                            value={config.sheetUrl}
                                            onChange={(value) => setConfig({ ...config, sheetUrl: value })}
                                            placeholder="https://docs.google.com/spreadsheets/d/..."
                                            inputData={inputData}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* Operation-specific fields */}
                                {config.operation === 'get' && (
                                    <>
                                        {/* Filters */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Filters
                                            </label>
                                            {config.filters.length === 0 ? (
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                                    Currently no items exist
                                                </p>
                                            ) : (
                                                <div className="space-y-2 mb-2">
                                                    {config.filters.map((filter, index) => (
                                                        <div key={index} className="flex space-x-2">
                                                            <input
                                                                type="text"
                                                                value={filter.column}
                                                                onChange={(e) => updateFilter(index, 'column', e.target.value)}
                                                                placeholder="Column"
                                                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                            />
                                                            <select
                                                                value={filter.operator}
                                                                onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                                                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                            >
                                                                <option value="=">=</option>
                                                                <option value="!=">!=</option>
                                                                <option value=">">{'>'}</option>
                                                                <option value="<">{'<'}</option>
                                                                <option value="contains">contains</option>
                                                            </select>
                                                            <input
                                                                type="text"
                                                                value={filter.value}
                                                                onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                                                placeholder="Value"
                                                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                            />
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
                                                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                            >
                                                + Add Filter
                                            </button>
                                        </div>

                                        {/* Combine Filters */}
                                        {config.filters.length > 1 && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Combine Filters
                                                </label>
                                                <select
                                                    value={config.combineFilters}
                                                    onChange={(e) => setConfig({ ...config, combineFilters: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Mapping Column Mode
                                            </label>
                                            <select
                                                value={config.mappingMode}
                                                onChange={(e) => setConfig({ ...config, mappingMode: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            >
                                                <option value="manual">Map Each Column Manually</option>
                                            </select>
                                        </div>

                                        {/* Column to Match (Update only) */}
                                        {config.operation === 'update' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Column to match on
                                                </label>
                                                <select
                                                    value={config.columnToMatch}
                                                    onChange={(e) => setConfig({ ...config, columnToMatch: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                >
                                                    <option value="row_number">row_number</option>
                                                    {sheetColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    The column to use when matching rows in Google Sheets to the input items of this node. Usually an ID.
                                                </p>
                                            </div>
                                        )}

                                        {/* Column Values */}
                                        <div>
                                            {isLoadingColumns ? (
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    Đang tải cột...
                                                </p>
                                            ) : columnError ? (
                                                <p className="text-sm text-red-500 dark:text-red-400">
                                                    {columnError}
                                                </p>
                                            ) : sheetColumns.length > 0 ? (
                                                <div className="space-y-4">
                                                    {/* For Update: Show match column first */}
                                                    {config.operation === 'update' && (
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                                Value to Match
                                                            </label>
                                                            <div>
                                                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
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
                                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                                    rows={2}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Values to Send/Update */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                            {config.operation === 'append' ? 'Values to Send' : 'Values to Update'}
                                                        </label>
                                                        <div className="space-y-3">
                                                            {sheetColumns
                                                                .filter(col => config.operation === 'append' || col !== config.columnToMatch)
                                                                .map(col => (
                                                                    <div key={col}>
                                                                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
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
                                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                                            rows={2}
                                                                        />
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    Nhập Document và Sheet URL để tải cột
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Right Panel - OUTPUT */}
                        <div className="w-1/3 border-l border-gray-200 dark:border-gray-700 flex flex-col">
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                    OUTPUT
                                    {outputData && (
                                        <span className="ml-2 text-sm font-normal text-gray-500">
                                            {Array.isArray(outputData) ? `${outputData.length} items` : '1 item'}
                                        </span>
                                    )}
                                </h3>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto">
                                {outputData ? (
                                    <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded whitespace-pre-wrap">
                                        {JSON.stringify(outputData, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
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


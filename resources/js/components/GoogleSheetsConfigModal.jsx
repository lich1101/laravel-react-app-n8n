import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function GoogleSheetsConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    // Removed: truncateText, getTypeInfo, toggleCollapse, renderDraggableJSON
    // Now using shared components and hooks
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
    const testAbortControllerRef = useRef(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [sheetColumns, setSheetColumns] = useState([]);
    const [isLoadingColumns, setIsLoadingColumns] = useState(false);
    const [columnError, setColumnError] = useState('');
    const [testResults, setTestResults] = useState(null);

    // Use shared hook for common modal state and logic
    const {
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput,
        setInputViewMode,
        setOutputViewMode,
        togglePathCollapse,
        handleSave: handleSaveCommon,
        handleClose: handleCloseCommon,
    } = useConfigModal({
        onTest: null, // Custom test logic below
        onSave: () => onSave(config),
        onClose: () => {
            // Stop test if currently testing
            if (isTesting && testAbortControllerRef.current) {
                handleStopTest();
            }
            onSave(config);
            onClose();
        },
        onTestResult,
        node,
        config,
        inputData,
        outputData: testResults || outputData,
        readOnly
    });

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

    // handleSave and handleClose are now handled by useConfigModal
    // But we override handleClose below to include test stop logic

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
                    error: error.message || 'An error occurred while testing the Google Sheets operation',
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

    // Custom handleClose that stops test before closing
    const handleClose = () => {
        if (isTesting && testAbortControllerRef.current) {
            handleStopTest();
        }
        handleSaveCommon();
        handleCloseCommon();
    };

    // Test buttons
    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>■</span>
                    <span>Stop step</span>
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={!config.credentialId}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>▲</span>
                    <span>Test step</span>
                </button>
            )}
        </>
    ) : null;

    // Update displayOutput when testResults change
    const currentDisplayOutput = testResults || outputData || displayOutput;

    return (
        <>
        <ConfigModalLayout
            node={node}
            onRename={onRename}
            onClose={handleClose}
            title="Google Sheets"
            iconPath="/icons/nodes/googlesheets.svg"
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
                                            disabled={readOnly}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <option value="">Select Credential...</option>
                                            {credentials.map(cred => (
                                                <option key={cred.id} value={cred.id}>{cred.name}</option>
                                            ))}
                                        </select>
                                        {!readOnly && (
                                            <button
                                                type="button"
                                                onClick={() => setShowCredentialModal(true)}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                                title="Create new OAuth2 credential for Google Sheets"
                                            >
                                                + New
                                            </button>
                                        )}
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
                                        disabled={readOnly}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        disabled={readOnly}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                            disabled={readOnly}
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
                                            disabled={readOnly}
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
                                                                    disabled={readOnly}
                                                                />
                                                            </div>
                                                            <select
                                                                value={filter.operator}
                                                                onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                                                                disabled={readOnly}
                                                                className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                                    disabled={readOnly}
                                                                />
                                                            </div>
                                                            {!readOnly && (
                                                                <button
                                                                    onClick={() => deleteFilter(index)}
                                                                    className="px-3 py-2 text-red-600 hover:text-red-700"
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {!readOnly && (
                                                <button
                                                    onClick={addFilter}
                                                    className="text-sm text-blue-600 hover:text-blue-700"
                                                >
                                                    + Add Filter
                                                </button>
                                            )}
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
                                                    disabled={readOnly}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                disabled={readOnly}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                    disabled={readOnly}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                                    disabled={readOnly}
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
                                                                            disabled={readOnly}
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
                <TestResultViewer
                    data={currentDisplayOutput}
                    viewMode={outputViewMode}
                    onViewModeChange={setOutputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="OUTPUT"
                    isTesting={isTesting}
                    testingMessage="Đang gọi Google Sheets API..."
                    emptyState={
                        <div className="text-center text-gray-500 py-8">
                            <p>Click "Test step" to see output</p>
                        </div>
                    }
                />
            </div>
        </ConfigModalLayout>

        {showCredentialModal && (
            <CredentialModal
                isOpen={showCredentialModal}
                onClose={() => setShowCredentialModal(false)}
                onSave={handleCredentialSaved}
                credentialType="oauth2"
                lockedType={true}
            />
        )}
        </>
    );
}

export default GoogleSheetsConfigModal;


import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function GoogleDocsConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        credentialId: null,
        resource: 'document',
        operation: 'create', // 'create', 'update', or 'get'
        // Create fields
        folderId: '',
        title: '',
        // Update fields
        documentId: '',
        actions: [
            {
                object: 'text',
                action: 'insert',
                insertSegment: 'body',
                insertLocation: 'end',
                text: '',
            }
        ],
        // Get fields
        simplify: true, // Simplify output (extract plain text instead of full document structure)
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const testAbortControllerRef = useRef(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);

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

    const fetchCredentials = async () => {
        try {
            const response = await axios.get('/credentials');
            // Filter for oauth2 type
            const filtered = Array.isArray(response.data) 
                ? response.data.filter(c => c.type === 'oauth2')
                : [];
            setCredentials(filtered);
        } catch (error) {
            console.error('Error fetching credentials:', error);
            setCredentials([]);
        }
    };

    const handleCredentialSaved = (credential) => {
        fetchCredentials();
        setConfig({ ...config, credentialId: credential.id });
        setShowCredentialModal(false);
    };

    const addAction = () => {
        setConfig({
            ...config,
            actions: [
                ...config.actions,
                {
                    object: 'text',
                    action: 'insert',
                    insertSegment: 'body',
                    insertLocation: 'end',
                    text: '',
                }
            ]
        });
    };

    const updateAction = (index, field, value) => {
        const newActions = [...config.actions];
        newActions[index][field] = value;
        setConfig({ ...config, actions: newActions });
    };

    const deleteAction = (index) => {
        if (config.actions.length <= 1) {
            alert('Phải có ít nhất 1 action');
            return;
        }
        const newActions = config.actions.filter((_, i) => i !== index);
        setConfig({ ...config, actions: newActions });
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

    // Removed: getDisplayOutput, truncateText, getTypeInfo, toggleCollapse, renderDraggableJSON
    // Now using shared components and hooks

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
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Stop step
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={!config.credentialId}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Test step
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
            title="Google Docs"
            icon="📄"
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
                                    <select value={config.credentialId || ''} onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })} disabled={readOnly} className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
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
                                            title="Create new OAuth2 credential for Google Docs"
                                        >
                                            + New
                                        </button>
                                    )}
                                </div>
                                {!config.credentialId && (
                                    <p className="mt-1 text-xs text-orange-600">
                                        ⚠️ Cần OAuth2 credential với Google Docs API scope
                                    </p>
                                )}
                            </div>

                            {/* Resource */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Resource
                                </label>
                                <select value={config.resource} onChange={(e) => setConfig({ ...config, resource: e.target.value })} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <option value="document">Document</option>
                                </select>
                            </div>

                            {/* Operation */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Operation *
                                </label>
                                <select value={config.operation} onChange={(e) => setConfig({ ...config, operation: e.target.value })} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <option value="create">Create</option>
                                    <option value="update">Update</option>
                                    <option value="get">Get</option>
                                </select>
                            </div>

                            {/* CREATE FIELDS */}
                            {config.operation === 'create' && (
                                <>
                                    {/* Folder ID */}
                                    <div>
                                        <ExpandableTextarea
                                            label="Folder ID (optional)"
                                            value={config.folderId}
                                            onChange={(value) => setConfig({ ...config, folderId: value })}
                                            placeholder="Google Drive Folder ID hoặc {{variable}}"
                                            inputData={inputData}
                                            rows={1}
                                            hint="💡 Để trống = tạo trong My Drive root"
                                            disabled={readOnly}
                                        />
                                    </div>

                                    {/* Title */}
                                    <div>
                                        <ExpandableTextarea
                                            label="Title *"
                                            value={config.title}
                                            onChange={(value) => setConfig({ ...config, title: value })}
                                            placeholder="Document title hoặc {{variable}}"
                                            inputData={inputData}
                                            rows={1}
                                            disabled={readOnly}
                                        />
                                    </div>
                                </>
                            )}

                            {/* GET FIELDS */}
                            {config.operation === 'get' && (
                                <>
                                    {/* Document ID */}
                                    <div>
                                        <ExpandableTextarea
                                            label="Doc ID or URL *"
                                            value={config.documentId}
                                            onChange={(value) => setConfig({ ...config, documentId: value })}
                                            placeholder="Document ID hoặc {{variable}}"
                                            inputData={inputData}
                                            rows={1}
                                            hint={`💡 Dùng {{NodeName.id}} từ Create node hoặc paste document ID/URL`}
                                            disabled={readOnly}
                                        />
                                    </div>

                                    {/* Simplify */}
                                    <div>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={config.simplify !== false} 
                                                onChange={(e) => setConfig({ ...config, simplify: e.target.checked })} 
                                                disabled={readOnly}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Simplify</span>
                                        </label>
                                        <p className="mt-1 text-xs text-gray-500 ml-6">
                                            💡 Simplify = trả về plain text dễ dùng. Tắt = trả về full document structure
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* UPDATE FIELDS */}
                            {config.operation === 'update' && (
                                <>
                                    {/* Document ID */}
                                    <div>
                                        <ExpandableTextarea
                                            label="Document ID or URL *"
                                            value={config.documentId}
                                            onChange={(value) => setConfig({ ...config, documentId: value })}
                                            placeholder="Document ID hoặc {{variable}}"
                                            inputData={inputData}
                                            rows={1}
                                            hint={`💡 Dùng {{NodeName.id}} từ Create node`}
                                            disabled={readOnly}
                                        />
                                    </div>

                                    {/* Actions */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-sm font-medium text-gray-700">
                                                Actions
                                            </label>
                                            {!readOnly && (
                                                <button type="button" onClick={addAction} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-medium">
                                                    + Add Action
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            {config.actions.map((action, index) => (
                                                <div key={index} className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-sm font-semibold text-gray-900">Action {index + 1}</span>
                                                        {config.actions.length > 1 && !readOnly && (
                                                            <button type="button" onClick={() => deleteAction(index)} className="text-red-600 hover:text-red-700 text-xs">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Object */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Object</label>
                                                        <select value={action.object} onChange={(e) => updateAction(index, 'object', e.target.value)} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                                            <option value="text">Text</option>
                                                        </select>
                                                    </div>

                                                    {/* Action Type */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
                                                        <select value={action.action} onChange={(e) => updateAction(index, 'action', e.target.value)} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                                            <option value="insert">Insert</option>
                                                            <option value="replace">Replace</option>
                                                        </select>
                                                    </div>

                                                    {/* Insert Segment */}
                                                    {action.action === 'insert' && (
                                                        <div className="mb-3">
                                                            <label className="block text-xs font-medium text-gray-700 mb-1">Insert Segment</label>
                                                            <select value={action.insertSegment} onChange={(e) => updateAction(index, 'insertSegment', e.target.value)} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                                                <option value="body">Body</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Insert Location */}
                                                    {action.action === 'insert' && (
                                                        <div className="mb-3">
                                                            <label className="block text-xs font-medium text-gray-700 mb-1">Insert Location</label>
                                                            <select value={action.insertLocation} onChange={(e) => updateAction(index, 'insertLocation', e.target.value)} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                                                <option value="start">At Start</option>
                                                                <option value="end">At End</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Text */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Text *</label>
                                                        <ExpandableTextarea
                                                            value={action.text}
                                                            onChange={(newValue) => updateAction(index, 'text', newValue)}
                                                            placeholder="Text to insert hoặc {{variable}}"
                                                            rows={4}
                                                            inputData={inputData}
                                                            disabled={readOnly}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

            {/* Right Panel - OUTPUT */}
            <div className="w-1/3 flex flex-col">
                <TestResultViewer
                    data={currentDisplayOutput}
                    viewMode={outputViewMode}
                    onViewModeChange={setOutputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="OUTPUT"
                    isTesting={isTesting}
                    testingMessage="Đang gọi Google Docs API..."
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-center">Nhấn "Test step" để xem kết quả</p>
                        </div>
                    }
                />
            </div>
        </ConfigModalLayout>

        {/* Credential Modal */}
        <CredentialModal
            isOpen={showCredentialModal}
            onClose={() => setShowCredentialModal(false)}
            onSave={handleCredentialSaved}
            credentialType="oauth2"
            lockedType={true}
        />
        </>
    );
}

export default GoogleDocsConfigModal;


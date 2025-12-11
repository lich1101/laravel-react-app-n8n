import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function GoogleDriveFolderConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        credentialId: null,
        operation: 'createFolder', // 'createFolder', 'uploadFile', 'listFiles', 'deleteFolder', 'getFolder', 'search'
        // Create folder fields
        folderName: '',
        parentFolderId: '',
        // Upload file fields
        fileUrl: '',
        fileName: '',
        folderId: '',
        // List files fields
        listFolderId: '',
        // Delete folder fields
        deleteFolderId: '',
        // Get folder fields
        getFolderId: '',
        // Search fields
        searchQuery: '',
        searchFolderId: '',
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
            title="Google Drive Folder"
            iconPath="/icons/nodes/googledrive.svg"
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
                                    title="Create new OAuth2 credential for Google Drive"
                                >
                                    + New
                                </button>
                            )}
                        </div>
                        {!config.credentialId && (
                            <p className="mt-1 text-xs text-orange-600">
                                ⚠️ Cần OAuth2 credential với Google Drive API scope
                            </p>
                        )}
                    </div>

                    {/* Operation */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Operation *
                        </label>
                        <select value={config.operation} onChange={(e) => setConfig({ ...config, operation: e.target.value })} disabled={readOnly} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
                            <option value="createFolder">Create Folder</option>
                            <option value="uploadFile">Upload File from URL</option>
                            <option value="listFiles">List Files in Folder</option>
                            <option value="getFolder">Get Folder Info</option>
                            <option value="deleteFolder">Delete Folder</option>
                            <option value="search">Search Files/Folders</option>
                        </select>
                    </div>

                    {/* CREATE FOLDER FIELDS */}
                    {config.operation === 'createFolder' && (
                        <>
                            <div>
                                <ExpandableTextarea
                                    label="Folder Name *"
                                    value={config.folderName}
                                    onChange={(value) => setConfig({ ...config, folderName: value })}
                                    placeholder="Folder name hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    disabled={readOnly}
                                />
                            </div>
                            <div>
                                <ExpandableTextarea
                                    label="Parent Folder ID (optional)"
                                    value={config.parentFolderId}
                                    onChange={(value) => setConfig({ ...config, parentFolderId: value })}
                                    placeholder="Parent folder ID hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    hint="💡 Để trống = tạo trong My Drive root"
                                    disabled={readOnly}
                                />
                            </div>
                        </>
                    )}

                    {/* UPLOAD FILE FIELDS */}
                    {config.operation === 'uploadFile' && (
                        <>
                            <div>
                                <ExpandableTextarea
                                    label="File URL *"
                                    value={config.fileUrl}
                                    onChange={(value) => setConfig({ ...config, fileUrl: value })}
                                    placeholder="Public URL của file (jpg, mp3, mp4, ...) hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={2}
                                    hint="💡 Hỗ trợ các định dạng: jpg, png, gif, mp3, mp4, pdf, docx, ..."
                                    disabled={readOnly}
                                />
                            </div>
                            <div>
                                <ExpandableTextarea
                                    label="File Name *"
                                    value={config.fileName}
                                    onChange={(value) => setConfig({ ...config, fileName: value })}
                                    placeholder="Tên file khi upload hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    disabled={readOnly}
                                />
                            </div>
                            <div>
                                <ExpandableTextarea
                                    label="Folder ID *"
                                    value={config.folderId}
                                    onChange={(value) => setConfig({ ...config, folderId: value })}
                                    placeholder="Folder ID để upload file vào hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    hint="💡 Dùng {{NodeName.id}} từ Create Folder node"
                                    disabled={readOnly}
                                />
                            </div>
                        </>
                    )}

                    {/* LIST FILES FIELDS */}
                    {config.operation === 'listFiles' && (
                        <>
                            <div>
                                <ExpandableTextarea
                                    label="Folder ID *"
                                    value={config.listFolderId}
                                    onChange={(value) => setConfig({ ...config, listFolderId: value })}
                                    placeholder="Folder ID để list files hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    hint="💡 Dùng {{NodeName.id}} từ Create Folder node hoặc 'root' cho My Drive"
                                    disabled={readOnly}
                                />
                            </div>
                        </>
                    )}

                    {/* GET FOLDER FIELDS */}
                    {config.operation === 'getFolder' && (
                        <>
                            <div>
                                <ExpandableTextarea
                                    label="Folder ID *"
                                    value={config.getFolderId}
                                    onChange={(value) => setConfig({ ...config, getFolderId: value })}
                                    placeholder="Folder ID hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    hint="💡 Dùng {{NodeName.id}} từ Create Folder node"
                                    disabled={readOnly}
                                />
                            </div>
                        </>
                    )}

                    {/* DELETE FOLDER FIELDS */}
                    {config.operation === 'deleteFolder' && (
                        <>
                            <div>
                                <ExpandableTextarea
                                    label="Folder ID *"
                                    value={config.deleteFolderId}
                                    onChange={(value) => setConfig({ ...config, deleteFolderId: value })}
                                    placeholder="Folder ID để xóa hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    hint="⚠️ Cẩn thận: Hành động này không thể hoàn tác!"
                                    disabled={readOnly}
                                />
                            </div>
                        </>
                    )}

                    {/* SEARCH FIELDS */}
                    {config.operation === 'search' && (
                        <>
                            <div>
                                <ExpandableTextarea
                                    label="Search Query *"
                                    value={config.searchQuery}
                                    onChange={(value) => setConfig({ ...config, searchQuery: value })}
                                    placeholder="Từ khóa tìm kiếm hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    hint="💡 Ví dụ: name contains 'test' and mimeType = 'image/jpeg'"
                                    disabled={readOnly}
                                />
                            </div>
                            <div>
                                <ExpandableTextarea
                                    label="Search in Folder ID (optional)"
                                    value={config.searchFolderId}
                                    onChange={(value) => setConfig({ ...config, searchFolderId: value })}
                                    placeholder="Folder ID để tìm kiếm trong đó hoặc {{variable}}"
                                    inputData={inputData}
                                    rows={1}
                                    hint="💡 Để trống = tìm trong toàn bộ Drive"
                                    disabled={readOnly}
                                />
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
                    testingMessage="Đang gọi Google Drive API..."
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
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

export default GoogleDriveFolderConfigModal;


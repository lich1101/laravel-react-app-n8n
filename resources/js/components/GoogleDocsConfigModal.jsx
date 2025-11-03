import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';

function GoogleDocsConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
    const [config, setConfig] = useState({
        credentialId: null,
        resource: 'document',
        operation: 'create', // 'create' or 'update'
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
    });

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [inputViewMode, setInputViewMode] = useState('schema');
    const [outputViewMode, setOutputViewMode] = useState('json');
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

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

        if (typeof obj === 'object' && !Array.isArray(obj)) {
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
                                    }} title={`Drag to use {{${variablePath}}}`}>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 dark:bg-${typeInfo.color}-900/30 text-${typeInfo.color}-700 dark:text-${typeInfo.color}-300 rounded font-mono`}>
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
                                        navigator.clipboard.writeText(`{{${variablePath}}}`);
                                        alert(`✓ Đã copy: {{${variablePath}}}`);
                                    }} className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded">
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

        return (
            <div className="flex items-center gap-2">
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
                        <span className="text-3xl">📄</span>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2" onClick={() => { if (onRename) onRename(); }} title="Click để đổi tên node">
                            {node?.data?.customName || 'Google Docs'}
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
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{nodeName}:</div>
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
                                    <select value={config.credentialId || ''} onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                        <option value="">Select Credential...</option>
                                        {credentials.map(cred => (
                                            <option key={cred.id} value={cred.id}>{cred.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setShowCredentialModal(true)}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                                        title="Create new OAuth2 credential for Google Docs"
                                    >
                                        + New
                                    </button>
                                </div>
                                {!config.credentialId && (
                                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                        ⚠️ Cần OAuth2 credential với Google Docs API scope
                                    </p>
                                )}
                            </div>

                            {/* Resource */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Resource
                                </label>
                                <select value={config.resource} onChange={(e) => setConfig({ ...config, resource: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                    <option value="document">Document</option>
                                </select>
                            </div>

                            {/* Operation */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Operation *
                                </label>
                                <select value={config.operation} onChange={(e) => setConfig({ ...config, operation: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                    <option value="create">Create</option>
                                    <option value="update">Update</option>
                                </select>
                            </div>

                            {/* CREATE FIELDS */}
                            {config.operation === 'create' && (
                                <>
                                    {/* Folder ID */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Folder ID (optional)
                                        </label>
                                        <input type="text" value={config.folderId} onChange={(e) => setConfig({ ...config, folderId: e.target.value })} onDrop={(e) => {
                                            e.preventDefault();
                                            const variable = e.dataTransfer.getData('text/plain');
                                            setConfig({ ...config, folderId: variable });
                                        }} onDragOver={(e) => e.preventDefault()} placeholder="Google Drive Folder ID hoặc {{variable}}" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm" />
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            💡 Để trống = tạo trong My Drive root
                                        </p>
                                    </div>

                                    {/* Title */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Title *
                                        </label>
                                        <input type="text" value={config.title} onChange={(e) => setConfig({ ...config, title: e.target.value })} onDrop={(e) => {
                                            e.preventDefault();
                                            const variable = e.dataTransfer.getData('text/plain');
                                            setConfig({ ...config, title: variable });
                                        }} onDragOver={(e) => e.preventDefault()} placeholder="Document title hoặc {{variable}}" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm" />
                                    </div>
                                </>
                            )}

                            {/* UPDATE FIELDS */}
                            {config.operation === 'update' && (
                                <>
                                    {/* Document ID */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Document ID or URL *
                                        </label>
                                        <input type="text" value={config.documentId} onChange={(e) => setConfig({ ...config, documentId: e.target.value })} onDrop={(e) => {
                                            e.preventDefault();
                                            const variable = e.dataTransfer.getData('text/plain');
                                            setConfig({ ...config, documentId: variable });
                                        }} onDragOver={(e) => e.preventDefault()} placeholder="Document ID hoặc {{variable}}" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm" />
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            💡 Dùng {`{{NodeName.id}}`} từ Create node
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Actions
                                            </label>
                                            <button type="button" onClick={addAction} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-medium">
                                                + Add Action
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {config.actions.map((action, index) => (
                                                <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">Action {index + 1}</span>
                                                        {config.actions.length > 1 && (
                                                            <button type="button" onClick={() => deleteAction(index)} className="text-red-600 hover:text-red-700 text-xs">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Object */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Object</label>
                                                        <select value={action.object} onChange={(e) => updateAction(index, 'object', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                                                            <option value="text">Text</option>
                                                        </select>
                                                    </div>

                                                    {/* Action Type */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Action</label>
                                                        <select value={action.action} onChange={(e) => updateAction(index, 'action', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                                                            <option value="insert">Insert</option>
                                                            <option value="replace">Replace</option>
                                                        </select>
                                                    </div>

                                                    {/* Insert Segment */}
                                                    {action.action === 'insert' && (
                                                        <div className="mb-3">
                                                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Insert Segment</label>
                                                            <select value={action.insertSegment} onChange={(e) => updateAction(index, 'insertSegment', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                                                                <option value="body">Body</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Insert Location */}
                                                    {action.action === 'insert' && (
                                                        <div className="mb-3">
                                                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Insert Location</label>
                                                            <select value={action.insertLocation} onChange={(e) => updateAction(index, 'insertLocation', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                                                                <option value="start">At Start</option>
                                                                <option value="end">At End</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Text */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Text *</label>
                                                        <textarea value={action.text} onChange={(e) => updateAction(index, 'text', e.target.value)} onDrop={(e) => {
                                                            e.preventDefault();
                                                            const variable = e.dataTransfer.getData('text/plain');
                                                            const start = e.target.selectionStart;
                                                            const end = e.target.selectionEnd;
                                                            const currentValue = e.target.value;
                                                            const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                                                            updateAction(index, 'text', newValue);
                                                        }} onDragOver={(e) => e.preventDefault()} placeholder="Text to insert hoặc {{variable}}" rows={4} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm" />
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
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white">OUTPUT</h3>
                            <div className="flex items-center gap-2 mt-2">
                                {onTest && (
                                    <button onClick={handleTest} disabled={isTesting || !config.credentialId} className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium">
                                        {isTesting ? 'Testing...' : 'Test step'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                    <p className="text-center">Đang gọi Google Docs API...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <pre className="text-xs bg-gray-50 dark:bg-gray-950 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                    {JSON.stringify(getDisplayOutput(), null, 2)}
                                </pre>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-center">Nhấn "Test step" để xem kết quả</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Credential Modal */}
            <CredentialModal
                isOpen={showCredentialModal}
                onClose={() => setShowCredentialModal(false)}
                onSave={handleCredentialSaved}
                credentialType="oauth2"
            />
        </div>
    );
}

export default GoogleDocsConfigModal;


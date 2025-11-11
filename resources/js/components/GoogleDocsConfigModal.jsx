import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../utils/variablePath';

function GoogleDocsConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename }) {
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
                            {keys.map((key) => {
                                const value = obj[key];
                                const variablePath = buildVariablePath(objectPath, key);
                                const isPrimitive = value === null || value === undefined || (typeof value !== 'object' && !Array.isArray(value));
                                const childCollapsed = collapsedPaths.has(variablePath);

                                return (
                                    <div key={key} className="group">
                                        <div className="flex items-start gap-2 py-1 hover:bg-gray-100 rounded px-2 -mx-2">
                                            {!isPrimitive && (
                                                <span className="text-gray-500 text-xs cursor-pointer mt-1" onClick={() => toggleCollapse(variablePath)}>
                                                    {childCollapsed ? '▶' : '▼'}
                                                </span>
                                            )}
                                            <div className="flex-1 min-w-0 cursor-move" draggable="true" onDragStart={(e) => {
                                                e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                            }} title={`Drag to use {{${variablePath}}}`}>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                                                        {typeInfo.icon}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-700 truncate">{key}</span>
                                                </div>
                                                {isPrimitive && (
                                                    <div className="mt-1 text-xs text-gray-600 font-mono break-all">
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

        return (
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">📄</span>
                        <h2 className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 flex items-center gap-2" onClick={() => { if (onRename) onRename(); }} title="Click để đổi tên node">
                            {node?.data?.customName || 'Google Docs'}
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
                                    <select value={config.credentialId || ''} onChange={(e) => setConfig({ ...config, credentialId: e.target.value || null })} className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900">
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
                                <select value={config.resource} onChange={(e) => setConfig({ ...config, resource: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900">
                                    <option value="document">Document</option>
                                </select>
                            </div>

                            {/* Operation */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Operation *
                                </label>
                                <select value={config.operation} onChange={(e) => setConfig({ ...config, operation: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900">
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
                                        />
                                    </div>

                                    {/* Simplify */}
                                    <div>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={config.simplify !== false} 
                                                onChange={(e) => setConfig({ ...config, simplify: e.target.checked })} 
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
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
                                        />
                                    </div>

                                    {/* Actions */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-sm font-medium text-gray-700">
                                                Actions
                                            </label>
                                            <button type="button" onClick={addAction} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-medium">
                                                + Add Action
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {config.actions.map((action, index) => (
                                                <div key={index} className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-sm font-semibold text-gray-900">Action {index + 1}</span>
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
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Object</label>
                                                        <select value={action.object} onChange={(e) => updateAction(index, 'object', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm">
                                                            <option value="text">Text</option>
                                                        </select>
                                                    </div>

                                                    {/* Action Type */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
                                                        <select value={action.action} onChange={(e) => updateAction(index, 'action', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm">
                                                            <option value="insert">Insert</option>
                                                            <option value="replace">Replace</option>
                                                        </select>
                                                    </div>

                                                    {/* Insert Segment */}
                                                    {action.action === 'insert' && (
                                                        <div className="mb-3">
                                                            <label className="block text-xs font-medium text-gray-700 mb-1">Insert Segment</label>
                                                            <select value={action.insertSegment} onChange={(e) => updateAction(index, 'insertSegment', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm">
                                                                <option value="body">Body</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Insert Location */}
                                                    {action.action === 'insert' && (
                                                        <div className="mb-3">
                                                            <label className="block text-xs font-medium text-gray-700 mb-1">Insert Location</label>
                                                            <select value={action.insertLocation} onChange={(e) => updateAction(index, 'insertLocation', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm">
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
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">OUTPUT</h3>
                            <div className="flex items-center gap-2 mt-2">
                                {onTest && (
                                    <button onClick={handleTest} disabled={isTesting || !config.credentialId} className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium">
                                        {isTesting ? 'Testing...' : 'Test step'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto bg-white">
                            {isTesting ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                    <p className="text-center">Đang gọi Google Docs API...</p>
                                </div>
                            ) : getDisplayOutput() ? (
                                <pre className="text-xs bg-gray-100 text-gray-900 p-3 rounded border border-gray-200 overflow-auto whitespace-pre-wrap">
                                    {JSON.stringify(getDisplayOutput(), null, 2)}
                                </pre>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
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


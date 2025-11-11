import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';
import { useNavigate } from 'react-router-dom';
import FolderWorkflowView from './FolderWorkflowView';
import SyncModal from './SyncModal';
import CredentialsTab from '../CredentialsTab';

const FoldersTab = () => {
    const [activeSubTab, setActiveSubTab] = useState('workflows');
    const [folders, setFolders] = useState([]);
    const [workflows, setWorkflows] = useState([]);
    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState({});
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdministrator = user.role === 'administrator';
    const navigate = useNavigate();
    const [showEditModal, setShowEditModal] = useState(false);
    const [showWorkflowModal, setShowWorkflowModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showFolderWorkflows, setShowFolderWorkflows] = useState(false);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [viewingFolder, setViewingFolder] = useState(null);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncFolder, setSyncFolder] = useState(null);
    const [showCreateWorkflowModal, setShowCreateWorkflowModal] = useState(false);
    const [newWorkflowData, setNewWorkflowData] = useState({
        name: '',
        description: ''
    });
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        workflows: []
    });
    const [editingFolder, setEditingFolder] = useState(null);
    const [draggedWorkflow, setDraggedWorkflow] = useState(null);
    const [dragOverFolder, setDragOverFolder] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    // Drag and Drop handlers
    const handleDragStart = (e, workflow, folderId = null) => {
        e.stopPropagation();
        setDraggedWorkflow({ ...workflow, currentFolderId: folderId });
    };

    const handleDragOver = (e, folderId) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolder(folderId);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolder(null);
    };

    const handleDrop = async (e, targetFolderId) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolder(null);

        if (!draggedWorkflow) return;

        const workflowId = draggedWorkflow.id;
        const sourceFolderId = draggedWorkflow.currentFolderId;

        // If dropping in the same folder, do nothing
        if (sourceFolderId === targetFolderId) {
            setDraggedWorkflow(null);
            return;
        }

        try {
            // Update workflow's folder
            await axios.put(`/workflows/${workflowId}`, {
                folder_id: targetFolderId
            });

            // Refresh data
            await fetchData();
        } catch (error) {
            console.error('Error moving workflow:', error);
        }

        setDraggedWorkflow(null);
    };

    const handleDragEnd = () => {
        setDraggedWorkflow(null);
        setDragOverFolder(null);
    };

    const handleCreateWorkflow = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('/workflows', {
                name: newWorkflowData.name,
                description: newWorkflowData.description,
                nodes: [],
                edges: []
            });
            
            setShowCreateWorkflowModal(false);
            setNewWorkflowData({ name: '', description: '' });
            
            // Navigate to the newly created workflow
            navigate(`/workflows/${response.data.id}`);
        } catch (error) {
            console.error('Error creating workflow:', error);
            alert('Failed to create workflow');
        }
    };

    const fetchData = async () => {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            
            // Admin users (User Project) use different API
            if (user.role === 'admin') {
                const [foldersRes, workflowsRes, usersRes] = await Promise.all([
                    axios.get('/project-folders'), // Use project-folders API for admin users
                    axios.get('/workflows'),
                    axios.get('/users')
                ]);
                setFolders(foldersRes.data);
                setWorkflows(workflowsRes.data);
                setProjects([]); // No projects for admin users
                setUsers(usersRes.data);
            } else {
                // Administrator (Administrator App) has access to all APIs
                const [foldersRes, workflowsRes, projectsRes, usersRes] = await Promise.all([
                    axios.get('/folders'),
                    axios.get('/workflows'),
                    axios.get('/projects'),
                    axios.get('/users')
                ]);
                setFolders(foldersRes.data);
                setWorkflows(workflowsRes.data);
                setProjects(projectsRes.data);
                setUsers(usersRes.data);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingFolder) {
                await axios.put(`/folders/${editingFolder.id}`, {
                    name: formData.name,
                    description: formData.description,
                    workflows: formData.workflows
                });
            } else {
                await axios.post('/folders', {
                    name: formData.name,
                    description: formData.description,
                    workflows: formData.workflows
                });
            }
            setFormData({ name: '', description: '', workflows: [] });
            setShowEditModal(false);
            setEditingFolder(null);
            fetchData();
        } catch (error) {
            console.error('Error saving folder:', error);
        }
    };

    const handleEdit = (folder) => {
        setEditingFolder(folder);
        setFormData({
            name: folder.name,
            description: folder.description || '',
            workflows: folder.workflows?.map(w => w.id) || []
        });
        setShowEditModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this folder?')) {
            try {
                await axios.delete(`/folders/${id}`);
                fetchData();
            } catch (error) {
                console.error('Error deleting folder:', error);
            }
        }
    };

    const handleManageWorkflows = (folder) => {
        setSelectedFolder(folder);
        setShowWorkflowModal(true);
    };

    const handleAssignProjects = (folder) => {
        setSelectedFolder(folder);
        setShowProjectModal(true);
    };

    const handleDoubleClickFolder = (folder) => {
        setViewingFolder(folder);
        setShowFolderWorkflows(true);
    };

    const handleSyncFolder = async (folder) => {
        setSyncFolder(folder);
        setShowSyncModal(true);
    };

    const handleSyncConfirm = async () => {
        try {
            const response = await axios.post(`/folders/${syncFolder.id}/sync`);
            fetchData();
            return response; // Return response for SyncModal to process
        } catch (error) {
            console.error('Error syncing folder:', error);
            throw error; // Re-throw to let SyncModal handle the error display
        }
    };

    if (loading) {
        return <div className="text-center py-4">Loading...</div>;
    }

    // Show folder workflows view
    if (showFolderWorkflows && viewingFolder) {
        return (
            <FolderWorkflowView
                folder={viewingFolder}
                onBack={() => {
                    setShowFolderWorkflows(false);
                    setViewingFolder(null);
                    fetchData();
                }}
            />
        );
    }

    return (
        <div>
            {/* Sub-tabs for Workflows and Credentials */}
            <div className="border-b border-subtle mb-6">
                <nav className="flex space-x-2" aria-label="Tabs">
                    <button
                        onClick={() => setActiveSubTab('workflows')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                            activeSubTab === 'workflows'
                                ? 'bg-primary-soft text-primary shadow-card'
                                : 'text-muted hover:text-primary hover:bg-surface-muted'
                        }`}
                    >
                        📄 Workflows
                    </button>
                    <button
                        onClick={() => setActiveSubTab('credentials')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                            activeSubTab === 'credentials'
                                ? 'bg-primary-soft text-primary shadow-card'
                                : 'text-muted hover:text-primary hover:bg-surface-muted'
                        }`}
                    >
                        🔐 Credentials
                    </button>
                </nav>
            </div>

            {/* Credentials Tab Content */}
            {activeSubTab === 'credentials' ? (
                <CredentialsTab />
            ) : (
                <>
                    {/* Workflows Tab Content */}
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">Folders</h2>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setShowCreateWorkflowModal(true)}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Create Workflow</span>
                            </button>
                            <button
                                onClick={() => {
                                    setShowEditModal(true);
                                    setEditingFolder(null);
                                    setFormData({ name: '', description: '', workflows: [] });
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Add Folder</span>
                            </button>
                        </div>
                    </div>

            {/* Folders Tree View */}
            <div className="space-y-2">
                {folders.map((folder) => (
                    <div 
                        key={folder.id} 
                        className="bg-gray-800 rounded-lg overflow-hidden"
                        onDragOver={(e) => handleDragOver(e, folder.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, folder.id)}
                    >
                        {/* Folder Header */}
                        <div className={`flex items-center justify-between p-4 hover:bg-gray-750 ${
                            dragOverFolder === folder.id ? 'bg-blue-900 border-2 border-blue-500' : ''
                        }`}>
                            <div className="flex items-center space-x-3 flex-1">
                                {/* Expand/Collapse Button */}
                                <button
                                    onClick={() => toggleFolder(folder.id)}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <svg
                                        className={`w-5 h-5 transition-transform ${expandedFolders[folder.id] ? 'transform rotate-90' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>

                                {/* Folder Icon */}
                                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>

                                {/* Folder Name & Info */}
                                <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                        <span className="text-white font-medium">{folder.name}</span>
                                        <span className="text-gray-400 text-sm">({folder.workflows?.length || 0})</span>
                                        {isAdministrator && folder.projects?.length > 0 && (
                                            <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">
                                                {folder.projects.length} project{folder.projects.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                    {folder.description && (
                                        <p className="text-gray-400 text-sm mt-1">{folder.description}</p>
                                    )}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleEdit(folder);
                                    }}
                                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                                    title="Edit"
                                >
                                    ✏️ Edit
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleManageWorkflows(folder);
                                    }}
                                    className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                                    title="Manage Workflows"
                                >
                                    📄 Workflows
                                </button>
                                {isAdministrator && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAssignProjects(folder);
                                        }}
                                        className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded"
                                        title="Assign Projects"
                                    >
                                        🏢 Projects
                                    </button>
                                )}
                                {isAdministrator && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSyncFolder(folder);
                                        }}
                                        className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded"
                                        title="Sync to Projects"
                                    >
                                        🔄 Sync
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(folder.id);
                                    }}
                                    className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                                    title="Delete Folder"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>

                        {/* Workflows List (when expanded) */}
                        {expandedFolders[folder.id] && (
                            <div className="bg-gray-900 px-4 py-2">
                                {folder.workflows && folder.workflows.length > 0 ? (
                                    <div className="space-y-1">
                                        {folder.workflows.map((workflow) => (
                                            <div
                                                key={workflow.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, workflow, folder.id)}
                                                onDragEnd={handleDragEnd}
                                                onDoubleClick={() => navigate(`/workflows/${workflow.id}`)}
                                                className="pl-12 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded flex items-center justify-between cursor-move"
                                            >
                                                <div className="flex items-center space-x-2">
                                                    <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                                    </svg>
                                                    <span>{workflow.name}</span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <span className={`text-xs px-2 py-0.5 rounded ${workflow.active ? 'bg-green-600' : 'bg-gray-600'}`}>
                                                        {workflow.active ? 'Active' : 'Inactive'}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {new Date(workflow.updated_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="pl-12 py-2 text-sm text-gray-500 italic">No workflows in this folder</p>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {folders.length === 0 && !loading && (
                    <p className="text-center text-gray-400 py-8">No folders found. Create one to get started!</p>
                )}
            </div>

            {/* Standalone Workflows (No Folder) */}
            {workflows.filter(w => !w.folder_id).length > 0 && (
                <div className="mt-6">
                    <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Standalone Workflows
                    </h3>
                    <div className="space-y-2">
                        {workflows
                            .filter(w => !w.folder_id)
                            .map((workflow) => (
                                <div
                                    key={workflow.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, workflow, null)}
                                    onDragEnd={handleDragEnd}
                                    onDoubleClick={() => navigate(`/workflows/${workflow.id}`)}
                                    className="bg-gray-800 rounded-lg p-3 hover:bg-gray-750 cursor-move flex items-center justify-between"
                                >
                                    <div className="flex items-center space-x-3">
                                        <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                        </svg>
                                        <span className="text-white">{workflow.name}</span>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <span className={`text-xs px-2 py-1 rounded ${workflow.active ? 'bg-green-600' : 'bg-gray-600'}`}>
                                            {workflow.active ? 'Active' : 'Inactive'}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {new Date(workflow.updated_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            )}

            {/* Drop Zone for Root Level */}
            <div
                onDragOver={(e) => handleDragOver(e, null)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, null)}
                className={`mt-4 p-6 border-2 border-dashed rounded-lg text-center ${
                    dragOverFolder === null && draggedWorkflow
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-600 bg-gray-800/50'
                }`}
            >
                <p className="text-gray-400 text-sm">
                    {draggedWorkflow ? '📂 Drop here to remove from folder' : '💡 Drag workflows here to organize'}
                </p>
            </div>

            {/* Workflow Management Modal */}
            {showWorkflowModal && (
                <WorkflowModal
                    folder={selectedFolder}
                    workflows={workflows}
                    onClose={() => {
                        setShowWorkflowModal(false);
                        setSelectedFolder(null);
                    }}
                    onSave={fetchData}
                />
            )}

            {/* Project Assignment Modal */}
            {showProjectModal && (
                <ProjectModal
                    folder={selectedFolder}
                    projects={projects}
                    onClose={() => {
                        setShowProjectModal(false);
                        setSelectedFolder(null);
                    }}
                    onSave={fetchData}
                />
            )}

            {/* Sync Modal */}
            <SyncModal
                isOpen={showSyncModal}
                onClose={() => {
                    setShowSyncModal(false);
                    setSyncFolder(null);
                }}
                onConfirm={handleSyncConfirm}
                folderName={syncFolder?.name || ''}
            />

            {/* Create Workflow Modal */}
            {showCreateWorkflowModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-xl font-semibold text-gray-900 mb-4">
                            Create New Workflow
                        </h3>
                        <form onSubmit={handleCreateWorkflow}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newWorkflowData.name}
                                    onChange={(e) => setNewWorkflowData({ ...newWorkflowData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    placeholder="Enter workflow name"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={newWorkflowData.description}
                                    onChange={(e) => setNewWorkflowData({ ...newWorkflowData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    placeholder="Enter workflow description (optional)"
                                    rows="3"
                                />
                            </div>
                            <div className="flex space-x-2">
                                <button
                                    type="submit"
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                                >
                                    Create
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateWorkflowModal(false);
                                        setNewWorkflowData({ name: '', description: '' });
                                    }}
                                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit/Add Folder Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-xl font-semibold text-gray-900 mb-4">
                            {editingFolder ? 'Edit Folder' : 'Add New Folder'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    placeholder="Enter folder name"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    placeholder="Enter folder description (optional)"
                                    rows="3"
                                />
                            </div>
                            <div className="flex space-x-2">
                                <button
                                    type="submit"
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                                >
                                    {editingFolder ? 'Update' : 'Create'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingFolder(null);
                                        setFormData({ name: '', description: '', workflows: [] });
                                    }}
                                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
                </>
            )}
        </div>
    );
};

// Workflow Management Modal Component
const WorkflowModal = ({ folder, workflows, onClose, onSave }) => {
    const [selectedWorkflows, setSelectedWorkflows] = useState(
        folder.workflows?.map(w => w.id) || []
    );

    const handleSave = async () => {
        try {
            await axios.post(`/folders/${folder.id}/assign-projects`, {
                project_ids: [] // Just to trigger update
            });

            // Update workflows
            const currentWorkflowIds = folder.workflows?.map(w => w.id) || [];
            const toAdd = selectedWorkflows.filter(id => !currentWorkflowIds.includes(id));
            const toRemove = currentWorkflowIds.filter(id => !selectedWorkflows.includes(id));

            if (toAdd.length > 0) {
                await axios.post(`/folders/${folder.id}/add-workflows`, {
                    workflow_ids: toAdd
                });
            }

            if (toRemove.length > 0) {
                await axios.post(`/folders/${folder.id}/remove-workflows`, {
                    workflow_ids: toRemove
                });
            }

            onSave();
            onClose();
        } catch (error) {
            console.error('Error updating workflows:', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Manage Workflows - {folder.name}
                </h3>
                <div className="max-h-96 overflow-y-auto">
                    {workflows.map((workflow) => (
                        <label key={workflow.id} className="flex items-center space-x-2 py-2">
                            <input
                                type="checkbox"
                                checked={selectedWorkflows.includes(workflow.id)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedWorkflows([...selectedWorkflows, workflow.id]);
                                    } else {
                                        setSelectedWorkflows(selectedWorkflows.filter(id => id !== workflow.id));
                                    }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-900">{workflow.name}</span>
                        </label>
                    ))}
                </div>
                <div className="flex space-x-2 mt-4">
                    <button
                        onClick={handleSave}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                        Save
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

// Project Assignment Modal Component
const ProjectModal = ({ folder, projects, onClose, onSave }) => {
    const [selectedProjects, setSelectedProjects] = useState(
        folder.projects?.map(p => p.id) || []
    );

    const handleSave = async () => {
        try {
            const response = await axios.post(`/folders/${folder.id}/assign-projects`, {
                project_ids: selectedProjects
            });

            // Show success message if available
            if (response.data.message) {
                console.log(response.data.message);
            }

            onSave();
            onClose();
        } catch (error) {
            console.error('Error assigning projects:', error);
            // Show user-friendly error message
            alert('Có lỗi xảy ra khi gán folder cho project. Vui lòng thử lại.');
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Assign to Projects - {folder.name}
                </h3>
                <div className="max-h-96 overflow-y-auto">
                    {projects.map((project) => (
                        <label key={project.id} className="flex items-center space-x-2 py-2">
                            <input
                                type="checkbox"
                                checked={selectedProjects.includes(project.id)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedProjects([...selectedProjects, project.id]);
                                    } else {
                                        setSelectedProjects(selectedProjects.filter(id => id !== project.id));
                                    }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-900">{project.name}</span>
                        </label>
                    ))}
                </div>
                <div className="flex space-x-2 mt-4">
                    <button
                        onClick={handleSave}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                        Save
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FoldersTab;

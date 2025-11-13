import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import { useNavigate } from 'react-router-dom';
import CredentialsTab from './CredentialsTab';

const WorkflowList = ({ basePath = '/workflows', onStructureChange }) => {
    const [workflows, setWorkflows] = useState([]);
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedFolders, setExpandedFolders] = useState({});
    const [activeTab, setActiveTab] = useState('workflows'); // 'workflows' or 'credentials'
    const [draggedWorkflow, setDraggedWorkflow] = useState(null);
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
    const [editingFolder, setEditingFolder] = useState(null);
    const [newFolder, setNewFolder] = useState({ name: '', description: '' });
    const [savingFolder, setSavingFolder] = useState(false);
    const UNASSIGNED_DROP_KEY = 'unassigned';
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdminUser = ['admin', 'administrator'].includes(currentUser.role);

    useEffect(() => {
        fetchData();
        
        // Auto-switch to credentials tab if OAuth callback params present
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('oauth_success') || urlParams.has('oauth_error')) {
            setActiveTab('credentials');
        }
    }, []);

    const fetchData = async () => {
        try {
            const [workflowsRes, foldersRes] = await Promise.all([
                axios.get('/workflows'),
                axios.get('/project-folders')
            ]);
            setWorkflows(workflowsRes.data);
            setFolders(foldersRes.data);
            onStructureChange?.();
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Group workflows by folder
    const folderMap = {};
    const workflowsWithoutFolder = [];

    workflows.forEach(workflow => {
        if (workflow.folder_id && workflow.folder_id !== null) {
            if (!folderMap[workflow.folder_id]) {
                const folder = folders.find(f => f.id === workflow.folder_id);
                folderMap[workflow.folder_id] = {
                    id: workflow.folder_id,
                    name: folder ? folder.name : `Folder ${workflow.folder_id}`,
                    description: folder ? folder.description : '',
                    workflows: []
                };
            }
            folderMap[workflow.folder_id].workflows.push(workflow);
        } else {
            workflowsWithoutFolder.push(workflow);
        }
    });

    const foldersWithWorkflows = Object.values(folderMap);

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    const handleWorkflowDragStart = (event, workflow, folderId = null) => {
        setDraggedWorkflow({ id: workflow.id, currentFolderId: folderId });
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleWorkflowDragEnd = () => {
        setDraggedWorkflow(null);
        setDragOverFolderId(null);
    };

    const handleFolderDragOver = (event, folderId) => {
        event.preventDefault();
        const key = folderId === null ? UNASSIGNED_DROP_KEY : String(folderId);
        if (dragOverFolderId !== key) {
            setDragOverFolderId(key);
        }
    };

    const handleFolderDragLeave = (event, folderId) => {
        event.preventDefault();
        const key = folderId === null ? UNASSIGNED_DROP_KEY : String(folderId);
        if (dragOverFolderId === key) {
            setDragOverFolderId(null);
        }
    };

    const handleFolderDrop = async (event, folderId) => {
        event.preventDefault();
        event.stopPropagation();
        const key = folderId === null ? UNASSIGNED_DROP_KEY : String(folderId);
        setDragOverFolderId(null);

        if (!draggedWorkflow) {
            return;
        }

        const targetFolderId = key === UNASSIGNED_DROP_KEY ? null : Number(folderId);
        const sourceFolderId = draggedWorkflow.currentFolderId ?? null;

        if (sourceFolderId === targetFolderId) {
            setDraggedWorkflow(null);
            return;
        }

        try {
            await axios.put(`/workflows/${draggedWorkflow.id}`, {
                folder_id: targetFolderId
            });
            await fetchData();
        } catch (error) {
            console.error('Error moving workflow:', error);
            alert('Không thể di chuyển workflow. Vui lòng thử lại.');
        }

        setDraggedWorkflow(null);
    };

    const openFolderModal = (folder = null) => {
        if (folder) {
            setEditingFolder(folder);
            setNewFolder({
                name: folder.name || '',
                description: folder.description || '',
            });
        } else {
            setEditingFolder(null);
            setNewFolder({ name: '', description: '' });
        }
        setShowCreateFolderModal(true);
    };

    const closeCreateFolderModal = () => {
        setShowCreateFolderModal(false);
        setEditingFolder(null);
        setNewFolder({ name: '', description: '' });
    };

    const handleCreateFolderSubmit = async (event) => {
        event.preventDefault();
        const folderName = newFolder.name.trim();
        if (!folderName) {
            alert('Vui lòng nhập tên folder.');
            return;
        }

        const folderDescription = newFolder.description.trim() || null;

        setSavingFolder(true);
        try {
            if (editingFolder) {
                if (isAdminUser) {
                    await axios.put(`/folders/${editingFolder.id}`, {
                        name: folderName,
                        description: folderDescription,
                        workflows: [],
                    });
                } else {
                    await axios.put(`/project-folders/${editingFolder.id}/user-update`, {
                        name: folderName,
                        description: folderDescription,
                    });
                }
            } else {
                const endpoint = isAdminUser ? '/folders' : '/project-folders/user-create';
                await axios.post(endpoint, {
                    name: folderName,
                    description: folderDescription,
                    workflows: [],
                });
            }

            closeCreateFolderModal();
            await fetchData();
        } catch (error) {
            console.error('Error saving folder:', error);
            alert(editingFolder ? 'Không thể cập nhật folder. Vui lòng thử lại.' : 'Không thể tạo folder. Vui lòng thử lại.');
        } finally {
            setSavingFolder(false);
        }
    };

    const canEditWorkflow = (folder) => {
        if (!folder) return true; // Workflows without folder - user owns them
        return folder.user_permission === 'edit';
    };

    const canDeleteWorkflow = (workflow, folder) => {
        // User role giờ được phép xóa tất cả workflows, kể cả từ folder
        return true;
    };

    const handleDelete = async (id, workflow, e) => {
        e.stopPropagation();
        
        // User giờ được phép xóa cả workflows từ folder
        const message = workflow.is_from_folder 
            ? 'Are you sure you want to delete this workflow from folder? This action cannot be undone.'
            : 'Are you sure you want to delete this workflow?';
        
        if (window.confirm(message)) {
            try {
                await axios.delete(`/workflows/${id}`);
                fetchData();
            } catch (error) {
                console.error('Error deleting workflow:', error);
                if (error.response?.status === 403) {
                    alert('⚠️ Bạn không có quyền xóa workflow này');
                }
            }
        }
    };

    const handleDeleteFolder = async (folderId, folderName, e) => {
        e.stopPropagation();
        
        const message = `Are you sure you want to delete folder "${folderName}"?\n\nThis will delete the folder and all workflows inside it.\n\nThis action cannot be undone.`;
        
        if (window.confirm(message)) {
            try {
                await axios.delete(`/project-folders/${folderId}/user-delete`);
                fetchData();
            } catch (error) {
                console.error('Error deleting folder:', error);
                if (error.response?.status === 403) {
                    alert('⚠️ Bạn không có quyền xóa folder này');
                } else {
                    alert('⚠️ Không thể xóa folder. Vui lòng thử lại.');
                }
            }
        }
    };

    const handleToggleActive = async (workflow, e) => {
        e.stopPropagation();
        try {
            const newActive = !workflow.active;
            await axios.put(`/workflows/${workflow.id}`, { active: newActive });
            fetchData();
        } catch (error) {
            if (error.response?.status === 400) {
                alert('Cannot activate workflow without a webhook node');
            } else {
                console.error('Error toggling workflow:', error);
            }
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const filteredWorkflows = workflows.filter(workflow =>
        workflow.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort by last updated
    const sortedWorkflows = [...filteredWorkflows].sort((a, b) =>
        new Date(b.updated_at) - new Date(a.updated_at)
    );

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-surface text-primary">Loading...</div>;
    }

    return (
        <>
            <div className="min-h-screen bg-surface text-primary">
            {/* Header */}
                <nav className="toolbar px-6 py-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-semibold">My Workspace</h1>
                    <div className="flex items-center space-x-4">
                        {activeTab === 'workflows' && (
                                <>
                                    <button
                                        onClick={() => openFolderModal()}
                                        className="btn btn-success text-sm"
                                    >
                                        New Folder
                                    </button>
                            <button
                                onClick={() => navigate(`${basePath}/new`)}
                                        className="btn btn-primary text-sm"
                            >
                                New Workflow
                            </button>
                                </>
                        )}
                        <button
                            onClick={handleLogout}
                                className="btn btn-danger text-sm"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            {/* Tabs */}
                <div className="border-b border-subtle bg-surface-elevated">
                <div className="px-6">
                        <nav className="flex space-x-2 p-4 items-center justify-center gap-4" aria-label="Tabs">
                            <button
                                onClick={() => setActiveTab('workflows')}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                                    activeTab === 'workflows'
                                            ? 'bg-primary-soft text-primary shadow-card border border-subtle rounded-xl'
                                            : 'text-muted hover:text-primary hover:bg-surface-muted border border-subtle rounded-xl'
                                }`}
                            >
                                Workflows
                            </button>
                            <button
                                onClick={() => setActiveTab('credentials')}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                                    activeTab === 'credentials'
                                            ? 'bg-primary-soft text-primary shadow-card border border-subtle rounded-xl'
                                            : 'text-muted hover:text-primary hover:bg-surface-muted border border-subtle rounded-xl'
                                }`}
                            >
                                Credentials
                            </button>
                    </nav>
                </div>
            </div>

            <div className="px-6 py-6">{activeTab === 'credentials' ? (
                    <CredentialsTab />
                ) : (
                    <>
                {/* Search and Filter Bar */}
                <div className="flex items-center space-x-3 mb-6">
                    <div className="flex-1 relative">
                            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search"
                                className="w-full bg-surface-elevated border border-subtle rounded-xl px-10 py-2 text-sm text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                        <button className="bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm flex items-center space-x-2 text-secondary hover:bg-surface-muted">
                        <span>Sort by last updated</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                        <button className="bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-secondary hover:bg-surface-muted">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                    </button>
                </div>

                {/* Folder Tree */}
                <div className="space-y-2">
                    {/* Folders with workflows */}
                    {folders.map((folder) => (
                        <div
                            key={`folder-${folder.id}`}
                            className={`border rounded-2xl overflow-hidden bg-surface-elevated shadow-card transition-all ${
                                dragOverFolderId === String(folder.id) ? 'border-blue-400 ring-2 ring-blue-200 bg-primary-soft/60' : 'border-subtle'
                            }`}
                            onDragOver={(event) => handleFolderDragOver(event, folder.id)}
                            onDragEnter={(event) => handleFolderDragOver(event, folder.id)}
                            onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                            onDrop={(event) => handleFolderDrop(event, folder.id)}
                        >
                            {/* Folder Header */}
                            <div 
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-surface-muted transition-colors"
                                onClick={() => toggleFolder(folder.id)}
                            >
                                <div className="flex items-center space-x-3">
                                    <svg className={`w-4 h-4 text-muted transition-transform ${expandedFolders[folder.id] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                    </svg>
                                    <span className="text-primary font-medium">{folder.name}</span>
                                    <span className="text-sm text-muted">({folder.workflows?.length || 0})</span>
                                    {folder.user_permission === 'view' && (
                                        <span className="px-2 py-0.5 bg-primary-soft text-primary text-xs rounded-full">
                                            View Only
                                        </span>
                                    )}
                                    {folder.user_permission === 'edit' && folder.created_by !== currentUser.id && (
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-full">
                                            Can Edit
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openFolderModal(folder);
                                        }}
                                        className="text-muted hover:text-primary p-2"
                                        title="Edit folder"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16 3l5 5M16 3l-5 5M21 8l-5-5" />
                                        </svg>
                                    </button>
                                <button
                                    onClick={(e) => handleDeleteFolder(folder.id, folder.name, e)}
                                        className="text-muted hover:text-danger p-2"
                                    title="Delete folder and all workflows inside"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                                </div>
                            </div>

                            {/* Folder Workflows - Collapsible */}
                            {expandedFolders[folder.id] && (
                                <div className="bg-surface">
                                    {folder.workflows?.map((workflow) => (
                                        <div
                                            key={workflow.id}
                                            draggable
                                            onDragStart={(event) => handleWorkflowDragStart(event, workflow, folder.id)}
                                            onDragEnd={handleWorkflowDragEnd}
                                            onClick={() => navigate(`${basePath}/${workflow.id}`)}
                                            className={`px-4 py-3 pl-12 flex items-center justify-between cursor-pointer hover:bg-surface-muted transition-colors border-t border-subtle ${
                                                draggedWorkflow?.id === workflow.id ? 'opacity-60' : ''
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center space-x-2 mb-1">
                                                    <h3 className="text-primary font-medium">{workflow.name}</h3>
                                                    {workflow.is_from_folder && (
                                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-xs rounded-full flex items-center space-x-1">
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                                            </svg>
                                                            <span>Synced</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center space-x-3 text-sm text-muted">
                                                    <span>Last updated {getTimeAgo(workflow.updated_at)}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-6 ml-4">
                                                <span className={`text-sm ${workflow.active ? 'text-emerald-600' : 'text-muted'}`}>
                                                    {workflow.active ? 'Active' : 'Inactive'}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(workflow.id, workflow, e);
                                                    }}
                                                    className="text-muted hover:text-danger p-2"
                                                    title={workflow.is_from_folder ? "Delete workflow from folder" : "Delete workflow"}
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    <div
                        className={`mt-6 rounded-2xl border transition-all ${
                            dragOverFolderId === UNASSIGNED_DROP_KEY ? 'border-blue-400 ring-2 ring-blue-200 bg-primary-soft/40' : 'border-transparent'
                        }`}
                        onDragOver={(event) => handleFolderDragOver(event, null)}
                        onDragEnter={(event) => handleFolderDragOver(event, null)}
                        onDragLeave={(event) => handleFolderDragLeave(event, null)}
                        onDrop={(event) => handleFolderDrop(event, null)}
                    >
                        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                            <h3 className="text-muted text-sm font-semibold">MY WORKFLOWS</h3>
                            <span className="text-xs text-muted">{workflowsWithoutFolder.length}</span>
                        </div>
                        <div className="space-y-2 px-4 pb-4">
                            {workflowsWithoutFolder.length === 0 ? (
                                <div className="px-3 py-6 text-xs text-muted italic">
                                    Thả workflow vào đây để gỡ khỏi folder.
                                </div>
                            ) : (
                                workflowsWithoutFolder.map((workflow) => (
                        <div
                            key={workflow.id}
                                        draggable
                                        onDragStart={(event) => handleWorkflowDragStart(event, workflow, null)}
                                        onDragEnd={handleWorkflowDragEnd}
                            onClick={() => navigate(`${basePath}/${workflow.id}`)}
                                        className={`bg-surface-elevated border border-subtle rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-surface-muted transition-colors shadow-card ${
                                            draggedWorkflow?.id === workflow.id ? 'opacity-60' : ''
                                        }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                                <h3 className="text-primary font-medium">{workflow.name}</h3>
                                    {workflow.is_from_folder && (
                                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-xs rounded-full flex items-center space-x-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                                            <path
                                                                fillRule="evenodd"
                                                                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                                                                clipRule="evenodd"
                                                            />
                                            </svg>
                                            <span>From Folder</span>
                                        </span>
                                    )}
                                </div>
                                            <div className="flex items-center space-x-3 text-sm text-muted">
                                    <span>Last updated {getTimeAgo(workflow.updated_at)}</span>
                                    <span>|</span>
                                    <span>Created {formatDate(workflow.created_at)}</span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-6 ml-4">
                                <div className="flex items-center space-x-2">
                                                <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                                <span className="text-sm text-muted">Personal</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                                <span className={`text-sm ${workflow.active ? 'text-emerald-600' : 'text-muted'}`}>
                                        {workflow.active ? 'Active' : 'Inactive'}
                                    </span>
                                    <button
                                        onClick={(e) => handleToggleActive(workflow, e)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                        workflow.active ? 'bg-emerald-500' : 'bg-surface-muted'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                workflow.active ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(workflow.id, workflow, e);
                                        }}
                                                    className="text-muted hover:text-danger p-2"
                                                    title={workflow.is_from_folder ? 'Delete workflow from folder' : 'Delete workflow'}
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                                ))
                            )}
                        </div>
                    </div>
                    {sortedWorkflows.length === 0 && (
                        <div className="text-center py-12 text-muted">
                            <p>No workflows found. Create your first workflow!</p>
                        </div>
                    )}
                </div>
                    </>
                )}
            </div>
        </div>
        {showCreateFolderModal && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
                <div className="bg-surface-elevated border border-subtle rounded-2xl shadow-card w-full max-w-md p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-primary">{editingFolder ? 'Edit Folder' : 'New Folder'}</h2>
                        <button onClick={closeCreateFolderModal} className="text-muted hover:text-primary">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Folder name *</label>
                            <input
                                type="text"
                                value={newFolder.name}
                                onChange={(e) => setNewFolder((prev) => ({ ...prev, name: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl border border-subtle bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Description</label>
                            <textarea
                                value={newFolder.description}
                                onChange={(e) => setNewFolder((prev) => ({ ...prev, description: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl border border-subtle bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={3}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={closeCreateFolderModal} className="btn btn-muted text-sm">
                                Huỷ
                            </button>
                            <button type="submit" disabled={savingFolder} className="btn btn-primary text-sm">
                                {savingFolder
                                    ? editingFolder ? 'Saving...' : 'Creating...'
                                    : editingFolder ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
        </>
    );
};

// Helper functions
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
        }
    }
    return 'just now';
}

function formatDate(date) {
    const d = new Date(date);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default WorkflowList;

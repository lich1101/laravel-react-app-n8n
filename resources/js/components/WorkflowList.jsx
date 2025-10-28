import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import { useNavigate } from 'react-router-dom';
import CredentialsTab from './CredentialsTab';

const WorkflowList = () => {
    const [workflows, setWorkflows] = useState([]);
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedFolders, setExpandedFolders] = useState({});
    const [activeTab, setActiveTab] = useState('workflows'); // 'workflows' or 'credentials'
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [workflowsRes, foldersRes] = await Promise.all([
                axios.get('/workflows'),
                axios.get('/project-folders')
            ]);
            setWorkflows(workflowsRes.data);
            setFolders(foldersRes.data);
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

    const canEditWorkflow = (folder) => {
        if (!folder) return true; // Workflows without folder - user owns them
        return folder.user_permission === 'edit';
    };

    const canDeleteWorkflow = (workflow, folder) => {
        if (workflow.is_from_folder) return false; // Synced workflows cannot be deleted
        if (!folder) return true; // User's own workflows
        return folder.can_delete; // Based on folder permission
    };

    const handleDelete = async (id, workflow, e) => {
        e.stopPropagation();
        
        // Ngăn xóa workflows được sync từ folder
        if (workflow.is_from_folder) {
            alert('⚠️ Workflow này được sync từ Administrator.\nBạn không thể xóa, chỉ có thể sửa.\n\nĐể xóa, vui lòng liên hệ Administrator.');
            return;
        }
        
        if (window.confirm('Are you sure you want to delete this workflow?')) {
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
        return <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-semibold">My Workspace</h1>
                    <div className="flex items-center space-x-4">
                        {activeTab === 'workflows' && (
                            <button
                                onClick={() => navigate('/workflows/new')}
                                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
                            >
                                New Workflow
                            </button>
                        )}
                        <button
                            onClick={handleLogout}
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-medium"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            {/* Tabs */}
            <div className="border-b border-gray-800 bg-gray-900">
                <div className="px-6">
                    <nav className="flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('workflows')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'workflows'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                            }`}
                        >
                            Workflows
                        </button>
                        <button
                            onClick={() => setActiveTab('credentials')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'credentials'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
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
                        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search"
                            className="w-full bg-gray-900 border border-gray-700 rounded px-10 py-2 text-sm focus:outline-none focus:border-blue-600"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm flex items-center space-x-2">
                        <span>Sort by last updated</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <button className="bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                    </button>
                </div>

                {/* Folder Tree */}
                <div className="space-y-2">
                    {/* Folders with workflows */}
                    {folders.map((folder) => (
                        <div key={`folder-${folder.id}`} className="border border-gray-800 rounded-lg overflow-hidden">
                            {/* Folder Header */}
                            <div 
                                className="bg-gray-900 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800"
                                onClick={() => toggleFolder(folder.id)}
                            >
                                <div className="flex items-center space-x-3">
                                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedFolders[folder.id] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                    </svg>
                                    <span className="text-white font-medium">{folder.name}</span>
                                    <span className="text-sm text-gray-400">({folder.workflows?.length || 0})</span>
                                    {folder.user_permission === 'view' && (
                                        <span className="px-2 py-0.5 bg-blue-900 text-blue-300 text-xs rounded-full">
                                            View Only
                                        </span>
                                    )}
                                    {folder.user_permission === 'edit' && folder.created_by !== currentUser.id && (
                                        <span className="px-2 py-0.5 bg-green-900 text-green-300 text-xs rounded-full">
                                            Can Edit
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Folder Workflows - Collapsible */}
                            {expandedFolders[folder.id] && (
                                <div className="bg-gray-950">
                                    {folder.workflows?.map((workflow) => (
                                        <div
                                            key={workflow.id}
                                            onClick={() => navigate(`/workflows/${workflow.id}`)}
                                            className="px-4 py-3 pl-12 flex items-center justify-between cursor-pointer hover:bg-gray-900 transition-colors border-t border-gray-800"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center space-x-2 mb-1">
                                                    <h3 className="text-white font-medium">{workflow.name}</h3>
                                                    {workflow.is_from_folder && (
                                                        <span className="px-2 py-0.5 bg-purple-900 text-purple-300 text-xs rounded-full flex items-center space-x-1">
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                                            </svg>
                                                            <span>Synced</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center space-x-3 text-sm text-gray-400">
                                                    <span>Last updated {getTimeAgo(workflow.updated_at)}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-6 ml-4">
                                                <span className={`text-sm ${workflow.active ? 'text-green-400' : 'text-gray-400'}`}>
                                                    {workflow.active ? 'Active' : 'Inactive'}
                                                </span>
                                                {!canDeleteWorkflow(workflow, folder) && (
                                                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Workflows without folder - My Workflows */}
                    {workflowsWithoutFolder.length > 0 && (
                        <div className="mt-4">
                            <h3 className="text-gray-400 text-sm font-semibold mb-2 px-2">MY WORKFLOWS</h3>
                        </div>
                    )}
                    {workflowsWithoutFolder.map((workflow) => (
                        <div
                            key={workflow.id}
                            onClick={() => navigate(`/workflows/${workflow.id}`)}
                            className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition-colors"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                    <h3 className="text-white font-medium">{workflow.name}</h3>
                                    {workflow.is_from_folder && (
                                        <span className="px-2 py-0.5 bg-purple-900 text-purple-300 text-xs rounded-full flex items-center space-x-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                            </svg>
                                            <span>From Folder</span>
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center space-x-3 text-sm text-gray-400">
                                    <span>Last updated {getTimeAgo(workflow.updated_at)}</span>
                                    <span>|</span>
                                    <span>Created {formatDate(workflow.created_at)}</span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-6 ml-4">
                                <div className="flex items-center space-x-2">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span className="text-sm text-gray-400">Personal</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className={`text-sm ${workflow.active ? 'text-green-400' : 'text-gray-400'}`}>
                                        {workflow.active ? 'Active' : 'Inactive'}
                                    </span>
                                    <button
                                        onClick={(e) => handleToggleActive(workflow, e)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            workflow.active ? 'bg-green-600' : 'bg-gray-700'
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
                                    {workflow.is_from_folder ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(workflow.id, workflow, e);
                                            }}
                                            className="text-gray-600 cursor-not-allowed p-2"
                                            title="Không thể xóa workflow từ folder. Chỉ có thể sửa."
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(workflow.id, workflow, e);
                                            }}
                                            className="text-gray-400 hover:text-red-400 p-2"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {sortedWorkflows.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <p>No workflows found. Create your first workflow!</p>
                        </div>
                    )}
                </div>
                    </>
                )}
            </div>
        </div>
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

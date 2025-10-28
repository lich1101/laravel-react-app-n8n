import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';
import FolderWorkflowView from './FolderWorkflowView';
import SyncModal from './SyncModal';
import PermissionModal from './PermissionModal';

const FoldersTab = () => {
    const [folders, setFolders] = useState([]);
    const [workflows, setWorkflows] = useState([]);
    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdministrator = user.role === 'administrator';
    const [showForm, setShowForm] = useState(false);
    const [showWorkflowModal, setShowWorkflowModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showFolderWorkflows, setShowFolderWorkflows] = useState(false);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [viewingFolder, setViewingFolder] = useState(null);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncFolder, setSyncFolder] = useState(null);
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [permissionFolder, setPermissionFolder] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        workflows: []
    });
    const [editingFolder, setEditingFolder] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

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
            setShowForm(false);
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
        setShowForm(true);
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

    const handleManagePermissions = (folder) => {
        console.log('handleManagePermissions called for folder:', folder.name);
        console.log('Current users state:', users);
        console.log('Current showPermissionModal:', showPermissionModal);
        setPermissionFolder(folder);
        setShowPermissionModal(true);
        console.log('Modal state updated:', { showPermissionModal: true, folder: folder.name });
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
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Folders</h2>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingFolder(null);
                        setFormData({ name: '', description: '', workflows: [] });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                    Add Folder
                </button>
            </div>

            {showForm && (
                <div className="mb-6 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-md font-semibold mb-3 text-gray-900 dark:text-white">
                        {editingFolder ? 'Edit Folder' : 'Add New Folder'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex space-x-2">
                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                            >
                                {editingFolder ? 'Update' : 'Create'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditingFolder(null);
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Description
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Workflows
                            </th>
                            {isAdministrator && (
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Projects
                                </th>
                            )}
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {folders.map((folder) => (
                            <tr
                                key={folder.id}
                                onDoubleClick={() => handleDoubleClickFolder(folder)}
                                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {folder.name}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                    {folder.description || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {folder.workflows?.length || 0} workflows
                                </td>
                                {isAdministrator && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {folder.projects?.length || 0} projects
                                    </td>
                                )}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                    <button
                                        onClick={() => handleEdit(folder)}
                                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleManageWorkflows(folder)}
                                        className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                    >
                                        Workflows
                                    </button>
                                    {isAdministrator && (
                                        <button
                                            onClick={() => handleAssignProjects(folder)}
                                            className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
                                        >
                                            Projects
                                        </button>
                                    )}
                                    {isAdministrator && (
                                        <button
                                            onClick={() => handleSyncFolder(folder)}
                                            className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300"
                                        >
                                            Sync
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleManagePermissions(folder)}
                                        className="text-cyan-600 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-cyan-300"
                                    >
                                        Permissions
                                    </button>
                                    <button
                                        onClick={() => handleDelete(folder.id)}
                                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
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
                            <span className="text-sm text-gray-900 dark:text-white">{workflow.name}</span>
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
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
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
                            <span className="text-sm text-gray-900 dark:text-white">{project.name}</span>
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

            {showPermissionModal && permissionFolder && (
                <PermissionModal
                    folder={permissionFolder}
                    users={users}
                    onClose={() => {
                        setShowPermissionModal(false);
                        setPermissionFolder(null);
                    }}
                    onUpdate={fetchData}
                />
            )}
        </div>
    );
};

export default FoldersTab;

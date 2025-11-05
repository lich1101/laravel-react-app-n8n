import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';

const ProjectsTab = () => {
    const [projects, setProjects] = useState([]);
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        subdomain: '',
        domain: '',
        status: 'active',
        max_concurrent_workflows: 5,
        folder_ids: []
    });
    const [editingProject, setEditingProject] = useState(null);
    const [expandedRows, setExpandedRows] = useState([]);
    const [syncing, setSyncing] = useState({});

    useEffect(() => {
        fetchProjects();
        fetchFolders();
    }, []);

    const fetchProjects = async () => {
        try {
            const response = await axios.get('/projects');
            setProjects(response.data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchFolders = async () => {
        try {
            const response = await axios.get('/folders');
            setFolders(response.data);
        } catch (error) {
            console.error('Error fetching folders:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingProject) {
                await axios.put(`/projects/${editingProject.id}`, formData);
            } else {
                await axios.post('/projects', formData);
            }
            setFormData({ name: '', subdomain: '', domain: '', status: 'active', max_concurrent_workflows: 5, folder_ids: [] });
            setShowForm(false);
            setEditingProject(null);
            fetchProjects();
        } catch (error) {
            console.error('Error saving project:', error);
        }
    };

    const handleEdit = (project) => {
        setEditingProject(project);
        setFormData({
            name: project.name,
            subdomain: project.subdomain,
            domain: project.domain || '',
            status: project.status,
            max_concurrent_workflows: project.max_concurrent_workflows || 5,
            folder_ids: project.folders?.map(f => f.id) || []
        });
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this project?')) {
            try {
                await axios.delete(`/projects/${id}`);
                fetchProjects();
            } catch (error) {
                console.error('Error deleting project:', error);
            }
        }
    };

    const handleSync = async (projectId) => {
        try {
            setSyncing(prev => ({ ...prev, [projectId]: true }));
            await axios.post(`/projects/${projectId}/sync`);
            alert('Đã sync config và folders thành công!');
            fetchProjects();
        } catch (error) {
            console.error('Error syncing project:', error);
            alert('Không thể sync project. Vui lòng thử lại.');
        } finally {
            setSyncing(prev => ({ ...prev, [projectId]: false }));
        }
    };

    const toggleExpand = (projectId) => {
        setExpandedRows(prev =>
            prev.includes(projectId)
                ? prev.filter(id => id !== projectId)
                : [...prev, projectId]
        );
    };

    if (loading) {
        return <div className="text-center py-4">Loading...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Projects</h2>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingProject(null);
                        setFormData({ name: '', subdomain: '', domain: '', status: 'active', max_concurrent_workflows: 5, folder_ids: [] });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                    Add Project
                </button>
            </div>

            {showForm && (
                <div className="mb-6 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-md font-semibold mb-3 text-gray-900 dark:text-white">
                        {editingProject ? 'Edit Project' : 'Add New Project'}
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
                                Subdomain
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.subdomain}
                                onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Domain (optional)
                            </label>
                            <input
                                type="text"
                                value={formData.domain}
                                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Status
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Max Concurrent Workflows
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                required
                                value={formData.max_concurrent_workflows}
                                onChange={(e) => setFormData({ ...formData, max_concurrent_workflows: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Số workflow tối đa có thể chạy đồng thời
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Folders
                            </label>
                            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-3 bg-white dark:bg-gray-800">
                                {folders.map((folder) => (
                                    <label key={folder.id} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.folder_ids.includes(folder.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setFormData({
                                                        ...formData,
                                                        folder_ids: [...formData.folder_ids, folder.id]
                                                    });
                                                } else {
                                                    setFormData({
                                                        ...formData,
                                                        folder_ids: formData.folder_ids.filter(id => id !== folder.id)
                                                    });
                                                }
                                            }}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-900 dark:text-white">{folder.name}</span>
                                    </label>
                                ))}
                                {folders.length === 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có folder nào</p>
                                )}
                            </div>
                        </div>
                        <div className="flex space-x-2">
                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                            >
                                {editingProject ? 'Update' : 'Create'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditingProject(null);
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
                                
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Subdomain
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Max Workflows
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {projects.map((project) => (
                            <React.Fragment key={project.id}>
                                <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <button
                                            onClick={() => toggleExpand(project.id)}
                                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        >
                                            {expandedRows.includes(project.id) ? '▼' : '▶'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {project.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {project.subdomain}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                            {project.max_concurrent_workflows || 5}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                project.status === 'active'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            {project.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => handleSync(project.id)}
                                            disabled={syncing[project.id]}
                                            className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300 disabled:opacity-50"
                                        >
                                            {syncing[project.id] ? 'Syncing...' : 'Sync'}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(project)}
                                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(project.id)}
                                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                                {expandedRows.includes(project.id) && (
                                    <tr className="bg-gray-50 dark:bg-gray-800">
                                        <td colSpan="6" className="px-6 py-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                                        📁 Folders ({project.folders?.length || 0})
                                                    </h4>
                                                    <div className="space-y-1">
                                                        {project.folders && project.folders.length > 0 ? (
                                                            project.folders.map(folder => (
                                                                <div key={folder.id} className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 px-3 py-2 rounded">
                                                                    {folder.name}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có folder nào</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                                        ⚙️ Configuration
                                                    </h4>
                                                    <div className="space-y-2 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-700 dark:text-gray-300">Max Concurrent Workflows:</span>
                                                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                                                                {project.max_concurrent_workflows || 5}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-700 dark:text-gray-300">Domain:</span>
                                                            <span className="font-mono text-gray-600 dark:text-gray-400 text-xs">
                                                                {project.domain || project.subdomain}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ProjectsTab;

import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';

const PROJECT_BASE_DOMAIN = import.meta.env.VITE_PROJECT_BASE_DOMAIN || 'chatplus.vn';

const sanitizeEnvironmentName = (value = '') => {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 63);
};

const EnvironmentPreview = ({ name, editingProject }) => {
    const derivedSubdomain = sanitizeEnvironmentName(name);
    const derivedDomain = derivedSubdomain ? `${derivedSubdomain}.${PROJECT_BASE_DOMAIN}` : '';

    if (editingProject) {
        return (
            <div className="p-3 bg-white border border-gray-200 rounded-md">
                <p className="text-sm text-gray-700">
                    Subdomain hiện tại:&nbsp;
                    <span className="font-mono text-primary">{editingProject.subdomain}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                    Để thay đổi subdomain/domain vui lòng liên hệ devops hoặc sửa trực tiếp trong database.
                </p>
            </div>
        );
    }

    return (
        <div className="p-3 bg-white border border-dashed border-gray-300 rounded-md">
            <p className="text-sm text-gray-700">
                Subdomain dự kiến:&nbsp;
                <span className="font-mono text-primary">
                    {derivedSubdomain || '...'}
                </span>
            </p>
            <p className="text-sm text-gray-700 mt-1">
                Domain dự kiến:&nbsp;
                <span className="font-mono text-primary">
                    {derivedDomain || `*.${PROJECT_BASE_DOMAIN}`}
                </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
                Hệ thống sẽ tự động chạy script provisioning với tên môi trường phía trên.
            </p>
        </div>
    );
};

const ProjectsTab = () => {
    const [projects, setProjects] = useState([]);
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
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
        const payload = {
            name: formData.name,
            status: formData.status,
            max_concurrent_workflows: formData.max_concurrent_workflows,
            folder_ids: formData.folder_ids,
        };

        try {
            if (editingProject) {
                await axios.put(`/projects/${editingProject.id}`, payload);
            } else {
                await axios.post('/projects', payload);
            }
            setFormData({ name: '', status: 'active', max_concurrent_workflows: 5, folder_ids: [] });
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
        <div className="bg-surface-elevated shadow-card p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingProject(null);
                        setFormData({ name: '', status: 'active', max_concurrent_workflows: 5, folder_ids: [] });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                    Add Project
                </button>
            </div>

            {showForm && (
                <div className="mb-6 bg-gray-100 p-4 rounded-lg">
                    <h3 className="text-md font-semibold mb-3 text-gray-900">
                        {editingProject ? 'Edit Project' : 'Add New Project'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            />
                        </div>
                        <EnvironmentPreview
                            name={formData.name}
                            editingProject={editingProject}
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Status
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Max Concurrent Workflows
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                required
                                value={formData.max_concurrent_workflows}
                                onChange={(e) => setFormData({ ...formData, max_concurrent_workflows: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Số workflow tối đa có thể chạy đồng thời
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Folders
                            </label>
                            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3 bg-white">
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
                                        <span className="text-sm text-gray-900">{folder.name}</span>
                                    </label>
                                ))}
                                {folders.length === 0 && (
                                    <p className="text-sm text-gray-500">Chưa có folder nào</p>
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
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Subdomain
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Max Workflows
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {projects.map((project) => (
                            <React.Fragment key={project.id}>
                                <tr className="hover:bg-surface-muted/80 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <button
                                            onClick={() => toggleExpand(project.id)}
                                            className="text-muted hover:text-primary"
                                        >
                                            {expandedRows.includes(project.id) ? '▼' : '▶'}
                                        </button>
                                    </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary">
                                    {project.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    {project.subdomain}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                        <span className="bg-primary-soft text-primary px-2 py-1 rounded-full">
                                            {project.max_concurrent_workflows || 5}
                                        </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            project.status === 'active'
                                                ? 'bg-emerald-50 text-emerald-600'
                                                : 'bg-surface-muted text-secondary'
                                        }`}
                                    >
                                        {project.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => handleSync(project.id)}
                                            disabled={syncing[project.id]}
                                            className="text-purple-600 hover:text-purple-500 disabled:opacity-50"
                                        >
                                            {syncing[project.id] ? 'Syncing...' : 'Sync'}
                                        </button>
                                    <button
                                        onClick={() => handleEdit(project)}
                                        className="text-primary hover:text-primary/80"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(project.id)}
                                        className="text-rose-600 hover:text-rose-500"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                                {expandedRows.includes(project.id) && (
                                    <tr className="bg-surface-muted/60">
                                        <td colSpan="6" className="px-6 py-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <h4 className="text-sm font-semibold text-primary mb-2">
                                                        📁 Folders ({project.folders?.length || 0})
                                                    </h4>
                                                    <div className="space-y-1">
                                                        {project.folders && project.folders.length > 0 ? (
                                                            project.folders.map(folder => (
                                                                <div key={folder.id} className="text-sm text-secondary bg-surface-elevated px-3 py-2 rounded-2xl border border-subtle">
                                                                    {folder.name}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <p className="text-sm text-muted">Chưa có folder nào</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-primary mb-2">
                                                        ⚙️ Configuration
                                                    </h4>
                                                    <div className="space-y-2 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-700">Max Concurrent Workflows:</span>
                                                            <span className="font-semibold text-blue-600">
                                                                {project.max_concurrent_workflows || 5}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-700">Domain:</span>
                                                            <span className="font-mono text-gray-600 text-xs">
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

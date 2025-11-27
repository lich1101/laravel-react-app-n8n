import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';
import SsoRoleModal from './SsoRoleModal';

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

const provisioningLabel = {
    provisioning: 'Đang khởi tạo',
    completed: 'Hoàn thành',
    failed: 'Thất bại',
};

const provisioningStyle = {
    provisioning: 'bg-blue-100 text-blue-600',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-rose-100 text-rose-700',
};

const ICONS = {
    sync: new URL('../../../../public/icons/manager_project/sync.svg', import.meta.url).href,
    git: new URL('../../../../public/icons/manager_project/git.svg', import.meta.url).href,
    edit: new URL('../../../../public/icons/manager_project/edit.svg', import.meta.url).href,
    delete: new URL('../../../../public/icons/manager_project/delete.svg', import.meta.url).href,
};

const ActionButton = ({ label, onClick, disabled, Icon, iconSrc, className = '' }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`relative group inline-flex items-center justify-center text-sm font-medium transition-colors ${className}`}
        >
            <span className="sr-only">{label}</span>
            {iconSrc ? (
                <img src={iconSrc} alt="" className="h-5 w-5 object-contain" />
            ) : (
                <Icon className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                {disabled ? 'Đang xử lý...' : label}
            </span>
        </button>
    );
};

const ProjectsTab = () => {
    const [projects, setProjects] = useState([]);
    const [subscriptionPackages, setSubscriptionPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showSsoRoleModal, setShowSsoRoleModal] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        subscription_package_id: ''
    });
    const [editingProject, setEditingProject] = useState(null);
    const [expandedRows, setExpandedRows] = useState([]);
    const [syncing, setSyncing] = useState({});
    const [provisioningProjects, setProvisioningProjects] = useState(new Set());
    const [updatingGit, setUpdatingGit] = useState({});
    const [updatingAllGit, setUpdatingAllGit] = useState(false);

    useEffect(() => {
        fetchProjects();
        fetchSubscriptionPackages();
    }, []);

    // Polling for provisioning status
    useEffect(() => {
        const provisioningIds = projects
            .filter(p => p.provisioning_status === 'provisioning')
            .map(p => p.id);
        
        if (provisioningIds.length === 0) {
            setProvisioningProjects(new Set());
            return;
        }

        setProvisioningProjects(new Set(provisioningIds));

        const interval = setInterval(() => {
            fetchProjects();
        }, 2000); // Poll every 2 seconds

        return () => clearInterval(interval);
    }, [projects]);

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

    const fetchSubscriptionPackages = async () => {
        try {
            const response = await axios.get('/subscription-packages');
            setSubscriptionPackages(response.data);
        } catch (error) {
            console.error('Error fetching subscription packages:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            name: formData.name,
            subscription_package_id: formData.subscription_package_id || null,
        };

        try {
            if (editingProject) {
                await axios.put(`/projects/${editingProject.id}`, payload);
            } else {
                const response = await axios.post('/projects', payload);
                // Add to provisioning set if status is provisioning
                if (response.data.provisioning_status === 'provisioning') {
                    setProvisioningProjects(prev => new Set([...prev, response.data.id]));
                }
            }
            setFormData({ name: '', subscription_package_id: '' });
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
            subscription_package_id: project.subscription_package_id || ''
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
            fetchProjects();
        } catch (error) {
            console.error('Error syncing project:', error);
        } finally {
            setSyncing(prev => ({ ...prev, [projectId]: false }));
        }
    };

    const handleUpdateGit = async (project) => {
        try {
            setUpdatingGit(prev => ({ ...prev, [project.id]: true }));
            await axios.post(`/projects/${project.id}/update-git`);
            fetchProjects();
        } catch (error) {
            console.error('Error updating git for project:', error);
        } finally {
            setUpdatingGit(prev => {
                const next = { ...prev };
                delete next[project.id];
                return next;
            });
        }
    };

    const handleUpdateGitAll = async () => {
        try {
            setUpdatingAllGit(true);
            await axios.post('/projects/update-git-all');
            fetchProjects();
        } catch (error) {
            console.error('Error updating git for all projects:', error);
        } finally {
            setUpdatingAllGit(false);
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

    const hasProvisioning = provisioningProjects.size > 0;
    const hasSyncing = Object.keys(syncing).some(key => syncing[key]);
    const hasUpdatingGit = Object.keys(updatingGit).some(key => updatingGit[key]);
    const hasAnyOperation = hasProvisioning || hasSyncing || hasUpdatingGit || updatingAllGit;

    const getLoadingMessage = () => {
        if (hasProvisioning) return 'Đang tạo project...';
        if (updatingAllGit) return 'Đang cập nhật git cho tất cả project...';
        if (hasUpdatingGit) return 'Đang cập nhật git...';
        if (hasSyncing) return 'Đang sync config và folders...';
        return 'Đang xử lý...';
    };

    return (
        <div className="bg-surface-elevated shadow-card p-4 relative">
            {hasAnyOperation && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">{getLoadingMessage()}</h3>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                            <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                        </div>
                        <p className="text-sm text-gray-600 text-center">
                            Vui lòng đợi trong giây lát. Hệ thống đang xử lý...
                        </p>
                    </div>
                </div>
            )}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={handleUpdateGitAll}
                        disabled={updatingAllGit}
                        className="bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-60 px-4 py-2 rounded-md text-sm font-medium"
                    >
                        {updatingAllGit ? 'Updating...' : 'Update Git'}
                    </button>
                    <button
                        onClick={() => {
                            setShowForm(true);
                            setEditingProject(null);
                            setFormData({ name: '', subscription_package_id: '' });
                        }}
                        className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium space-x-2"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Add Project</span>
                    </button>
                </div>
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
                                disabled={Boolean(editingProject)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                            {editingProject && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Không thể sửa tên dự án sau khi đã tạo.
                                </p>
                            )}
                        </div>
                        <EnvironmentPreview
                            name={formData.name}
                            editingProject={editingProject}
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Gói cước
                            </label>
                            <select
                                value={formData.subscription_package_id}
                                onChange={(e) => setFormData({ ...formData, subscription_package_id: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            >
                                <option value="">-- Chọn gói cước --</option>
                                {subscriptionPackages.map((pkg) => (
                                    <option key={pkg.id} value={pkg.id}>
                                        {pkg.name} (Max Workflows: {pkg.max_concurrent_workflows}, User Workflows: {pkg.max_user_workflows})
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                Chọn gói cước để tự động áp dụng folders và cấu hình
                            </p>
                            {formData.subscription_package_id && (() => {
                                const selectedPackage = subscriptionPackages.find(p => p.id === parseInt(formData.subscription_package_id));
                                if (selectedPackage) {
                                    return (
                                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                            <p className="text-sm font-semibold text-blue-900 mb-1">{selectedPackage.name}</p>
                                            <p className="text-xs text-blue-700">Max Concurrent Workflows: {selectedPackage.max_concurrent_workflows}</p>
                                            <p className="text-xs text-blue-700">Max User Workflows: {selectedPackage.max_user_workflows}</p>
                                            {selectedPackage.folders && selectedPackage.folders.length > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-xs font-semibold text-blue-700">Folders:</p>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {selectedPackage.folders.map(folder => (
                                                            <span key={folder.id} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                                {folder.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
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
                                Link
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Subdomain
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Max Workflows
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Provisioning
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
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setSelectedProject(project);
                                            setShowSsoRoleModal(true);
                                        }}
                                        className="text-primary hover:text-primary/80 hover:underline cursor-pointer"
                                        title="Click để tự động đăng nhập vào project domain"
                                    >
                                        {project.domain}
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    {project.subdomain}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                        <span className="bg-primary-soft text-primary px-2 py-1 rounded-full">
                                            {project.max_concurrent_workflows || 5}
                                        </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${provisioningStyle[project.provisioning_status] || 'bg-gray-100 text-gray-600'}`}
                                    >
                                        {provisioningLabel[project.provisioning_status] || 'Không rõ'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center space-x-3">
                                        <ActionButton
                                            label={syncing[project.id] ? 'Đang sync...' : 'Sync config/folders'}
                                            onClick={() => handleSync(project.id)}
                                            disabled={syncing[project.id]}
                                            iconSrc={ICONS.sync}
                                            className="text-purple-600 hover:text-purple-500 disabled:opacity-50"
                                        />
                                        <ActionButton
                                            label={updatingGit[project.id] ? 'Đang update git...' : 'Update git cho dự án'}
                                            onClick={() => handleUpdateGit(project)}
                                            disabled={Boolean(updatingGit[project.id])}
                                            iconSrc={ICONS.git}
                                            className="text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
                                        />
                                        <ActionButton
                                            label="Chỉnh sửa dự án"
                                            onClick={() => handleEdit(project)}
                                            disabled={false}
                                            iconSrc={ICONS.edit}
                                            className="text-primary hover:text-primary/80"
                                        />
                                        <ActionButton
                                            label="Xóa dự án"
                                            onClick={() => handleDelete(project.id)}
                                            disabled={false}
                                            iconSrc={ICONS.delete}
                                            className="text-rose-600 hover:text-rose-500"
                                        />
                                    </div>
                                </td>
                            </tr>
                                {expandedRows.includes(project.id) && (
                                    <tr className="bg-surface-muted/60">
                                        <td colSpan="5" className="px-6 py-4">
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
                                                            <span className="text-gray-700">Provisioning:</span>
                                                            <span className={`font-semibold ${provisioningStyle[project.provisioning_status] || ''}`}>
                                                                {provisioningLabel[project.provisioning_status] || 'Không rõ'}
                                                            </span>
                                                        </div>
                                                        {project.provisioning_status === 'failed' && project.provisioning_error && (
                                                            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md p-2">
                                                                ⚠️ {project.provisioning_error}
                                                            </div>
                                                        )}
                                                        {project.subscription_package && (
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-700">Gói cước:</span>
                                                                <span className="font-semibold text-purple-600">
                                                                    {project.subscription_package.name}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-700">Max Concurrent Workflows:</span>
                                                            <span className="font-semibold text-blue-600">
                                                                {project.max_concurrent_workflows || 5}
                                                            </span>
                                                        </div>
                                                        {project.max_user_workflows !== null && (
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-700">Max User Workflows:</span>
                                                                <span className="font-semibold text-green-600">
                                                                    {project.max_user_workflows}
                                                                </span>
                                                            </div>
                                                        )}
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

            <SsoRoleModal
                isOpen={showSsoRoleModal}
                onClose={() => {
                    setShowSsoRoleModal(false);
                    setSelectedProject(null);
                }}
                onConfirm={handleSsoLogin}
                projectDomain={selectedProject?.domain || ''}
            />
        </div>
    );
};

export default ProjectsTab;

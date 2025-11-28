import React, { useEffect, useState } from 'react';
import axios from '../../config/axios';

const WebManagerProjectTab = () => {
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        name: ''
    });
    const [provisioningStatus, setProvisioningStatus] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    // Polling for provisioning status
    useEffect(() => {
        if (project && project.provisioning_status === 'provisioning') {
            const interval = setInterval(() => {
                fetchProject();
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [project]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const projectRes = await axios.get('/web-manager/project').catch((err) => {
                // If 404, project doesn't exist - that's OK, show create form
                if (err.response?.status === 404) {
                    return { data: null };
                }
                console.error('Error fetching project:', err);
                throw err;
            });
            const projectData = projectRes?.data || null;
            setProject(projectData);
            if (projectData) {
                setProvisioningStatus(projectData.provisioning_status);
            }
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.response?.data?.error || 'Không thể tải dữ liệu');
        } finally {
            setLoading(false);
        }
    };

    const fetchProject = async () => {
        try {
            const response = await axios.get('/web-manager/project');
            setProject(response.data);
            setProvisioningStatus(response.data?.provisioning_status);
        } catch (err) {
            if (err.response?.status === 404) {
                setProject(null);
            } else {
                console.error('Error fetching project:', err);
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            setError('Vui lòng nhập tên trang web');
            return;
        }

        try {
            setCreating(true);
            setError(null);
            const response = await axios.post('/web-manager/project', {
                name: formData.name,
            });
            setProject(response.data);
            setProvisioningStatus(response.data.provisioning_status);
            setFormData({ name: '' });
        } catch (err) {
            setError(err.response?.data?.error || 'Không thể tạo trang web');
        } finally {
            setCreating(false);
        }
    };

    const handleSsoLogin = async () => {
        if (!project) return;

        try {
            // For web manager, always use 'user' role
            const response = await axios.get(`/projects/${project.id}/sso-token`, {
                params: { role: 'user' },
                headers: {
                    'Accept': 'application/json',
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (response.status === 200 && response.data?.url) {
                const newWindow = window.open(response.data.url, '_blank');
                if (!newWindow) {
                    alert('Popup bị chặn. Vui lòng cho phép popup và thử lại.');
                }
            } else {
                window.open(`https://${project.domain}`, '_blank');
            }
        } catch (error) {
            alert('Không thể tạo SSO token. Đang mở link trực tiếp...');
            window.open(`https://${project.domain}`, '_blank');
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="text-center text-secondary">Đang tải...</div>
            </div>
        );
    }

    console.log('WebManagerProjectTab render - project:', project, 'loading:', loading, 'error:', error);

    // Show create form if no project
    if (!project) {
        console.log('WebManagerProjectTab - No project, showing create form');
        return (
            <div className="p-8">
                <h2 className="text-2xl font-bold mb-6 text-primary">Tạo Trang web</h2>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-800">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-surface-elevated rounded-2xl border border-subtle shadow-card p-6 max-w-2xl">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-primary mb-2">
                            Tên trang web <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-subtle rounded-xl shadow-sm bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-primary"
                            placeholder="Nhập tên trang web"
                            required
                        />
                        <p className="text-xs text-muted mt-1">
                            Tên sẽ được dùng để tạo subdomain. Nếu tên đã tồn tại, hệ thống sẽ tự động thêm số vào sau.
                        </p>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={creating}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-card"
                        >
                            {creating ? 'Đang tạo...' : 'Tạo trang web'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // Show project info if exists
    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-primary">Thông tin Trang web</h2>
            
            <div className="bg-surface-elevated rounded-2xl border border-subtle shadow-card p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Tên trang web</label>
                    <div className="text-lg font-semibold text-primary">{project.name}</div>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Domain</label>
                    <div className="text-lg">
                        <a 
                            href={`https://${project.domain}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary-dark underline"
                        >
                            {project.domain}
                        </a>
                    </div>
                </div>

                {project.subscription_package && (
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Gói cước</label>
                        <div className="text-lg text-primary">{project.subscription_package.name}</div>
                    </div>
                )}

                {project.expires_at && (
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Thời hạn sử dụng</label>
                        <div className="text-lg text-primary">
                            {new Date(project.expires_at).toLocaleString('vi-VN')}
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Trạng thái</label>
                    <div className="text-lg">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                            project.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                            {project.status === 'active' ? 'Hoạt động' : project.status}
                        </span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Trạng thái provisioning</label>
                    <div className="text-lg">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                            project.provisioning_status === 'completed' ? 'bg-green-100 text-green-800' :
                            project.provisioning_status === 'provisioning' ? 'bg-yellow-100 text-yellow-800' :
                            project.provisioning_status === 'pending' ? 'bg-blue-100 text-blue-800' :
                            project.provisioning_status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                        }`}>
                            {project.provisioning_status === 'completed' ? 'Hoàn thành' :
                             project.provisioning_status === 'provisioning' ? 'Đang tạo...' :
                             project.provisioning_status === 'pending' ? 'Chờ duyệt' :
                             project.provisioning_status === 'failed' ? 'Thất bại' :
                             project.provisioning_status || 'Chưa tạo'}
                        </span>
                    </div>
                </div>

                {project.provisioning_status === 'completed' && project.subscription_package_id && (
                    <div className="pt-4 border-t border-subtle">
                        <button
                            onClick={handleSsoLogin}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-card"
                        >
                            Truy cập nhanh bằng SSO
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WebManagerProjectTab;

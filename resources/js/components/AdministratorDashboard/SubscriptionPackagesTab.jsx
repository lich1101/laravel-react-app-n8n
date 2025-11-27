import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';

const SubscriptionPackagesTab = () => {
    const [packages, setPackages] = useState([]);
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        max_concurrent_workflows: 5,
        max_user_workflows: 10,
        description: '',
        folder_ids: []
    });
    const [editingPackage, setEditingPackage] = useState(null);

    useEffect(() => {
        fetchPackages();
        fetchFolders();
    }, []);

    const fetchPackages = async () => {
        try {
            const response = await axios.get('/subscription-packages');
            setPackages(response.data);
        } catch (error) {
            console.error('Error fetching subscription packages:', error);
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
            max_concurrent_workflows: parseInt(formData.max_concurrent_workflows),
            max_user_workflows: parseInt(formData.max_user_workflows),
            description: formData.description,
            folder_ids: formData.folder_ids,
        };

        try {
            if (editingPackage) {
                await axios.put(`/subscription-packages/${editingPackage.id}`, payload);
            } else {
                await axios.post('/subscription-packages', payload);
            }
            setFormData({ name: '', max_concurrent_workflows: 5, max_user_workflows: 10, description: '', folder_ids: [] });
            setShowForm(false);
            setEditingPackage(null);
            fetchPackages();
        } catch (error) {
            console.error('Error saving subscription package:', error);
            alert('Có lỗi xảy ra khi lưu gói cước');
        }
    };

    const handleEdit = (pkg) => {
        setEditingPackage(pkg);
        setFormData({
            name: pkg.name,
            max_concurrent_workflows: pkg.max_concurrent_workflows,
            max_user_workflows: pkg.max_user_workflows,
            description: pkg.description || '',
            folder_ids: pkg.folders?.map(f => f.id) || []
        });
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa gói cước này?')) {
            try {
                await axios.delete(`/subscription-packages/${id}`);
                fetchPackages();
            } catch (error) {
                console.error('Error deleting subscription package:', error);
                if (error.response?.status === 422) {
                    alert(error.response.data.message || 'Không thể xóa gói cước đang được sử dụng');
                } else {
                    alert('Có lỗi xảy ra khi xóa gói cước');
                }
            }
        }
    };

    if (loading) {
        return <div className="text-center py-4">Loading...</div>;
    }

    return (
        <div className="bg-surface-elevated shadow-card p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Quản lý Gói cước</h2>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingPackage(null);
                        setFormData({ name: '', max_concurrent_workflows: 5, max_user_workflows: 10, description: '', folder_ids: [] });
                    }}
                    className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium space-x-2"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Thêm Gói cước</span>
                </button>
            </div>

            {showForm && (
                <div className="mb-6 bg-gray-100 p-4 rounded-lg">
                    <h3 className="text-md font-semibold mb-3 text-gray-900">
                        {editingPackage ? 'Chỉnh sửa Gói cước' : 'Thêm Gói cước mới'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tên gói cước
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            />
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Max User Workflows
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="1000"
                                required
                                value={formData.max_user_workflows}
                                onChange={(e) => setFormData({ ...formData, max_user_workflows: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Số workflow mà role user có thể tạo thêm trong project
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Mô tả
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                                rows="3"
                            />
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
                                {editingPackage ? 'Cập nhật' : 'Tạo'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditingPackage(null);
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                            >
                                Hủy
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
                                Tên
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Max Concurrent Workflows
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Max User Workflows
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Folders
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {packages.map((pkg) => (
                            <tr key={pkg.id} className="hover:bg-surface-muted/80 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary">
                                    {pkg.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    <span className="bg-primary-soft text-primary px-2 py-1 rounded-full">
                                        {pkg.max_concurrent_workflows}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                        {pkg.max_user_workflows}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-muted">
                                    <div className="flex flex-wrap gap-1">
                                        {pkg.folders && pkg.folders.length > 0 ? (
                                            pkg.folders.map(folder => (
                                                <span key={folder.id} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                                    {folder.name}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-gray-400">Chưa có folder</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center space-x-3">
                                        <button
                                            onClick={() => handleEdit(pkg)}
                                            className="text-blue-600 hover:text-blue-500"
                                        >
                                            Sửa
                                        </button>
                                        <button
                                            onClick={() => handleDelete(pkg.id)}
                                            className="text-rose-600 hover:text-rose-500"
                                        >
                                            Xóa
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {packages.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                                    Chưa có gói cước nào
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SubscriptionPackagesTab;


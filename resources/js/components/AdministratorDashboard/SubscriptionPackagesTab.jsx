import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';
import SubscriptionPackageModal from './SubscriptionPackageModal';

const SubscriptionPackagesTab = () => {
    const [packages, setPackages] = useState([]);
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
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

    const handleSave = async (payload, packageId) => {
        try {
            if (packageId) {
                await axios.put(`/subscription-packages/${packageId}`, payload);
            } else {
                await axios.post('/subscription-packages', payload);
            }
            fetchPackages();
        } catch (error) {
            console.error('Error saving subscription package:', error);
            throw error;
        }
    };

    const handleEdit = (pkg) => {
        setEditingPackage(pkg);
        setShowModal(true);
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
                        setEditingPackage(null);
                        setShowModal(true);
                    }}
                    className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium space-x-2"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Thêm Gói cước</span>
                </button>
            </div>

            {/* Subscription Package Modal */}
            <SubscriptionPackageModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                                    setEditingPackage(null);
                                }}
                onSave={handleSave}
                package={editingPackage}
                folders={folders}
            />


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
                                Thời hạn
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Giá
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    {pkg.duration_days ? (
                                        <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                            {pkg.duration_days >= 365 
                                                ? `${Math.floor(pkg.duration_days / 365)} năm`
                                                : pkg.duration_days >= 30
                                                ? `${Math.floor(pkg.duration_days / 30)} tháng`
                                                : `${pkg.duration_days} ngày`}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    {pkg.price ? (
                                        <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(pkg.price)}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
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
                                <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">
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


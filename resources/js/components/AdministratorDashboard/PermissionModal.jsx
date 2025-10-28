import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';

// PERMISSION MODAL V3.0 - REBUILT FROM SCRATCH
const PermissionModal = ({ folder, users, onClose, onUpdate }) => {
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedPermission, setSelectedPermission] = useState('view');
    const [granting, setGranting] = useState(false);

    useEffect(() => {
        if (folder) {
            fetchPermissions();
        }
    }, [folder]);

    const fetchPermissions = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/folders/${folder.id}/permissions`);
            setPermissions(response.data.permissions || []);
        } catch (error) {
            console.error('Error fetching permissions:', error);
            setPermissions([]);
        } finally {
            setLoading(false);
        }
    };

    const handleGrantPermission = async (e) => {
        e.preventDefault();
        if (!selectedUserId) {
            alert('Vui lòng chọn user');
            return;
        }

        setGranting(true);
        try {
            await axios.post(`/folders/${folder.id}/grant-permission`, {
                user_id: parseInt(selectedUserId),
                permission: selectedPermission
            });
            
            alert('Phân quyền thành công!');
            fetchPermissions();
            setSelectedUserId('');
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error('Error granting permission:', error);
            alert(error.response?.data?.error || 'Lỗi khi phân quyền');
        } finally {
            setGranting(false);
        }
    };

    const handleRevokePermission = async (userId) => {
        if (!window.confirm('Bạn có chắc muốn thu hồi quyền này?')) {
            return;
        }

        try {
            await axios.delete(`/folders/${folder.id}/revoke-permission/${userId}`);
            alert('Thu hồi quyền thành công!');
            fetchPermissions();
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error('Error revoking permission:', error);
            alert('Lỗi khi thu hồi quyền');
        }
    };

    // Filter available users - handle empty objects safely
    const availableUsers = (users || []).filter(user => {
        if (!user || !user.id) return false;
        if (user.id === folder.created_by) return false;
        return !permissions.some(p => p.user_id === user.id);
    });

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" 
            style={{zIndex: 99999}}
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Phân quyền Folder: {folder.name}
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Grant Permission Form */}
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                        Phân quyền mới
                    </h3>
                    <form onSubmit={handleGrantPermission} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Chọn User
                            </label>
                            <select
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                disabled={granting}
                            >
                                <option value="">-- Chọn user --</option>
                                {availableUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} ({user.email})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Loại quyền
                            </label>
                            <select
                                value={selectedPermission}
                                onChange={(e) => setSelectedPermission(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                disabled={granting}
                            >
                                <option value="view">View (Chỉ xem)</option>
                                <option value="edit">Edit (Xem và sửa)</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={granting || !selectedUserId}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md font-medium"
                        >
                            {granting ? 'Đang xử lý...' : 'Phân quyền'}
                        </button>
                    </form>
                </div>

                {/* Current Permissions List */}
                <div>
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                        Danh sách quyền hiện tại
                    </h3>
                    {loading ? (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                            Đang tải...
                        </div>
                    ) : permissions.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                            Chưa có ai được phân quyền
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {permissions.map((perm) => (
                                <div 
                                    key={perm.id} 
                                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                                >
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-900 dark:text-white">
                                            {perm.user_name || 'Unknown User'}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                            {perm.user_email}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                            perm.permission === 'edit' 
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                        }`}>
                                            {perm.permission === 'edit' ? 'Edit' : 'View'}
                                        </span>
                                        <button
                                            onClick={() => handleRevokePermission(perm.user_id)}
                                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
                                        >
                                            Thu hồi
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PermissionModal;

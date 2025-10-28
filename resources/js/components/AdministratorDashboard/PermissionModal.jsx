import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';

const PermissionModal = ({ folder, users, onClose, onUpdate }) => {
    console.log('PermissionModal RENDER START', { folder, users, hasFolder: !!folder, hasUsers: !!users });
    
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedPermission, setSelectedPermission] = useState('view');
    const [granting, setGranting] = useState(false);

    useEffect(() => {
        console.log('PermissionModal mounted!', { folder: folder?.name, users: users?.length });
        if (folder) {
            fetchPermissions();
        }
    }, [folder]);

    const fetchPermissions = async () => {
        try {
            const response = await axios.get(`/folders/${folder.id}/permissions`);
            setPermissions(response.data.permissions);
        } catch (error) {
            console.error('Error fetching permissions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGrantPermission = async (e) => {
        e.preventDefault();
        if (!selectedUser) {
            alert('Vui lòng chọn user');
            return;
        }

        setGranting(true);
        try {
            await axios.post(`/folders/${folder.id}/grant-permission`, {
                user_id: parseInt(selectedUser),
                permission: selectedPermission
            });
            
            alert('Phân quyền thành công!');
            fetchPermissions();
            setSelectedUser('');
            onUpdate && onUpdate();
        } catch (error) {
            console.error('Error granting permission:', error);
            alert(error.response?.data?.error || 'Lỗi khi phân quyền');
        } finally {
            setGranting(false);
        }
    };

    const handleRevokePermission = async (userId) => {
        if (!confirm('Bạn có chắc muốn thu hồi quyền này?')) {
            return;
        }

        try {
            await axios.delete(`/folders/${folder.id}/revoke-permission/${userId}`);
            alert('Thu hồi quyền thành công!');
            fetchPermissions();
            onUpdate && onUpdate();
        } catch (error) {
            console.error('Error revoking permission:', error);
            alert('Lỗi khi thu hồi quyền');
        }
    };

    // Filter users who don't have permission yet and are not the folder creator
    const availableUsers = Array.isArray(users) ? users.filter(user => 
        user?.id && user.id !== folder.created_by && 
        !permissions.some(p => p.user_id === user.id)
    ) : [];

    console.log('PermissionModal about to return JSX', { 
        folder: folder?.name, 
        usersCount: users?.length, 
        availableUsersCount: availableUsers.length,
        permissionsCount: permissions.length 
    });

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{zIndex: 9999}} onClick={onClose}>
            <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Phân quyền Folder: {folder.name}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Grant Permission Form */}
                <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <h3 className="text-white font-semibold mb-3">Cấp quyền mới</h3>
                    <form onSubmit={handleGrantPermission} className="space-y-3">
                        <div>
                            <label className="block text-sm text-gray-300 mb-2">Chọn User</label>
                            <select
                                value={selectedUser}
                                onChange={(e) => setSelectedUser(e.target.value)}
                                className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                                required
                            >
                                <option value="">-- Chọn user --</option>
                                {availableUsers.map(user => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} ({user.email}) - {user.role}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-300 mb-2">Quyền hạn</label>
                            <div className="space-y-2">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="permission"
                                        value="view"
                                        checked={selectedPermission === 'view'}
                                        onChange={(e) => setSelectedPermission(e.target.value)}
                                        className="form-radio text-blue-600"
                                    />
                                    <div>
                                        <span className="text-white font-medium">View (Xem)</span>
                                        <p className="text-sm text-gray-400">Chỉ xem folder và workflows, không sửa được</p>
                                    </div>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="permission"
                                        value="edit"
                                        checked={selectedPermission === 'edit'}
                                        onChange={(e) => setSelectedPermission(e.target.value)}
                                        className="form-radio text-blue-600"
                                    />
                                    <div>
                                        <span className="text-white font-medium">Edit (Sửa)</span>
                                        <p className="text-sm text-gray-400">Xem và chỉnh sửa workflows (KHÔNG được xóa folder)</p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={granting || !selectedUser}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded font-medium"
                        >
                            {granting ? 'Đang cấp quyền...' : 'Cấp quyền'}
                        </button>
                    </form>
                </div>

                {/* Current Permissions List */}
                <div>
                    <h3 className="text-white font-semibold mb-3">Danh sách quyền hiện tại</h3>
                    {loading ? (
                        <p className="text-gray-400">Đang tải...</p>
                    ) : permissions.length === 0 ? (
                        <p className="text-gray-400 text-center py-4">Chưa có ai được phân quyền</p>
                    ) : (
                        <div className="space-y-2">
                            {permissions.map(permission => (
                                <div key={permission.id} className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3">
                                            <div className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold">
                                                {permission.user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-white font-medium">{permission.user.name}</p>
                                                <p className="text-sm text-gray-400">{permission.user.email}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                            permission.permission === 'edit' 
                                                ? 'bg-green-900 text-green-300' 
                                                : 'bg-blue-900 text-blue-300'
                                        }`}>
                                            {permission.permission === 'edit' ? '✏️ Edit' : '👁️ View'}
                                        </span>
                                        <button
                                            onClick={() => handleRevokePermission(permission.user_id)}
                                            className="text-red-400 hover:text-red-300 px-3 py-1 border border-red-400 hover:border-red-300 rounded"
                                        >
                                            Thu hồi
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="mt-6 bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded-lg p-4">
                    <div className="flex items-start space-x-2">
                        <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="text-sm text-yellow-200">
                            <p className="font-semibold mb-1">Lưu ý về quyền hạn:</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>Users với quyền <strong>View</strong>: Chỉ xem folder và workflows</li>
                                <li>Users với quyền <strong>Edit</strong>: Xem và sửa workflows</li>
                                <li>Users <strong>KHÔNG được xóa</strong> folders/workflows được sync từ Administrator</li>
                                <li>Chỉ Admin có thể xóa folders và phân quyền</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PermissionModal;


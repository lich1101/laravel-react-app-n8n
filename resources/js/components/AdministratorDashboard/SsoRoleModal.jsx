import React, { useState } from 'react';

const SsoRoleModal = ({ isOpen, onClose, onConfirm, projectDomain }) => {
    const [selectedRole, setSelectedRole] = useState('administrator');
    const [checkingUser, setCheckingUser] = useState(false);
    const [userExists, setUserExists] = useState(null);
    const [error, setError] = useState(null);

    const handleCheckUser = async () => {
        if (selectedRole !== 'user') {
            onConfirm(selectedRole);
            return;
        }

        setCheckingUser(true);
        setError(null);
        setUserExists(null);

        try {
            // Check if user exists in project domain using registration-status endpoint
            const checkUrl = `https://${projectDomain}/api/registration-status`;
            const response = await fetch(checkUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                // If requires_registration is false, user exists. If true, no user exists yet.
                const userExists = data.requires_registration === false;
                setUserExists(userExists);
                
                if (userExists) {
                    // User exists, proceed with SSO
                    onConfirm(selectedRole);
                } else {
                    // User doesn't exist, show warning
                    setError('Trang web đích chưa có user. Vui lòng chọn role khác hoặc tạo user trước.');
                }
            } else {
                setError('Không thể kiểm tra user. Vui lòng thử lại.');
            }
        } catch (err) {
            setError('Lỗi khi kiểm tra user: ' + err.message);
        } finally {
            setCheckingUser(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Chọn role để đăng nhập
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                        Chọn role để đăng nhập vào <span className="font-semibold">{projectDomain}</span>
                    </p>

                    <div className="space-y-3 mb-4">
                        <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                            <input
                                type="radio"
                                name="role"
                                value="administrator"
                                checked={selectedRole === 'administrator'}
                                onChange={(e) => {
                                    setSelectedRole(e.target.value);
                                    setUserExists(null);
                                    setError(null);
                                }}
                                className="mr-3"
                            />
                            <div>
                                <div className="font-medium text-gray-900">Administrator</div>
                                <div className="text-sm text-gray-500">Quyền quản trị cao nhất</div>
                            </div>
                        </label>

                        <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                            <input
                                type="radio"
                                name="role"
                                value="admin"
                                checked={selectedRole === 'admin'}
                                onChange={(e) => {
                                    setSelectedRole(e.target.value);
                                    setUserExists(null);
                                    setError(null);
                                }}
                                className="mr-3"
                            />
                            <div>
                                <div className="font-medium text-gray-900">Admin</div>
                                <div className="text-sm text-gray-500">Quyền quản trị</div>
                            </div>
                        </label>

                        <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                            <input
                                type="radio"
                                name="role"
                                value="user"
                                checked={selectedRole === 'user'}
                                onChange={(e) => {
                                    setSelectedRole(e.target.value);
                                    setUserExists(null);
                                    setError(null);
                                }}
                                className="mr-3"
                            />
                            <div>
                                <div className="font-medium text-gray-900">User</div>
                                <div className="text-sm text-gray-500">Người dùng (cần kiểm tra user đã tồn tại)</div>
                            </div>
                        </label>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {userExists === false && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-600">
                                Trang web đích chưa có user. Vui lòng chọn role khác.
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleCheckUser}
                            disabled={checkingUser || (selectedRole === 'user' && userExists === false)}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {checkingUser ? 'Đang kiểm tra...' : 'Xác nhận'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SsoRoleModal;


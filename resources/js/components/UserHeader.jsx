import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import UserProfileModal from './UserProfileModal';
import ChangePasswordModal from './ChangePasswordModal';

const UserHeader = () => {
    const [packageInfo, setPackageInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const menuRef = useRef(null);
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        fetchPackageInfo();

        // Listen for workflow creation event
        const handleWorkflowCreated = () => {
            fetchPackageInfo();
        };

        window.addEventListener('workflow-created', handleWorkflowCreated);

        return () => {
            window.removeEventListener('workflow-created', handleWorkflowCreated);
        };
    }, []);

    useEffect(() => {
        // Close menu when clicking outside
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
        };

        if (showUserMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showUserMenu]);

    const fetchPackageInfo = async () => {
        try {
            const response = await axios.get('/user/package-info');
            setPackageInfo(response.data);
        } catch (error) {
            console.error('Error fetching package info:', error);
        } finally {
            setLoading(false);
        }
    };

    const getUserInitials = () => {
        if (user.name) {
            return user.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
        }
        return 'U';
    };

    if (loading) {
        return (
            <div className="bg-white border-b border-gray-200 px-6 py-4 min-h-[72px] flex items-center">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-4">
                        <div className="h-12 w-12 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="bg-white border-b border-gray-200 px-6 py-4 min-h-[72px] flex items-center">
                <div className="flex items-center justify-between w-full">
                    {/* Logo */}
                    <div className="flex items-center space-x-3">
                        
                    </div>

                    {/* Package Info Cards */}
                    <div className="flex items-center space-x-4">
                        {/* Package Name & Description */}
                        {packageInfo?.subscription_package?.name && (
                            <div className="bg-white border border-blue-200 rounded-lg px-4 py-3 min-w-[200px]">
                                <div className="text-sm font-semibold text-blue-900">
                                    {packageInfo.subscription_package.name}
                                </div>
                                {packageInfo.subscription_package.description && (
                                    <div className="text-xs text-blue-700 mt-1">
                                        {packageInfo.subscription_package.description}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Workflow Stats */}
                        <div className="bg-white border border-blue-200 rounded-lg px-4 py-3 min-w-[200px] flex flex-col items-start justify-center">
                            <div className="flex items-center justify-center">
                                <div className="text-xs font-semibold text-blue-900 ">
                                    {packageInfo?.workflow_stats?.running || 0} / {packageInfo?.workflow_stats?.max_concurrent || 0}
                                </div>
                                <div className="text-xs text-blue-700">
                                    : Workflows đang chạy
                                </div>
                            </div>

                            <div className="flex items-center justify-center">
                                <div className="text-xs font-semibold text-blue-900 ">
                                    {packageInfo?.workflow_stats?.user_created || 0} / {packageInfo?.workflow_stats?.max_user_workflows || '∞'}
                                </div>
                                <div className="text-xs text-blue-700">
                                    : Workflows đã tạo
                                </div>
                            </div>
                        </div>

                        {/* User Avatar Menu */}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-white font-semibold hover:bg-gray-700 transition-colors"
                            >
                                {getUserInitials()}
                            </button>

                            {showUserMenu && (
                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                    <button
                                        onClick={() => {
                                            setShowProfileModal(true);
                                            setShowUserMenu(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                    >
                                        Thông tin tài khoản
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowPasswordModal(true);
                                            setShowUserMenu(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                    >
                                        Đổi mật khẩu
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <UserProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                onUpdate={fetchPackageInfo}
            />

            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />
        </>
    );
};

export default UserHeader;


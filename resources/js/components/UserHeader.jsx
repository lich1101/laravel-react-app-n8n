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
    const [isWebManagerDomain, setIsWebManagerDomain] = useState(false);
    const menuRef = useRef(null);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = (user?.role || 'user').toLowerCase();
    const showUserWorkflowQuota = userRole === 'user';

    useEffect(() => {
        // Check if this is WEB_MANAGER_USER domain
        const checkDomain = async () => {
            try {
                const response = await axios.get('/web-manager/domain-check');
                setIsWebManagerDomain(response.data?.is_web_manager_domain || false);
            } catch (err) {
                console.error('Unable to check domain', err);
                setIsWebManagerDomain(false);
            }
        };
        checkDomain();

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

                    {/* Package Info Cards - Hide in WEB_MANAGER_USER domain */}
                    {!isWebManagerDomain && (
                        <div className="flex items-center space-x-4">
                            {/* Package Name with Info Icon & Usage Time */}
                            {packageInfo?.subscription_package?.name && (
                                <div className="bg-white border border-blue-200 rounded-lg px-4 py-3 min-w-[200px]">
                                    <div className="flex items-center space-x-2">
                                        <div className="text-sm font-semibold text-blue-900">
                                            {packageInfo.subscription_package.name}
                                        </div>
                                        <div className="relative group">
                                            <svg 
                                                className="w-4 h-4 text-blue-500 cursor-help" 
                                                fill="currentColor" 
                                                viewBox="0 0 20 20"
                                            >
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                            </svg>
                                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                                {packageInfo.subscription_package.name}
                                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                                            </div>
                                        </div>
                                    </div>
                                    {packageInfo.expires_at && (
                                        <div className="text-xs text-blue-700 mt-1">
                                            {(() => {
                                                const expiresAt = new Date(packageInfo.expires_at);
                                                const now = new Date();
                                                const diffMs = expiresAt - now;
                                                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                                const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                                
                                                if (diffMs < 0) {
                                                    return 'Đã hết hạn';
                                                } else if (diffDays > 0) {
                                                    return `Còn ${diffDays} ngày ${diffHours > 0 ? `${diffHours} giờ` : ''}`;
                                                } else if (diffHours > 0) {
                                                    return `Còn ${diffHours} giờ`;
                                                } else {
                                                    return 'Sắp hết hạn';
                                                }
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Workflow Stats */}
                            <div className="bg-white border border-blue-200 rounded-lg px-4 py-3 min-w-[200px] flex flex-col items-start justify-center space-y-2">
                                <div className="flex items-center justify-center">
                                    <div className="text-xs font-semibold text-blue-900 ">
                                        {packageInfo?.workflow_stats?.running || 0} / {packageInfo?.workflow_stats?.max_concurrent || 0}
                                    </div>
                                    <div className="text-xs text-blue-700">
                                        : Workflows đang chạy
                                    </div>
                                </div>

                                {showUserWorkflowQuota ? (
                                    <div className="flex items-center justify-center">
                                        <div className="text-xs font-semibold text-blue-900 ">
                                            {packageInfo?.workflow_stats?.user_created || 0} / {packageInfo?.workflow_stats?.max_user_workflows || '∞'}
                                        </div>
                                        <div className="text-xs text-blue-700">
                                            : Workflows đã tạo
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-blue-700 text-center">
                                        Role {userRole} không bị giới hạn số workflows đã tạo.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* User Avatar Menu - Always show */}
                    <div className="flex items-center space-x-4">

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


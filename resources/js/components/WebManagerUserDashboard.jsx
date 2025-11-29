import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import UserSidebarNav from './UserSidebarNav';
import UserHeader from './UserHeader';
import WebManagerProjectTab from './WebManager/WebManagerProjectTab';
import WebManagerSubscriptionTab from './WebManager/WebManagerSubscriptionTab';
import WebManagerPaymentHistoryTab from './WebManager/WebManagerPaymentHistoryTab';
import InputModal from './Common/InputModal';

const WebManagerUserDashboard = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const navigate = useNavigate();
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || '{}'));
    const [showPhoneModal, setShowPhoneModal] = useState(false);
    const [updatingPhone, setUpdatingPhone] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Fetch user info từ API khi component mount
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await axios.get('/me');
                const userData = response.data;
                localStorage.setItem('user', JSON.stringify(userData));
                setUser(userData);
                
                // Kiểm tra và hiển thị modal yêu cầu nhập số điện thoại
                // Chỉ kiểm tra trong WEB_MANAGER_USER domain và user có role 'user'
                if (userData?.role === 'user' && !userData?.phone) {
                    setShowPhoneModal(true);
                }
            } catch (err) {
                console.error('Error fetching user:', err);
            }
        };

        fetchUser();
    }, []);

    const handleUpdatePhone = async (phone) => {
        if (!phone || !phone.trim()) {
            return;
        }

        try {
            setUpdatingPhone(true);
            const response = await axios.put('/user/profile', {
                name: user.name,
                email: user.email,
                phone: phone.trim(),
            });

            // Cập nhật user trong localStorage
            const updatedUser = { ...user, phone: phone.trim() };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            setUser(updatedUser);
            setShowPhoneModal(false);
        } catch (err) {
            console.error('Error updating phone:', err);
            alert(err.response?.data?.error || 'Không thể cập nhật số điện thoại');
        } finally {
            setUpdatingPhone(false);
        }
    };


    const managementLinks = [
        { id: 'web', label: 'Trang web', icon: '🌐', to: '/dashboard/web' },
        { id: 'subscription', label: 'Gia hạn/Đăng ký gói', icon: '💳', to: '/dashboard/subscription' },
        { id: 'change-package', label: 'Thay đổi gói', icon: '🔄', to: '/dashboard/change-package' },
        { id: 'payment-history', label: 'Lịch sử thanh toán', icon: '📋', to: '/dashboard/payment-history' },
    ];

    return (
        <div className="flex min-h-screen bg-surface">
            <UserSidebarNav
                collapsed={isCollapsed}
                setCollapsed={setIsCollapsed}
                topics={[]}
                workflowFolders={[]}
                orphanWorkflows={[]}
                loading={false}
                user={user}
                onLogout={handleLogout}
                footerText="v1.0.0"
                managementLinks={managementLinks}
                automationManagePath="/dashboard/automations/manage"
                workflowManagePath="/dashboard/workflows/manage"
                automationDetailPathBuilder={(tableId) => `/dashboard/automations/table/${tableId}`}
                workflowDetailPathBuilder={(workflowId) => `/dashboard/workflows/${workflowId}`}
                onSelectAutomation={() => {}}
                onSelectWorkflow={() => {}}
                hideAutomations={true}
                hideWorkflows={true}
            />

            <div className="flex-1 flex flex-col bg-surface-muted">
                <UserHeader />
                
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="bg-surface-elevated shadow-card min-h-full">
                        <Routes>
                            <Route path="/" element={<Navigate to="web" replace />} />
                            <Route path="web" element={<WebManagerProjectTab />} />
                            <Route path="subscription" element={<WebManagerSubscriptionTab type="new" />} />
                            <Route path="change-package" element={<WebManagerSubscriptionTab type="change" />} />
                            <Route path="payment-history" element={<WebManagerPaymentHistoryTab />} />
                        </Routes>
                    </div>
                </div>
            </div>

            {/* Modal yêu cầu nhập số điện thoại */}
            <InputModal
                isOpen={showPhoneModal}
                onClose={() => {}} // Không cho phép đóng modal nếu chưa nhập phone
                onConfirm={handleUpdatePhone}
                title="Yêu cầu số điện thoại"
                message="Vui lòng để số điện thoại để được nhân viên Chatplus hỗ trợ và tư vấn"
                placeholder="Nhập số điện thoại của bạn"
                confirmText={updatingPhone ? 'Đang cập nhật...' : 'Xác nhận'}
                cancelText=""
            />
        </div>
    );
};

export default WebManagerUserDashboard;

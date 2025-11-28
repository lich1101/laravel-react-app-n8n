import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import UserSidebarNav from './UserSidebarNav';
import UserHeader from './UserHeader';
import WebManagerProjectTab from './WebManager/WebManagerProjectTab';
import WebManagerSubscriptionTab from './WebManager/WebManagerSubscriptionTab';
import WebManagerPaymentHistoryTab from './WebManager/WebManagerPaymentHistoryTab';

const WebManagerUserDashboard = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
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
        </div>
    );
};

export default WebManagerUserDashboard;

import React, { useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import AutomationTablesTab from './Automation/AutomationTablesTab';
import FoldersTab from './AdministratorDashboard/FoldersTab';
import UsersTab from './AdministratorDashboard/UsersTab';
import WorkflowList from './WorkflowList';
import WorkflowEditor from './WorkflowEditor';
import DashboardSidebarNav from './DashboardSidebarNav';

const WorkflowEditorRoute = () => {
    const { workflowId } = useParams();
    return <WorkflowEditor key={workflowId} />;
};

const AutomationTableDetailRoute = () => {
    const { tableId } = useParams();
    return (
        <AutomationTablesTab
            canManage
            hideTopicPanel
            initialTableId={tableId}
        />
    );
};

const AdminDashboard = () => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const sections = [
        {
            id: 'management',
            title: 'Quản lý',
            icon: '🛠',
            links: [
                { id: 'automation', label: 'Automation', icon: '🤖', to: '/admin/automations' },
                { id: 'folders', label: 'Folders', icon: '📁', to: '/admin/folders' },
                { id: 'workflows', label: 'Workflows', icon: '🔁', to: '/admin/workflows' },
            ],
        },
        {
            id: 'users',
            title: 'Người dùng',
            icon: '👥',
            links: [{ id: 'users-link', label: 'Users', icon: '👥', to: '/admin/users' }],
        },
    ];

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div className="flex min-h-screen bg-surface">
            <DashboardSidebarNav
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                sections={sections}
                footerText="v1.0.0"
                user={user}
                onLogout={handleLogout}
            />

            <div className="flex-1 bg-surface-muted overflow-y-auto">
                <div className="p-6">
                    <div className="border border-subtle rounded-2xl bg-surface-elevated shadow-card p-6">
                        <Routes>
                            <Route index element={<Navigate to="/admin/automations" replace />} />
                            <Route path="automations" element={<AutomationTablesTab canManage />} />
                            <Route path="automations/table/:tableId" element={<AutomationTableDetailRoute />} />
                            <Route path="folders" element={<FoldersTab />} />
                            <Route path="users" element={<UsersTab />} />
                            <Route path="workflows" element={<WorkflowList basePath="/admin/workflows" />} />
                            <Route path="workflows/:workflowId" element={<WorkflowEditorRoute />} />
                            <Route path="*" element={<Navigate to="/admin/automations" replace />} />
                        </Routes>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;

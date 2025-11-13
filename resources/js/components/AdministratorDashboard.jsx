import React, { useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import AutomationTablesTab from './Automation/AutomationTablesTab';
import ProjectsTab from './AdministratorDashboard/ProjectsTab';
import UsersTab from './AdministratorDashboard/UsersTab';
import Settings from '../pages/Settings';
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

const AdministratorDashboard = () => {
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
                { id: 'projects-link', label: 'Projects', icon: '🏢', to: '/administrator/projects' },
                { id: 'automation-link', label: 'Automation', icon: '🤖', to: '/administrator/automations' },
                { id: 'workflows-link', label: 'Workflows', icon: '🔁', to: '/administrator/workflows' },
            ],
        },
        {
            id: 'people',
            title: 'Người dùng',
            icon: '👥',
            links: [{ id: 'users-link', label: 'Users', icon: '👥', to: '/administrator/users' }],
        },
        {
            id: 'system',
            title: 'Hệ thống',
            icon: '⚙️',
            links: [{ id: 'settings-link', label: 'Settings', icon: '⚙️', to: '/administrator/settings', exact: true }],
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
                            <Route index element={<Navigate to="/administrator/projects" replace />} />
                            <Route path="projects" element={<ProjectsTab />} />
                            <Route path="automations" element={<AutomationTablesTab canManage />} />
                            <Route path="automations/table/:tableId" element={<AutomationTableDetailRoute />} />
                            <Route path="users" element={<UsersTab />} />
                            <Route path="settings" element={<Settings />} />
                            <Route path="workflows" element={<WorkflowList basePath="/administrator/workflows" />} />
                            <Route path="workflows/:workflowId" element={<WorkflowEditorRoute />} />
                            <Route path="*" element={<Navigate to="/administrator/projects" replace />} />
                        </Routes>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdministratorDashboard;

import React, { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
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
    const location = useLocation();

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

    const pageTitle = useMemo(() => {
        if (location.pathname.startsWith('/administrator/projects')) {
            return 'Quản lý Projects';
        }
        if (location.pathname.startsWith('/administrator/automations')) {
            return 'Quản lý Automation';
        }
        if (location.pathname.startsWith('/administrator/workflows')) {
            return 'Quản lý Workflows';
        }
        if (location.pathname.startsWith('/administrator/users')) {
            return 'Quản lý Users';
        }
        if (location.pathname.startsWith('/administrator/settings')) {
            return 'Cài đặt hệ thống';
        }
        return 'Administrator Dashboard';
    }, [location.pathname]);

    return (
        <div className="flex min-h-screen bg-surface">
            <DashboardSidebarNav
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                sections={sections}
                footerText="v1.0.0"
            />

            <div className="flex-1 flex flex-col bg-surface-elevated">
                <nav className="toolbar">
                    <div className="px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between h-16 items-center">
                            <h1 className="text-xl font-semibold text-primary">{pageTitle}</h1>
                            <div className="flex items-center gap-4">
                                <span className="text-muted">{user.name || 'Administrator'}</span>
                                <button onClick={handleLogout} className="btn btn-danger text-sm">
                                    Đăng xuất
                                </button>
                            </div>
                        </div>
                    </div>
                </nav>

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
        </div>
    );
};

export default AdministratorDashboard;

import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import axios from '../config/axios';
import AutomationTablesTab from './Automation/AutomationTablesTab';
import ProjectsTab from './AdministratorDashboard/ProjectsTab';
import UsersTab from './AdministratorDashboard/UsersTab';
import SubscriptionPackagesTab from './AdministratorDashboard/SubscriptionPackagesTab';
import SubscriptionRenewalsTab from './AdministratorDashboard/SubscriptionRenewalsTab';
import Settings from '../pages/Settings';
import WorkflowList from './WorkflowList';
import WorkflowEditor from './WorkflowEditor';
import UserSidebarNav from './UserSidebarNav';

const WorkflowEditorRoute = () => {
    const { workflowId } = useParams();
    return <WorkflowEditor key={workflowId} />;
};

const AutomationTableDetailRoute = ({ onStructureChange }) => {
    const { tableId } = useParams();
    return (
        <AutomationTablesTab
            canManage
            hideTopicPanel
            initialTableId={tableId}
            onStructureChange={onStructureChange}
        />
    );
};

const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
};

const AdministratorDashboard = () => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const [automationTopics, setAutomationTopics] = useState([]);
    const [workflowFolders, setWorkflowFolders] = useState([]);
    const [orphanWorkflows, setOrphanWorkflows] = useState([]);
    const [loadingSidebar, setLoadingSidebar] = useState(true);
    const [selectedTopicId, setSelectedTopicId] = useState(null);
    const [selectedTableId, setSelectedTableId] = useState(null);

    const fetchAutomationTopics = async ({ preferredTopicId = null, preferredTableId = null } = {}) => {
        try {
            const [topicsRes, tablesRes] = await Promise.all([
                axios.get('/automation/topics', { params: { with_tables: true } }),
                axios.get('/automation/tables'),
            ]);

            const normalizedTopics = toArray(topicsRes.data).map((topic) => ({
                id: String(topic.id),
                name: topic.name,
                slug: topic.slug,
                tables: toArray(topic.tables).map((table) => ({
                    id: table.id,
                    name: table.name,
                    slug: table.slug,
                })),
            }));

            const tablesWithoutTopic = toArray(tablesRes.data).filter((table) => !table.automation_topic_id);

            const mergedTopics = [...normalizedTopics];
            if (tablesWithoutTopic.length > 0) {
                mergedTopics.push({
                    id: 'unassigned',
                    name: 'Không thuộc chủ đề',
                    slug: 'unassigned',
                    tables: tablesWithoutTopic.map((table) => ({
                        id: table.id,
                        name: table.name,
                        slug: table.slug,
                    })),
                });
            }

            setAutomationTopics(mergedTopics);

            const topicIdToSelect =
                preferredTopicId ??
                (mergedTopics.some((topic) => topic.id === selectedTopicId)
                    ? selectedTopicId
                    : mergedTopics[0]?.id ?? null);
            setSelectedTopicId(topicIdToSelect);

            const topic = mergedTopics.find((t) => t.id === topicIdToSelect);
            const tableIdToSelect =
                preferredTableId ??
                (topic?.tables.some((table) => table.id === selectedTableId)
                    ? selectedTableId
                    : topic?.tables[0]?.id ?? null);
            setSelectedTableId(tableIdToSelect);
        } catch (error) {
            console.error('Không thể tải danh sách chủ đề automation', error);
        }
    };

    const fetchWorkflowFolders = async () => {
        try {
            const foldersEndpoint = user?.role === 'administrator' ? '/folders' : '/project-folders';
            const [foldersRes, workflowsRes] = await Promise.all([
                axios.get(foldersEndpoint),
                axios.get('/workflows'),
            ]);

            const normalizedFolders = toArray(foldersRes.data).map((folder) => ({
                id: folder.id,
                name: folder.name,
                workflows: toArray(folder.workflows).map((workflow) => ({
                    id: workflow.id,
                    name: workflow.name,
                })),
            }));

            setWorkflowFolders(normalizedFolders);

            const orphan = toArray(workflowsRes.data)
                .filter((workflow) => !workflow.folder_id)
                .map((workflow) => ({
                    id: workflow.id,
                    name: workflow.name,
                }));
            setOrphanWorkflows(orphan);
        } catch (error) {
            console.error('Không thể tải danh sách workflows', error);
        }
    };

    useEffect(() => {
        const loadSidebarData = async () => {
            setLoadingSidebar(true);
            await Promise.all([fetchAutomationTopics(), fetchWorkflowFolders()]);
            setLoadingSidebar(false);
        };

        loadSidebarData();
    }, []);

    const handleAutomationStructureChange = async () => {
        await fetchAutomationTopics({ preferredTopicId: selectedTopicId, preferredTableId: selectedTableId });
    };

    const handleSelectAutomation = (topicId, tableId, route) => {
        setSelectedTopicId(topicId);
        setSelectedTableId(tableId);
        if (route) {
            navigate(route);
        }
    };

    const handleSelectWorkflow = (folderId, workflowId, route) => {
        if (route) {
            navigate(route);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const managementLinks = [
        { id: 'manage-projects', label: 'Projects', icon: '🏢', to: '/administrator/projects' },
        { id: 'manage-subscription-packages', label: 'Gói cước', icon: '📦', to: '/administrator/subscription-packages' },
        { id: 'manage-subscription-renewals', label: 'Quản lý gia hạn', icon: '💳', to: '/administrator/subscription-renewals' },
        { id: 'manage-automation', label: 'Automation', icon: '🤖', to: '/administrator/automations' },
        { id: 'manage-workflows', label: 'Workflows', icon: '🔁', to: '/administrator/workflows' },
        { id: 'manage-users', label: 'Users', icon: '👥', to: '/administrator/users' },
        { id: 'manage-settings', label: 'Settings', icon: '⚙️', to: '/administrator/settings' },
    ];

    return (
        <div className="flex min-h-screen bg-surface">
            <UserSidebarNav
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                topics={automationTopics}
                workflowFolders={workflowFolders}
                orphanWorkflows={orphanWorkflows}
                loading={loadingSidebar}
                onSelectAutomation={handleSelectAutomation}
                onSelectWorkflow={handleSelectWorkflow}
                user={user}
                onLogout={handleLogout}
                footerText="v1.0.0"
                managementLinks={managementLinks}
                automationManagePath="/administrator/automations"
                workflowManagePath="/administrator/workflows"
                automationDetailPathBuilder={(tableId) => `/administrator/automations/table/${tableId}`}
                workflowDetailPathBuilder={(workflowId) => `/administrator/workflows/${workflowId}`}
            />

            <div className="flex-1 flex flex-col bg-surface-muted">
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="bg-surface-elevated shadow-card min-h-full">
                        <Routes>
                            <Route index element={<Navigate to="/administrator/projects" replace />} />
                            <Route path="projects" element={<ProjectsTab />} />
                            <Route path="subscription-packages" element={<SubscriptionPackagesTab />} />
                            <Route path="subscription-renewals" element={<SubscriptionRenewalsTab />} />
                            <Route
                                path="automations"
                                element={
                                    <AutomationTablesTab
                                        canManage
                                        selectedTopicId={selectedTopicId}
                                        selectedTableId={selectedTableId}
                                        onSelectTable={setSelectedTableId}
                                        onStructureChange={handleAutomationStructureChange}
                                    />
                                }
                            />
                            <Route
                                path="automations/table/:tableId"
                                element={<AutomationTableDetailRoute onStructureChange={handleAutomationStructureChange} />}
                            />
                            <Route path="users" element={<UsersTab />} />
                            <Route path="settings" element={<Settings />} />
                            <Route
                                path="workflows"
                                element={
                                    <WorkflowList
                                        basePath="/administrator/workflows"
                                        onStructureChange={fetchWorkflowFolders}
                                    />
                                }
                            />
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

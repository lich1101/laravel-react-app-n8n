import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import axios from '../config/axios';
import AutomationTablesTab from './Automation/AutomationTablesTab';
import FoldersTab from './AdministratorDashboard/FoldersTab';
import UsersTab from './AdministratorDashboard/UsersTab';
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

const AdminDashboard = () => {
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
            const [foldersRes, workflowsRes] = await Promise.all([
                axios.get('/project-folders'),
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
        { id: 'manage-automation', label: 'Automation', icon: '🤖', to: '/admin/automations' },
        { id: 'manage-folders', label: 'Folders', icon: '📁', to: '/admin/folders' },
        { id: 'manage-workflows', label: 'Workflows', icon: '🔁', to: '/admin/workflows' },
        { id: 'manage-users', label: 'Users', icon: '👥', to: '/admin/users' },
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
                automationManagePath="/admin/automations"
                workflowManagePath="/admin/workflows"
                automationDetailPathBuilder={(tableId) => `/admin/automations/table/${tableId}`}
                workflowDetailPathBuilder={(workflowId) => `/admin/workflows/${workflowId}`}
            />

            <div className="flex-1 bg-surface-muted overflow-y-auto">
                <div className="p-6">
                    <div className="border border-subtle rounded-2xl bg-surface-elevated shadow-card p-6">
                        <Routes>
                            <Route index element={<Navigate to="/admin/automations" replace />} />
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

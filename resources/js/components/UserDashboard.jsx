import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import axios from '../config/axios';
import UserSidebarNav from './UserSidebarNav';
import AutomationTablesTab from './Automation/AutomationTablesTab';
import WorkflowList from './WorkflowList';
import WorkflowEditor from './WorkflowEditor';

const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
};

const AutomationTableDetailRoute = ({ onStructureChange }) => {
    const { tableId } = useParams();
    return (
        <AutomationTablesTab
            canManage={false}
            hideTopicPanel
            initialTableId={tableId}
            onStructureChange={onStructureChange}
        />
    );
};

const WorkflowEditorRoute = () => {
    const { workflowId } = useParams();
    return <WorkflowEditor key={workflowId} />;
};

const UserDashboard = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [automationTopics, setAutomationTopics] = useState([]);
    const [workflowFolders, setWorkflowFolders] = useState([]);
    const [orphanWorkflows, setOrphanWorkflows] = useState([]);
    const [loadingSidebar, setLoadingSidebar] = useState(true);
    const [selectedAutomationTopicId, setSelectedAutomationTopicId] = useState(null);
    const [selectedAutomationTableId, setSelectedAutomationTableId] = useState(null);
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const fetchAutomationTopics = async () => {
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
            const normalized = toArray(foldersRes.data).map((folder) => ({
                id: folder.id,
                name: folder.name,
                workflows: toArray(folder.workflows).map((workflow) => ({
                    id: workflow.id,
                    name: workflow.name,
                })),
            }));
            setWorkflowFolders(normalized);

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

    const handleAutomationStructureChange = () => {
        fetchAutomationTopics();
    };

    return (
        <div className="flex min-h-screen bg-surface">
            <UserSidebarNav
                collapsed={isCollapsed}
                setCollapsed={setIsCollapsed}
                topics={automationTopics}
                workflowFolders={workflowFolders}
                orphanWorkflows={orphanWorkflows}
                loading={loadingSidebar}
                user={user}
                onLogout={handleLogout}
                footerText="v1.0.0"
                onSelectAutomation={(topicId, tableId, route) => {
                    setSelectedAutomationTopicId(topicId);
                    setSelectedAutomationTableId(tableId);
                    if (route) {
                        navigate(route);
                    }
                }}
                onSelectWorkflow={(folderId, workflowId, route) => {
                    if (route) {
                        navigate(route);
                    }
                }}
            />

            <div className="flex-1 flex flex-col bg-surface-muted">
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="bg-surface-elevated shadow-card min-h-full">
                        <Routes>
                            <Route path="/" element={<Navigate to="automations/manage" replace />} />
                            <Route
                                path="automations/manage"
                                element={
                                    <AutomationTablesTab
                                        canManage
                                        selectedTopicId={selectedAutomationTopicId}
                                        selectedTableId={selectedAutomationTableId}
                                        onSelectTable={setSelectedAutomationTableId}
                                        onStructureChange={handleAutomationStructureChange}
                                    />
                                }
                            />
                            <Route
                                path="automations/table/:tableId"
                                element={<AutomationTableDetailRoute onStructureChange={handleAutomationStructureChange} />}
                            />
                            <Route path="workflows/manage" element={<WorkflowList basePath="/dashboard/workflows" />} />
                            <Route path="workflows/:workflowId" element={<WorkflowEditorRoute />} />
                        </Routes>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserDashboard;

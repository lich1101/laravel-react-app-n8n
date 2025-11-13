import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SectionHeader = ({ collapsed, title, icon, isOpen, onToggle }) => (
    <button
        onClick={onToggle}
        className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2 text-sm font-semibold text-secondary hover:bg-surface-muted rounded-xl transition-colors`}
    >
        <div className="flex items-center space-x-2">
            {icon && <span className="text-lg">{icon}</span>}
            {!collapsed && <span>{title}</span>}
        </div>
        {!collapsed && (
            <svg
                className={`w-4 h-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        )}
    </button>
);

const UserSidebarNav = ({
    collapsed,
    setCollapsed,
    topics,
    workflowFolders,
    orphanWorkflows = [],
    loading,
    onSelectAutomation,
    onSelectWorkflow,
    user = null,
    onLogout = () => {},
    footerText = 'v1.0.0',
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [managementOpen, setManagementOpen] = useState(true);
    const [automationOpen, setAutomationOpen] = useState(true);
    const [workflowsOpen, setWorkflowsOpen] = useState(true);
    const [expandedTopics, setExpandedTopics] = useState(new Set());
    const [expandedFolders, setExpandedFolders] = useState(new Set());

    const tableTopicMap = useMemo(() => {
        const map = new Map();
        topics.forEach((topic) => {
            topic.tables.forEach((table) => {
                map.set(Number(table.id), topic.id);
            });
        });
        return map;
    }, [topics]);

    const workflowFolderMap = useMemo(() => {
        const map = new Map();
        workflowFolders.forEach((folder) => {
            folder.workflows.forEach((workflow) => {
                map.set(Number(workflow.id), folder.id);
            });
        });
        return map;
    }, [workflowFolders]);

    useEffect(() => {
        const path = location.pathname;

        if (path.includes('/dashboard/automations')) {
            setAutomationOpen(true);
            const match = path.match(/automations\/table\/(\d+)/);
            if (match) {
                const tableId = Number(match[1]);
                const topicId = tableTopicMap.get(tableId) || 'unassigned';
                if (topicId) {
                    setExpandedTopics((prev) => {
                        const next = new Set(prev);
                        next.add(topicId);
                        return next;
                    });
                    onSelectAutomation?.(topicId, tableId, `/dashboard/automations/table/${tableId}`);
                }
            }
        }

        if (path.includes('/dashboard/workflows')) {
            setWorkflowsOpen(true);
            const match = path.match(/workflows\/(\d+)/);
            if (match) {
                const workflowId = Number(match[1]);
                const folderId = workflowFolderMap.get(workflowId);
                if (folderId) {
                    setExpandedFolders((prev) => {
                        const next = new Set(prev);
                        next.add(folderId);
                        return next;
                    });
                }
            }
        }
    }, [location.pathname, tableTopicMap, workflowFolderMap]);

    const toggleTopic = (topicId) => {
        setExpandedTopics((prev) => {
            const next = new Set(prev);
            if (next.has(topicId)) {
                next.delete(topicId);
            } else {
                next.add(topicId);
            }
            return next;
        });
    };

    const toggleFolder = (folderId) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    };

    const isActive = (targetPath) => location.pathname === targetPath;

    const collapsedIcons = (
        <div className="flex flex-col items-center space-y-4 py-6">
            <button
                title="Quản lý"
                onClick={() => navigate('/dashboard/automations/manage')}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors border ${
                    location.pathname.includes('/dashboard/automations/manage')
                        ? 'bg-amber-400 text-white border-amber-400 shadow-card'
                        : 'bg-surface-elevated text-muted border-subtle hover:bg-surface-muted'
                }`}
            >
                🛠
            </button>
            <button
                title="Automation"
                onClick={() => navigate('/dashboard/automations/manage')}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors border ${
                    location.pathname.includes('/dashboard/automations')
                        ? 'bg-blue-500 text-white border-blue-500 shadow-card'
                        : 'bg-surface-elevated text-muted border-subtle hover:bg-surface-muted'
                }`}
            >
            
            </button>
            <button
                title="Workflows"
                onClick={() => navigate('/dashboard/workflows/manage')}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors border ${
                    location.pathname.includes('/dashboard/workflows')
                        ? 'bg-purple-500 text-white border-purple-500 shadow-card'
                        : 'bg-surface-elevated text-muted border-subtle hover:bg-surface-muted'
                }`}
            >
                🔁
            </button>
        </div>
    );

    const fullSidebar = (
        <div className="flex-1 overflow-y-auto px-3 py-4">
            <div className="py-3">
                <SectionHeader
                    collapsed={collapsed}
                    title="Quản lý"
                    icon="🛠"
                    isOpen={managementOpen}
                    onToggle={() => setManagementOpen((prev) => !prev)}
                />
                {managementOpen && (
                    <div className="mt-1 space-y-1">
                        <button
                            onClick={() => navigate('/dashboard/automations/manage')}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                                isActive('/dashboard/automations/manage')
                                    ? 'bg-amber-100 text-amber-700 border border-amber-300 shadow-card'
                                    : 'text-secondary hover:bg-surface-muted'
                            }`}
                        >
                            Quản lý Automation
                        </button>
                        <button
                            onClick={() => navigate('/dashboard/workflows/manage')}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                                isActive('/dashboard/workflows/manage')
                                    ? 'bg-amber-100 text-amber-700 border border-amber-300 shadow-card'
                                    : 'text-secondary hover:bg-surface-muted'
                            }`}
                        >
                            Quản lý Workflows
                        </button>
                    </div>
                )}
            </div>

            <div className="py-3">
                <SectionHeader
                    collapsed={collapsed}
                    title="Automations"
                    isOpen={automationOpen}
                    onToggle={() => setAutomationOpen((prev) => !prev)}
                />
                {automationOpen && (
                    <div className="mt-1 space-y-2">
                        {loading ? (
                            <p className="px-3 py-2 text-xs text-muted">Đang tải chủ đề...</p>
                        ) : (
                            topics.map((topic) => {
                                const isExpanded = expandedTopics.has(topic.id);
                                return (
                                    <div key={topic.id} className="rounded-xl">
                                        <button
                                            onClick={() => {
                                                toggleTopic(topic.id);
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-secondary hover:bg-surface-muted rounded-xl"
                                        >
                                            <span>{topic.name}</span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {isExpanded && (
                                            <div className="relative pl-5 pb-3 space-y-1">
                                                <div className="absolute left-2 top-1.5 bottom-1.5 border-l border-subtle opacity-60 pointer-events-none" />
                                                {topic.tables.map((table) => (
                                                    <div key={table.id} className="flex items-center">
                                                        <div className="w-3 -ml-3 border-t border-subtle opacity-60" />
                                                    <button
                                                        onClick={() => {
                                                            onSelectAutomation?.(topic.id, table.id, `/dashboard/automations/table/${table.id}`);
                                                            navigate(`/dashboard/automations/table/${table.id}`);
                                                        }}
                                                            className={`flex-1 ml-2 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                                isActive(`/dashboard/automations/table/${table.id}`)
                                                                    ? 'bg-primary-soft text-primary border border-blue-200 shadow-card'
                                                                    : 'text-secondary hover:bg-surface-muted'
                                                            }`}
                                                    >
                                                        {table.name}
                                                    </button>
                                                    </div>
                                                ))}
                                                {topic.tables.length === 0 && (
                                                    <p className="px-3 py-1 text-xs text-muted">Chưa có bảng</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            <div className="py-3">
                <SectionHeader
                    collapsed={collapsed}
                    title="Workflows"
                    isOpen={workflowsOpen}
                    onToggle={() => setWorkflowsOpen((prev) => !prev)}
                />
                {workflowsOpen && (
                    <div className="mt-1 space-y-2">
                        {loading ? (
                            <p className="px-3 py-2 text-xs text-muted">Đang tải workflows...</p>
                        ) : (
                            workflowFolders.map((folder) => {
                                const isExpanded = expandedFolders.has(folder.id);
                                return (
                                    <div key={folder.id} className="rounded-xl">
                                        <button
                                            onClick={() => {
                                                toggleFolder(folder.id);
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-secondary hover:bg-surface-muted rounded-xl"
                                        >
                                            <span>{folder.name}</span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {isExpanded && (
                                            <div className="relative pl-5 pb-3 space-y-1">
                                                <div className="absolute left-2 top-1.5 bottom-1.5 border-l border-subtle opacity-60 pointer-events-none" />
                                                {folder.workflows.map((workflow) => (
                                                    <div key={workflow.id} className="flex items-center">
                                                        <div className="w-3 -ml-3 border-t border-subtle opacity-60" />
                                                    <button
                                                        onClick={() => {
                                                            onSelectWorkflow?.(folder.id, workflow.id, `/dashboard/workflows/${workflow.id}`);
                                                            navigate(`/dashboard/workflows/${workflow.id}`);
                                                        }}
                                                            className={`flex-1 ml-2 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                                isActive(`/dashboard/workflows/${workflow.id}`)
                                                                    ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-card'
                                                                    : 'text-secondary hover:bg-surface-muted'
                                                            }`}
                                                    >
                                                        {workflow.name}
                                                    </button>
                                                    </div>
                                                ))}
                                                {folder.workflows.length === 0 && (
                                                    <p className="px-3 py-1 text-xs text-muted">Chưa có workflow</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                        {!loading && orphanWorkflows.length > 0 && (
                            <div className="rounded-xl">
                                <button
                                    onClick={() => {
                                        toggleFolder('unassigned');
                                    }}
                                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-secondary hover:bg-surface-muted rounded-xl"
                                >
                                    <span>Không thuộc folder</span>
                                    <svg
                                        className={`w-4 h-4 transition-transform ${expandedFolders.has('unassigned') ? 'transform rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {expandedFolders.has('unassigned') && (
                                    <div className="relative pl-5 pb-3 space-y-1">
                                        <div className="absolute left-2 top-1.5 bottom-1.5 border-l border-subtle opacity-60 pointer-events-none" />
                                        {orphanWorkflows.map((workflow) => (
                                            <div key={workflow.id} className="flex items-center">
                                                <div className="w-3 -ml-3 border-t border-subtle opacity-60" />
                                            <button
                                                onClick={() => {
                                                    onSelectWorkflow?.('unassigned', workflow.id, `/dashboard/workflows/${workflow.id}`);
                                                    navigate(`/dashboard/workflows/${workflow.id}`);
                                                }}
                                                    className={`flex-1 ml-2 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                        isActive(`/dashboard/workflows/${workflow.id}`)
                                                            ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-card'
                                                            : 'text-secondary hover:bg-surface-muted'
                                                    }`}
                                            >
                                                {workflow.name}
                                            </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className={`${collapsed ? 'w-16' : 'w-72'} bg-surface-elevated text-secondary min-h-screen transition-all duration-300 flex flex-col border-r border-subtle shadow-card`}>
            <div className="p-4 flex items-center justify-between border-b border-subtle">
                {!collapsed && <span className="text-lg font-semibold text-primary">Menu</span>}
                <button
                    onClick={() => setCollapsed((prev) => !prev)}
                    className="text-muted hover:text-primary"
                    title={collapsed ? 'Mở rộng' : 'Thu gọn'}
                >
                    <svg
                        className={`w-5 h-5 transition-transform ${collapsed ? '' : 'transform rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {collapsed ? collapsedIcons : fullSidebar}

            <div className="p-4 border-t border-subtle">
                <div className={`flex items-center ${collapsed ? 'flex-col gap-3' : 'justify-between gap-3'}`}>
                    {!collapsed && (
                        <div className="flex-1 truncate text-sm text-secondary">
                            <div className="font-semibold">{user?.name || 'Người dùng'}</div>
                            <div className="text-xs text-muted">{footerText}</div>
                        </div>
                    )}
                    <button
                        onClick={onLogout}
                        className="flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-semibold"
                        title="Đăng xuất"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V8a4 4 0 014-4h2" />
                        </svg>
                        {!collapsed && <span>Đăng xuất</span>}
                    </button>
                </div>
                {collapsed && (
                    <div className="text-center mt-2 text-2xs text-muted">{footerText?.split('.')[0] ?? 'v1'}</div>
                )}
            </div>
        </div>
    );
};

export default UserSidebarNav;
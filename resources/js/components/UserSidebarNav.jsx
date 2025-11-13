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
    managementLinks = null,
    automationManagePath = '/dashboard/automations/manage',
    workflowManagePath = '/dashboard/workflows/manage',
    automationDetailPathBuilder = (tableId) => `/dashboard/automations/table/${tableId}`,
    workflowDetailPathBuilder = (workflowId) => `/dashboard/workflows/${workflowId}`,
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

    const defaultManagementLinks = [
        { id: 'manage-automations', label: 'Quản lý Automation', to: automationManagePath, icon: '🛠' },
        { id: 'manage-workflows', label: 'Quản lý Workflows', to: workflowManagePath, icon: '🔁' },
    ];

    const resolvedManagementLinks =
        managementLinks && managementLinks.length > 0 ? managementLinks : defaultManagementLinks;

    const username = user?.name || '';

    const isLinkActive = (link) => {
        if (!link) return false;
        if (typeof link.isActive === 'function') {
            return link.isActive(location.pathname);
        }
        if (link.to) {
            return location.pathname.startsWith(link.to);
        }
        return false;
    };

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

    const collapsedContent = (
        <div className="h-full overflow-y-auto">
            <div className="flex flex-col items-center space-y-4 py-6">
                {resolvedManagementLinks.map((link) => {
                    const active = isLinkActive(link);
                    return (
                        <button
                            key={link.id}
                            title={link.label}
                            onClick={() => link.to && navigate(link.to)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors border ${
                                active
                                    ? 'bg-amber-400 text-white border-amber-400 shadow-card'
                                    : 'bg-surface-elevated text-muted border-subtle hover:bg-surface-muted'
                            }`}
                        >
                            {link.icon || link.label?.charAt(0) || '•'}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const expandedContent = (
        <div className="h-full overflow-y-auto px-3 py-4">
            <div className="py-3">
                <SectionHeader
                    collapsed={collapsed}
                    title="Quản lý"
                    icon="🛠"
                    isOpen={managementOpen}
                    onToggle={() => setManagementOpen((prev) => !prev)}
                />
                {managementOpen && (
                    <div className="mt-1 space-y-1 pl-4">
                        {resolvedManagementLinks.map((link) => {
                            const active = isLinkActive(link);
                            return (
                                <button
                                    key={link.id}
                                    onClick={() => {
                                        if (link.onClick) {
                                            link.onClick();
                                            return;
                                        }
                                        if (link.to) {
                                            navigate(link.to);
                                        }
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                                        active
                                            ? 'bg-amber-100 text-amber-700 border border-amber-300 shadow-card'
                                            : 'text-secondary hover:bg-surface-muted'
                                    }`}
                                >
                                    {link.label}
                                </button>
                            );
                        })}
                        {resolvedManagementLinks.length === 0 && (
                            <div className="px-3 py-2 text-xs text-muted border border-dashed border-subtle rounded-xl">
                                Không có mục
                            </div>
                        )}
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
                    <div className="mt-1 space-y-2 pl-4">
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
                                            className="w-full flex items-center justify-between pl-4 pr-3 py-2 text-sm text-secondary hover:bg-surface-muted rounded-xl"
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
                                            <div className="relative pl-7 pb-3 space-y-1">
                                                <div className="absolute left-3 top-1.5 bottom-1.5 border-l border-subtle opacity-60 pointer-events-none" />
                                                {topic.tables.map((table) => {
                                                    const detailPath = automationDetailPathBuilder(table.id);
                                                    const isTableActive = detailPath && location.pathname.startsWith(detailPath);
                                                    return (
                                                        <div key={table.id} className="flex items-center">
                                                        <div className="w-3 -ml-2 border-t border-subtle opacity-60" />
                                                    <button
                                                        onClick={() => {
                                                            onSelectAutomation?.(topic.id, table.id, detailPath);
                                                            if (detailPath) {
                                                                navigate(detailPath);
                                                            }
                                                        }}
                                                        className={`flex-1 ml-3 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                            isTableActive
                                                                ? 'bg-primary-soft text-primary border border-blue-200 shadow-card'
                                                                : 'text-secondary hover:bg-surface-muted'
                                                        }`}
                                                    >
                                                        {table.name}
                                                    </button>
                                                    </div>
                                                    );
                                                })}
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
                    <div className="mt-1 space-y-2 pl-4">
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
                                            className="w-full flex items-center justify-between pl-4 pr-3 py-2 text-sm text-secondary hover:bg-surface-muted rounded-xl"
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
                                            <div className="relative pl-7 pb-3 space-y-1">
                                                <div className="absolute left-3 top-1.5 bottom-1.5 border-l border-subtle opacity-60 pointer-events-none" />
                                                {folder.workflows.map((workflow) => {
                                                    const workflowPath = workflowDetailPathBuilder(workflow.id);
                                                    const isWorkflowActive = workflowPath && location.pathname.startsWith(workflowPath);
                                                    return (
                                                        <div key={workflow.id} className="flex items-center">
                                                        <div className="w-3 -ml-2 border-t border-subtle opacity-60" />
                                                        <button
                                                            onClick={() => {
                                                                onSelectWorkflow?.(folder.id, workflow.id, workflowPath);
                                                                if (workflowPath) {
                                                                    navigate(workflowPath);
                                                                }
                                                            }}
                                                            className={`flex-1 ml-3 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                                isWorkflowActive
                                                                    ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-card'
                                                                    : 'text-secondary hover:bg-surface-muted'
                                                            }`}
                                                        >
                                                            {workflow.name}
                                                        </button>
                                                    </div>
                                                    );
                                                })}
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
                            <div className="rounded-xl pl-4">
                                <button
                                    onClick={() => {
                                        toggleFolder('unassigned');
                                    }}
                                    className="w-full flex items-center justify-between pl-4 pr-3 py-2 text-sm text-secondary hover:bg-surface-muted rounded-xl"
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
                                    <div className="relative pl-7 pb-3 space-y-1">
                                        <div className="absolute left-3 top-1.5 bottom-1.5 border-l border-subtle opacity-60 pointer-events-none" />
                                        {orphanWorkflows.map((workflow) => {
                                            const workflowPath = workflowDetailPathBuilder(workflow.id);
                                            const isWorkflowActive = workflowPath && location.pathname.startsWith(workflowPath);
                                            return (
                                                <div key={workflow.id} className="flex items-center">
                                                <div className="w-3 -ml-2 border-t border-subtle opacity-60" />
                                            <button
                                                onClick={() => {
                                                    onSelectWorkflow?.('unassigned', workflow.id, workflowPath);
                                                    if (workflowPath) {
                                                        navigate(workflowPath);
                                                    }
                                                }}
                                                className={`flex-1 ml-3 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                    isWorkflowActive
                                                        ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-card'
                                                        : 'text-secondary hover:bg-surface-muted'
                                                }`}
                                            >
                                                {workflow.name}
                                            </button>
                                            </div>
                                            );
                                        })}
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
            <div className="px-4 py-3 flex items-center justify-between">
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

            <div className="flex-1 overflow-hidden">
                {collapsed ? collapsedContent : expandedContent}
            </div>

            <div className="p-4 border-t border-subtle">
                <div className={`flex items-center ${collapsed ? 'flex-col gap-3' : 'justify-between gap-3'}`}>
                    {!collapsed && (
                        <div className="flex-1 truncate text-sm text-secondary">
                            <div className="font-semibold">{username || 'Người dùng'}</div>
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
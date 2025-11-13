import React, { useEffect, useMemo, useState, useRef } from 'react';
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
    const [collapsedSection, setCollapsedSection] = useState(null);
    const [hoverTopicId, setHoverTopicId] = useState(null);
    const [hoverFolderId, setHoverFolderId] = useState(null);
    const [flyoutTop, setFlyoutTop] = useState(0);
    const [subFlyoutTop, setSubFlyoutTop] = useState(0);
    const sidebarRef = useRef(null);

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

    useEffect(() => {
        if (!collapsed) {
            setCollapsedSection(null);
            setHoverTopicId(null);
            setHoverFolderId(null);
        }
    }, [collapsed]);

    useEffect(() => {
        if (collapsedSection !== 'automations') {
            setHoverTopicId(null);
            setSubFlyoutTop(0);
        }
        if (collapsedSection !== 'workflows') {
            setHoverFolderId(null);
            setSubFlyoutTop(0);
        }
    }, [collapsedSection]);

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

    const collapsedSections = [
        { id: 'management', icon: '🛠', label: 'Quản lý' },
        { id: 'automations', icon: '🤖', label: 'Automations' },
        { id: 'workflows', icon: '🔁', label: 'Workflows' },
    ];

    const clampPanelTop = (desiredTop, heightRatio = 0.6) => {
        const panelHeight = window.innerHeight * heightRatio;
        const maxTop = Math.max(0, window.innerHeight - panelHeight );
        return Math.max(0, desiredTop)- 48;
    };

    const renderCollapsedPanelWrapper = (content, heightRatio = 0.6) => (
        <div
            className="absolute left-full top-0 z-50"
            style={{ top: clampPanelTop(flyoutTop, heightRatio) }}
        >
            {content}
        </div>
    );

    const handleSectionHover = (sectionId, event) => {
        setCollapsedSection(sectionId);
        if (sectionId !== 'automations') {
            setHoverTopicId(null);
        }
        if (sectionId !== 'workflows') {
            setHoverFolderId(null);
        }
        setSubFlyoutTop(0);
        if (!sidebarRef.current) return;
        const sidebarRect = sidebarRef.current.getBoundingClientRect();
        const iconRect = event.currentTarget.getBoundingClientRect();
        const rawTop = iconRect.top - sidebarRect.top;
        setFlyoutTop(rawTop);
    };

    const renderCollapsedManagementPanel = () =>
        renderCollapsedPanelWrapper(
            <div className="bg-surface-elevated border border-subtle rounded-2xl shadow-card py-3 w-60">
                <p className="px-4 text-xs font-semibold text-muted uppercase tracking-wide mb-2">Quản lý</p>
                <div className="space-y-1 px-3">
                    {resolvedManagementLinks.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted border border-dashed border-subtle rounded-xl">
                            Không có mục
                        </div>
                    )}
                    {resolvedManagementLinks.map((link) => {
                        const active = isLinkActive(link);
                        return (
                            <button
                                key={link.id}
                                onClick={() => {
                                    setCollapsedSection(null);
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
                </div>
            </div>
        , 0.4);

    const handleTopicHover = (topic, event) => {
        setHoverTopicId(topic.id);
        const columnEl = event.currentTarget.closest('[data-column="true"]');
        if (!columnEl) return;
        const columnRect = columnEl.getBoundingClientRect();
        const rowRect = event.currentTarget.getBoundingClientRect();
        const estimatedHeight = Math.min(window.innerHeight * 0.6, topic.tables.length * 44 + 72);
        const rawTop = rowRect.top - columnRect.top;
        const maxTop = Math.max(0, columnRect.height - estimatedHeight);
        setSubFlyoutTop(Math.min(Math.max(0, rawTop), maxTop));
    };

    const renderCollapsedAutomationsPanel = () => {
        const activeTopic = topics.find((topic) => topic.id === hoverTopicId);
        return renderCollapsedPanelWrapper(
            <div className="relative">
                <div
                    className="w-[220px] max-h-[60vh] overflow-y-auto bg-surface-elevated border border-subtle rounded-2xl shadow-card"
                    data-column="true"
                >
                    <p className="px-3 pt-3 text-xs font-semibold text-muted uppercase tracking-wide mb-2">Automations</p>
                    {loading ? (
                        <p className="px-3 pb-3 text-xs text-muted">Đang tải...</p>
                    ) : topics.length === 0 ? (
                        <p className="px-3 pb-3 text-xs text-muted">Chưa có chủ đề</p>
                    ) : (
                        topics.map((topic) => {
                            const isHovered = hoverTopicId === topic.id;
                            return (
                                <button
                                    key={topic.id}
                                    onMouseEnter={(event) => handleTopicHover(topic, event)}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-xl transition-all duration-150 ${
                                        isHovered
                                            ? 'bg-primary-soft text-primary border border-blue-200 shadow-card'
                                            : 'text-secondary hover:bg-surface-muted hover:translate-x-1'
                                    }`}
                                >
                                    {topic.name}
                                </button>
                            );
                        })
                    )}
                </div>
                {hoverTopicId && activeTopic && (
                    <div
                        className="absolute left-[calc(100%)] w-[260px] max-h-[60vh] overflow-y-auto bg-surface-elevated border border-subtle rounded-2xl shadow-card"
                        style={{ top: subFlyoutTop }}
                    >
                        <p className="px-3 pt-3 text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                            {activeTopic.name}
                        </p>
                        <div className="px-2 pb-3 space-y-1">
                            {activeTopic.tables.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-muted">Chưa có bảng</p>
                            ) : (
                                activeTopic.tables.map((table) => {
                                    const detailPath = automationDetailPathBuilder(table.id);
                                    const active = detailPath && location.pathname.startsWith(detailPath);
                                    return (
                                        <button
                                            key={table.id}
                                            onClick={() => {
                                                onSelectAutomation?.(activeTopic.id, table.id, detailPath);
                                                if (detailPath) {
                                                    navigate(detailPath);
                                                }
                                                setCollapsedSection(null);
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
                                                active
                                                    ? 'bg-primary-soft text-primary border border-blue-200 shadow-card'
                                                    : 'text-secondary hover:bg-surface-muted hover:translate-x-1'
                                            }`}
                                        >
                                            {table.name}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>,
            0.6
        );
    };

    const handleFolderHover = (folder, event) => {
        setHoverFolderId(folder.id);
        const columnEl = event.currentTarget.closest('[data-column="true"]');
        if (!columnEl) return;
        const columnRect = columnEl.getBoundingClientRect();
        const rowRect = event.currentTarget.getBoundingClientRect();
        const workflowCount = (folder.workflows || []).length;
        const estimatedHeight = Math.min(window.innerHeight * 0.6, workflowCount * 44 + 72);
        const rawTop = rowRect.top - columnRect.top;
        const maxTop = Math.max(0, columnRect.height - estimatedHeight);
        setSubFlyoutTop(Math.min(Math.max(0, rawTop), maxTop));
    };

    const renderCollapsedWorkflowsPanel = () => {
        const allFolders = workflowFolders || [];
        const showingOrphan = hoverFolderId === 'unassigned';
        const activeFolder =
            showingOrphan
                ? { id: 'unassigned', name: 'Không thuộc folder', workflows: orphanWorkflows }
                : allFolders.find((folder) => folder.id === hoverFolderId);

        return renderCollapsedPanelWrapper(
            <div className="relative">
                <div
                    className="w-[220px] max-h-[60vh] overflow-y-auto bg-surface-elevated border border-subtle rounded-2xl shadow-card"
                    data-column="true"
                >
                    <p className="px-3 pt-3 text-xs font-semibold text-muted uppercase tracking-wide mb-2">Workflows</p>
                    {loading ? (
                        <p className="px-3 pb-3 text-xs text-muted">Đang tải...</p>
                    ) : (
                        <>
                            {allFolders.map((folder) => (
                                <button
                                    key={folder.id}
                                    onMouseEnter={(event) => handleFolderHover(folder, event)}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-xl transition-all duration-150 ${
                                        hoverFolderId === folder.id
                                            ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-card'
                                            : 'text-secondary hover:bg-surface-muted hover:translate-x-1'
                                    }`}
                                >
                                    {folder.name}
                                </button>
                            ))}
                            {orphanWorkflows.length > 0 && (
                                <button
                                    onMouseEnter={(event) =>
                                        handleFolderHover(
                                            { id: 'unassigned', name: 'Không thuộc folder', workflows: orphanWorkflows },
                                            event
                                        )
                                    }
                                    className={`w-full text-left px-3 py-2 text-sm rounded-xl transition-all duration-150 ${
                                        hoverFolderId === 'unassigned'
                                            ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-card'
                                            : 'text-secondary hover:bg-surface-muted hover:translate-x-1'
                                    }`}
                                >
                                    Không thuộc folder
                                </button>
                            )}
                            {allFolders.length === 0 && orphanWorkflows.length === 0 && (
                                <p className="px-3 pb-3 text-xs text-muted">Chưa có workflow</p>
                            )}
                        </>
                    )}
                </div>
                {hoverFolderId && activeFolder && (
                    <div
                        className="absolute left-[calc(100%+0.5rem)] w-[260px] max-h-[60vh] overflow-y-auto bg-surface-elevated border border-subtle rounded-2xl shadow-card"
                        style={{ top: subFlyoutTop }}
                    >
                        <p className="px-3 pt-3 text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                            {activeFolder.name}
                        </p>
                        <div className="px-2 pb-3 space-y-1">
                            {activeFolder.workflows.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-muted">Chưa có workflow</p>
                            ) : (
                                activeFolder.workflows.map((workflow) => {
                                    const workflowPath = workflowDetailPathBuilder(workflow.id);
                                    const active = workflowPath && location.pathname.startsWith(workflowPath);
                                    return (
                                        <button
                                            key={workflow.id}
                                            onClick={() => {
                                                onSelectWorkflow?.(activeFolder.id, workflow.id, workflowPath);
                                                if (workflowPath) {
                                                    navigate(workflowPath);
                                                }
                                                setCollapsedSection(null);
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
                                                active
                                                    ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-card'
                                                    : 'text-secondary hover:bg-surface-muted hover:translate-x-1'
                                            }`}
                                        >
                                            {workflow.name}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderCollapsedSidebar = () => (
        <div
            className="h-full relative"
            onMouseLeave={() => {
                setCollapsedSection(null);
                setHoverTopicId(null);
                setHoverFolderId(null);
                setFlyoutTop(0);
                setSubFlyoutTop(0);
            }}
        >
            <div className="flex flex-col items-center space-y-4 py-6">
                {collapsedSections.map((section) => (
                    <button
                        key={section.id}
                        onMouseEnter={(event) => handleSectionHover(section.id, event)}
                        className={`w-12 h-12 flex items-center justify-center rounded-xl border transition-colors ${
                            collapsedSection === section.id
                                ? 'bg-primary-soft text-primary border-blue-200'
                                : 'bg-surface-elevated text-muted border-subtle hover:bg-surface-muted'
                        }`}
                        title={section.label}
                    >
                        <span className="text-xl">{section.icon}</span>
                    </button>
                ))}
            </div>

            {collapsedSection === 'management' && renderCollapsedManagementPanel()}
            {collapsedSection === 'automations' && renderCollapsedAutomationsPanel()}
            {collapsedSection === 'workflows' && renderCollapsedWorkflowsPanel()}
        </div>
    );

    const expandedContent = (
        <div className="h-full overflow-y-auto px-3 py-4 pr-2">
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
                                            <span className="align-left">{topic.name}</span>
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
                                                        className={`flex-1 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
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
                                            <span className="align-left">{folder.name}</span>
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
                                                            className={`flex-1 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
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
                            <div className="rounded-xl">
                                <button
                                    onClick={() => {
                                        toggleFolder('unassigned');
                                    }}
                                    className="w-full flex items-center justify-between pl-4 pr-3 py-2 text-sm text-secondary hover:bg-surface-muted rounded-xl"
                                >
                                    <span className="align-left">Không thuộc folder</span>
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
                                                className={`flex-1 text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
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
        <div
            ref={sidebarRef}
            className={`${collapsed ? 'w-16' : 'w-72'} bg-surface-elevated text-secondary h-screen transition-all duration-300 flex flex-col border-r border-subtle shadow-card`}
        >
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

            <div className="flex-1 min-h-0">
                {collapsed ? renderCollapsedSidebar() : expandedContent}
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
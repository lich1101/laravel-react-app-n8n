import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SectionHeader = ({ collapsed, title, iconPath, isOpen, onToggle }) => (
    <button
        onClick={onToggle}
        className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2 text-sm font-semibold text-secondary hover:bg-surface-muted rounded-xl transition-colors`}
    >
        <div className="flex items-center space-x-2">
            {iconPath && (
                <img 
                    src={iconPath} 
                    alt={title}
                    className="w-5 h-5 text-gray-400 dark:text-gray-500"
                    style={{ filter: 'opacity(0.7)' }}
                />
            )}
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
    // Preload logo and icon SVGs
    React.useEffect(() => {
        const img1 = new Image();
        img1.src = '/icons/logo-light.svg';
        const img2 = new Image();
        img2.src = '/icons/logo-icon.svg';
        const img3 = new Image();
        img3.src = '/icons/chevron-left.svg';
        const img4 = new Image();
        img4.src = '/icons/chevron-right.svg';
        const img5 = new Image();
        img5.src = '/icons/manage.svg';
        const img6 = new Image();
        img6.src = '/icons/table-automation.svg';
        const img7 = new Image();
        img7.src = '/icons/workflow.svg';
    }, []);
    const navigate = useNavigate();
    const location = useLocation();
    const [managementOpen, setManagementOpen] = useState(true);
    const [automationOpen, setAutomationOpen] = useState(true);
    const [workflowsOpen, setWorkflowsOpen] = useState(true);
    const [expandedTopics, setExpandedTopics] = useState(new Set());
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [isPermanentlyCollapsed, setIsPermanentlyCollapsed] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const toggleButtonRef = useRef(null);
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


    const expandedContent = (
        <div className="h-full overflow-y-auto px-3 py-4 pr-2">
            <div className="py-3">
                <SectionHeader
                    collapsed={collapsed}
                    title="Quản lý"
                    iconPath="/icons/manage.svg"
                    isOpen={managementOpen}
                    onToggle={() => setManagementOpen((prev) => !prev)}
                />
                {managementOpen && !collapsed && (
                    <div className="relative mt-1 space-y-1 pl-4">
                        {resolvedManagementLinks.map((link, index) => {
                            const active = isLinkActive(link);
                            const isLast = index === resolvedManagementLinks.length - 1;
                            return (
                                <div key={link.id} className="relative flex items-center pl-4">
                                    {/* Vertical line */}
                                    <div className={`absolute left-0 top-0 w-px bg-gray-300 ${isLast ? 'h-1/2' : 'h-full'}`} />
                                    {/* Dot - centered on the line */}
                                    <div className="absolute left-0 w-2 h-2 rounded-full bg-gray-400" style={{ left: '-3.5px' }} />
                                    <button
                                        onClick={() => {
                                            if (link.onClick) {
                                                link.onClick();
                                                return;
                                            }
                                            if (link.to) {
                                                navigate(link.to);
                                            }
                                        }}
                                        className={`w-full text-left pl-4 pr-3 py-2 rounded-xl text-sm transition-colors ${
                                            active
                                                ? 'text-blue-600 font-semibold'
                                                : 'text-secondary hover:bg-surface-muted'
                                        }`}
                                    >
                                        {link.label}
                                    </button>
                                </div>
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
                    iconPath="/icons/table-automation.svg"
                    isOpen={automationOpen}
                    onToggle={() => setAutomationOpen((prev) => !prev)}
                />
                {automationOpen && !collapsed && (
                    <div className="mt-1 space-y-2 pl-4">
                        {loading ? (
                            <p className="px-3 py-2 text-xs text-muted">Đang tải chủ đề...</p>
                        ) : (
                            topics.map((topic, topicIndex) => {
                                const isExpanded = expandedTopics.has(topic.id);
                                const isLastTopic = topicIndex === topics.length - 1;
                                return (
                                    <div key={topic.id} className="relative rounded-xl">
                                        {/* Vertical line */}
                                        <div className={`absolute left-0 top-0 w-px bg-gray-300 ${isLastTopic && !isExpanded ? 'h-1/2' : isExpanded ? 'h-full' : 'h-1/2'}`} />
                                        {/* Dot */}
                                        <div className="absolute left-0 w-2 h-2 rounded-full bg-gray-400" style={{ left: '-3.5px', top: '1rem' }} />
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
                                            <div className="relative pl-4 pb-3 space-y-1">
                                                {/* Continue vertical line from topic */}
                                                <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300" />
                                                {topic.tables.map((table, tableIndex) => {
                                                    const detailPath = automationDetailPathBuilder(table.id);
                                                    const isTableActive = detailPath && location.pathname.startsWith(detailPath);
                                                    const isLastTable = tableIndex === topic.tables.length - 1;
                                                    return (
                                                        <div key={table.id} className="relative flex items-center pl-4">
                                                            {/* Vertical line */}
                                                            <div className={`absolute left-0 top-0 w-px bg-gray-300 ${isLastTable ? 'h-1/2' : 'h-full'}`} />
                                                            {/* Dot - centered on the line */}
                                                            <div className="absolute left-0 w-2 h-2 rounded-full bg-gray-400" style={{ left: '-3.5px' }} />
                                                            <button
                                                                onClick={() => {
                                                                    onSelectAutomation?.(topic.id, table.id, detailPath);
                                                                    if (detailPath) {
                                                                        navigate(detailPath);
                                                                    }
                                                                }}
                                                                className={`flex-1 text-left pl-4 pr-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                                    isTableActive
                                                                        ? 'text-blue-600 font-semibold'
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
                    iconPath="/icons/workflow.svg"
                    isOpen={workflowsOpen}
                    onToggle={() => setWorkflowsOpen((prev) => !prev)}
                />
                {workflowsOpen && !collapsed && (
                    <div className="mt-1 space-y-2 pl-4">
                        {loading ? (
                            <p className="px-3 py-2 text-xs text-muted">Đang tải workflows...</p>
                        ) : (
                            workflowFolders.map((folder, folderIndex) => {
                                const isExpanded = expandedFolders.has(folder.id);
                                const isLastFolder = folderIndex === workflowFolders.length - 1 && orphanWorkflows.length === 0;
                                return (
                                    <div key={folder.id} className="relative rounded-xl">
                                        {/* Vertical line */}
                                        <div className={`absolute left-0 top-0 w-px bg-gray-300 ${isLastFolder && !isExpanded ? 'h-1/2' : isExpanded ? 'h-full' : 'h-1/2'}`} />
                                        {/* Dot */}
                                        <div className="absolute left-0 w-2 h-2 rounded-full bg-gray-400" style={{ left: '-3.5px', top: '1rem' }} />
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
                                            <div className="relative pl-4 pb-3 space-y-1">
                                                {/* Continue vertical line from folder */}
                                                <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300" />
                                                {folder.workflows.map((workflow, workflowIndex) => {
                                                    const workflowPath = workflowDetailPathBuilder(workflow.id);
                                                    const isWorkflowActive = workflowPath && location.pathname.startsWith(workflowPath);
                                                    const isLastWorkflow = workflowIndex === folder.workflows.length - 1;
                                                    return (
                                                        <div key={workflow.id} className="relative flex items-center pl-4">
                                                            {/* Vertical line */}
                                                            <div className={`absolute left-0 top-0 w-px bg-gray-300 ${isLastWorkflow ? 'h-1/2' : 'h-full'}`} />
                                                            {/* Dot - centered on the line */}
                                                            <div className="absolute left-0 w-2 h-2 rounded-full bg-gray-400" style={{ left: '-3.5px' }} />
                                                            <button
                                                                onClick={() => {
                                                                    onSelectWorkflow?.(folder.id, workflow.id, workflowPath);
                                                                    if (workflowPath) {
                                                                        navigate(workflowPath);
                                                                    }
                                                                }}
                                                                className={`flex-1 text-left pl-4 pr-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                                    isWorkflowActive
                                                                        ? 'text-blue-600 font-semibold'
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
                            <div className="relative rounded-xl">
                                {/* Vertical line */}
                                <div className={`absolute left-0 top-0 w-px bg-gray-300 ${!expandedFolders.has('unassigned') ? 'h-1/2' : 'h-full'}`} />
                                {/* Dot */}
                                <div className="absolute left-0 w-2 h-2 rounded-full bg-gray-400" style={{ left: '-3.5px', top: '1rem' }} />
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
                                    <div className="relative pl-4 pb-3 space-y-1">
                                        {/* Continue vertical line from unassigned folder */}
                                        <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300" />
                                        {orphanWorkflows.map((workflow, workflowIndex) => {
                                            const workflowPath = workflowDetailPathBuilder(workflow.id);
                                            const isWorkflowActive = workflowPath && location.pathname.startsWith(workflowPath);
                                            const isLastWorkflow = workflowIndex === orphanWorkflows.length - 1;
                                            return (
                                                <div key={workflow.id} className="relative flex items-center pl-4">
                                                    {/* Vertical line */}
                                                    <div className={`absolute left-0 top-0 w-px bg-gray-300 ${isLastWorkflow ? 'h-1/2' : 'h-full'}`} />
                                                    {/* Dot - centered on the line */}
                                                    <div className="absolute left-0 w-2 h-2 rounded-full bg-gray-400" style={{ left: '-3.5px' }} />
                                                    <button
                                                        onClick={() => {
                                                            onSelectWorkflow?.('unassigned', workflow.id, workflowPath);
                                                            if (workflowPath) {
                                                                navigate(workflowPath);
                                                            }
                                                        }}
                                                        className={`flex-1 text-left pl-4 pr-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                            isWorkflowActive
                                                                ? 'text-blue-600 font-semibold'
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

    const handleMouseEnter = () => {
        // Không trigger nếu đang trong quá trình toggle
        if (isToggling) {
            return;
        }
        // Khi sidebar đang thu gọn (dù là vĩnh viễn hay tạm thời), tự động mở rộng tạm thời
        if (collapsed) {
            setCollapsed(false);
        }
    };

    const handleMouseLeave = () => {
        // Không trigger nếu đang trong quá trình toggle
        if (isToggling) {
            return;
        }
        // Khi chuột rời khỏi sidebar và đang ở trạng thái thu gọn vĩnh viễn, thu gọn lại
        if (!collapsed && isPermanentlyCollapsed) {
            setCollapsed(true);
        }
    };

    const handleToggleCollapse = () => {
        setIsToggling(true);
        const newCollapsed = !collapsed;
        setCollapsed(newCollapsed);
        // Nếu thu gọn thì đánh dấu là thu gọn vĩnh viễn, nếu mở rộng thì clear flag
        setIsPermanentlyCollapsed(newCollapsed);
        // Sau 300ms (thời gian transition) mới cho phép hover trigger lại
        setTimeout(() => {
            setIsToggling(false);
        }, 300);
    };

    return (
        <div className="relative">
            <div
                ref={sidebarRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`${collapsed ? 'w-16' : 'w-72'} bg-surface-elevated text-secondary h-screen flex flex-col border-r border-subtle shadow-card overflow-visible`}
                style={{
                    transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                    willChange: 'width'
                }}
            >
            <div className="px-4 py-4 flex items-center min-h-[72px] relative">
                {/* Logo for expanded sidebar */}
                {!collapsed && (
                    <img 
                        src="/icons/logo-light.svg" 
                        alt="ChatPlus" 
                        className="h-10 object-contain transition-opacity duration-200"
                        style={{ 
                            willChange: 'opacity',
                            backfaceVisibility: 'hidden',
                            transform: 'translateZ(0)'
                        }}
                    />
                )}
                {/* Logo icon for collapsed sidebar */}
                {collapsed && (
                    <img 
                        src="/icons/logo-icon.svg" 
                        alt="ChatPlus" 
                        className="h-10 w-10 object-contain absolute left-1/2 transform -translate-x-1/2 transition-opacity duration-200"
                        style={{ 
                            willChange: 'opacity',
                            backfaceVisibility: 'hidden'
                        }}
                    />
                )}
            </div>

            <div className="flex-1 min-h-0 relative overflow-hidden">
                {/* Expanded content */}
                <div 
                    className={`absolute inset-0 transition-opacity duration-200 ease-in-out ${collapsed ? 'opacity-0 pointer-events-none delay-0' : 'opacity-100 delay-100'}`}
                    style={{ 
                        transform: collapsed ? 'translateX(-8px)' : 'translateX(0)',
                        transition: 'opacity 200ms ease-in-out, transform 200ms ease-in-out'
                    }}
                >
                    {expandedContent}
                </div>
                {/* Collapsed content - chỉ hiển thị icons */}
                {collapsed && (
                    <div className="absolute inset-0 flex flex-col items-center py-4 space-y-4">
                        <button
                            onClick={() => setManagementOpen((prev) => !prev)}
                            className="w-10 h-10 flex items-center justify-center hover:bg-surface-muted rounded-xl transition-colors"
                            title="Quản lý"
                        >
                            <img 
                                src="/icons/manage.svg" 
                                alt="Quản lý"
                                className="w-5 h-5"
                                style={{ filter: 'opacity(0.7)' }}
                            />
                        </button>
                        <button
                            onClick={() => setAutomationOpen((prev) => !prev)}
                            className="w-10 h-10 flex items-center justify-center hover:bg-surface-muted rounded-xl transition-colors"
                            title="Automations"
                        >
                            <img 
                                src="/icons/table-automation.svg" 
                                alt="Automations"
                                className="w-5 h-5"
                                style={{ filter: 'opacity(0.7)' }}
                            />
                        </button>
                        <button
                            onClick={() => setWorkflowsOpen((prev) => !prev)}
                            className="w-10 h-10 flex items-center justify-center hover:bg-surface-muted rounded-xl transition-colors"
                            title="Workflows"
                        >
                            <img 
                                src="/icons/workflow.svg" 
                                alt="Workflows"
                                className="w-5 h-5"
                                style={{ filter: 'opacity(0.7)' }}
                            />
                        </button>
                    </div>
                )}
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
        {/* Toggle button - tách ra ngoài sidebar để không trigger hover */}
        {/* Button ẩn khi sidebar mở rộng tạm thời (do hover), chỉ hiển thị khi collapsed hoặc mở rộng vĩnh viễn */}
        {(!collapsed && isPermanentlyCollapsed) ? null : (
            <button
                ref={toggleButtonRef}
                onClick={handleToggleCollapse}
                className={`absolute  transition-all duration-200 ${collapsed ? 'top-6 right-[-28px] z-50 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-r-lg p-1.5 shadow-sm' : 'top-7 z-10 text-muted hover:text-primary'}`}
                title={collapsed ? 'Mở rộng' : 'Thu gọn'}
                style={{
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                    // Đảm bảo button luôn hiển thị
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    // Vị trí dựa trên width của sidebar
                    left: collapsed ? 'auto' : 'calc(19rem - 3rem)', // 18rem = w-72, 3rem = khoảng cách từ bên phải
                    right: collapsed ? '-28px' : 'auto'
                }}
            >
            {collapsed ? (
                // Icon mũi tên phải khi thu gọn (để mở rộng)
                <img 
                    src="/icons/chevron-right.svg" 
                    alt="Mở rộng"
                    className="w-3.5 h-3.5"
                    style={{
                        willChange: 'opacity',
                        backfaceVisibility: 'hidden'
                    }}
                />
            ) : (
                // Icon mũi tên trái khi mở rộng (để thu gọn) - hiển thị cả khi mở rộng tạm thời
                <img 
                    src="/icons/chevron-left.svg" 
                    alt="Thu gọn"
                    className="w-5 h-5"
                    style={{
                        willChange: 'opacity',
                        backfaceVisibility: 'hidden'
                    }}
                />
            )}
            </button>
        )}
        </div>
    );
};

export default UserSidebarNav;
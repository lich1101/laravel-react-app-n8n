import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const DashboardSidebarNav = ({
    collapsed,
    setCollapsed,
    sections = [],
    footerText = 'v1.0.0',
    user = null,
    onLogout = () => {},
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [openSections, setOpenSections] = useState(() => new Set(sections.map((section) => section.id)));

    useEffect(() => {
        setOpenSections((prev) => {
            const next = new Set(prev);
            sections.forEach((section) => {
                const hasActiveLink = section.links?.some((link) => isActive(link));
                if (hasActiveLink) {
                    next.add(section.id);
                }
            });
            return next;
        });
    }, [location.pathname, sections]);

    const toggleSection = (sectionId) => {
        setOpenSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionId)) {
                next.delete(sectionId);
            } else {
                next.add(sectionId);
            }
            return next;
        });
    };

    const flattenLinks = useMemo(
        () =>
            sections.flatMap((section) =>
                (section.links || []).map((link) => ({
                    ...link,
                    sectionId: section.id,
                }))
            ),
        [sections]
    );

    const isActive = (link) => {
        if (!link?.to) return false;
        if (link.exact) {
            return location.pathname === link.to;
        }
        return location.pathname.startsWith(link.to);
    };

    const handleNavigate = (link) => {
        if (!link?.to) return;
        navigate(link.to);
        if (link.onSelect) {
            link.onSelect();
        }
    };

    const renderCollapsed = () => (
        <div className="flex-1 overflow-y-auto py-6 flex flex-col items-center space-y-4">
            {flattenLinks.map((link) => {
                const active = isActive(link);
                return (
                    <button
                        key={link.id}
                        title={link.label}
                        onClick={() => handleNavigate(link)}
                        className={`w-11 h-11 rounded-2xl border transition-colors flex items-center justify-center text-lg ${
                            active
                                ? 'bg-primary-color text-white border-primary-color shadow-card'
                                : 'bg-surface-elevated text-muted border-subtle hover:bg-surface-muted hover:text-primary'
                        }`}
                    >
                        {link.icon || link.label?.charAt(0) || '•'}
                    </button>
                );
            })}
        </div>
    );

    const renderExpanded = () => (
        <div className="flex-1 overflow-y-auto px-3 py-5 space-y-5">
            {sections.map((section) => {
                const open = openSections.has(section.id);
                return (
                    <div key={section.id} className="space-y-2">
                        <button
                            onClick={() => toggleSection(section.id)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-2xl text-sm font-semibold text-secondary hover:bg-surface-muted transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                {section.icon && <span className="text-lg">{section.icon}</span>}
                                <span>{section.title}</span>
                            </span>
                            <svg
                                className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {open && (
                            <div className="pl-2 space-y-1">
                                {(section.links || []).map((link) => {
                                    const active = isActive(link);
                                    return (
                                        <button
                                            key={link.id}
                                            onClick={() => handleNavigate(link)}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                                                active
                                                    ? 'bg-primary-soft text-primary border border-blue-200 shadow-card'
                                                    : 'text-secondary hover:bg-surface-muted'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                {link.icon && <span className="text-base">{link.icon}</span>}
                                                {link.label}
                                            </span>
                                            {link.badge && (
                                                <span className="px-2 py-0.5 text-2xs rounded-full bg-surface-muted text-muted border border-subtle">
                                                    {link.badge}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                                {(!section.links || section.links.length === 0) && (
                                    <div className="px-3 py-2 text-xs text-muted border border-dashed border-subtle rounded-xl">
                                        Không có mục
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    const username = user?.name || '';

    return (
        <div
            className={`${
                collapsed ? 'w-20' : 'w-80'
            } bg-surface-elevated text-secondary min-h-screen transition-all duration-300 flex flex-col border-r border-subtle shadow-card`}
        >
            <div className="p-4 flex items-center justify-between border-b border-subtle">
                {!collapsed && <span className="text-lg font-semibold text-primary">Bảng điều khiển</span>}
                <button
                    onClick={() => setCollapsed((prev) => !prev)}
                    className="text-muted hover:text-primary transition-colors"
                    title={collapsed ? 'Mở rộng' : 'Thu gọn'}
                >
                    <svg
                        className={`w-5 h-5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {collapsed ? renderCollapsed() : renderExpanded()}

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
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
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

export default DashboardSidebarNav;



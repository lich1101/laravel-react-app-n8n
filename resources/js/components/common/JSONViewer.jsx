import React from 'react';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath } from '../../utils/variablePath';

/**
 * Reusable JSON viewer component với draggable variables
 */
export default function JSONViewer({
    data,
    prefix = '',
    indent = 0,
    collapsedPaths = new Set(),
    onToggleCollapse,
    className = ''
}) {
    const truncateText = (text, maxLength = 150) => {
        if (typeof text !== 'string') return text;
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    const getTypeInfo = (value) => {
        if (value === null) return { icon: '∅', color: 'gray', label: 'null' };
        if (Array.isArray(value)) return { icon: '[]', color: 'purple', label: 'array' };
        if (typeof value === 'object') return { icon: '{}', color: 'blue', label: 'object' };
        if (typeof value === 'string') return { icon: 'Abc', color: 'green', label: 'string' };
        if (typeof value === 'number') return { icon: '123', color: 'orange', label: 'number' };
        if (typeof value === 'boolean') return { icon: '✓', color: 'teal', label: 'boolean' };
        return { icon: '?', color: 'gray', label: 'unknown' };
    };

    const renderDraggableJSON = (obj, path = '', level = 0) => {
        const currentPrefix = normalizeVariablePrefix(path, level === 0);

        if (obj === null || obj === undefined) {
            return (
                <div className="flex items-center gap-2 py-1">
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">null</span>
                </div>
            );
        }

        if (Array.isArray(obj)) {
            const typeInfo = getTypeInfo(obj);
            const collapseKey = currentPrefix || path;
            const isCollapsed = collapsedPaths.has(collapseKey);
            return (
                <div className="space-y-1">
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
                        onClick={() => onToggleCollapse?.(collapseKey)}
                    >
                        <span className="text-gray-500 text-xs">
                            {isCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                            {typeInfo.icon}
                        </span>
                        <span className="text-xs text-gray-500">{obj.length} items</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-4 space-y-1">
                            {obj.map((item, index) => (
                                <div key={index} className="border-l-2 border-gray-200 pl-3">
                                    <div className="text-xs text-gray-500 mb-1">[{index}]</div>
                                    {renderDraggableJSON(item, buildArrayPath(currentPrefix, index), level + 1)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            const basePath = currentPrefix || path;
            const baseCollapsed = collapsedPaths.has(basePath);
            return (
                <div className="space-y-1">
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
                        onClick={() => onToggleCollapse?.(basePath)}
                    >
                        <span className="text-gray-500 text-xs">
                            {baseCollapsed ? '▶' : '▼'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 bg-${getTypeInfo(obj).color}-100 text-${getTypeInfo(obj).color}-700 rounded font-mono`}>
                            {getTypeInfo(obj).icon}
                        </span>
                        <span className="text-xs text-gray-500">{keys.length} keys</span>
                    </div>
                    {!baseCollapsed && (
                        <div className="ml-4 space-y-1">
                            {keys.map((key) => {
                                const value = obj[key];
                                const variablePath = buildVariablePath(basePath, key);
                                const isPrimitive = value === null || value === undefined || (typeof value !== 'object' && !Array.isArray(value));
                                const childCollapsed = collapsedPaths.has(variablePath);
                                const typeInfo = getTypeInfo(value);

                                return (
                                    <div key={key} className="group">
                                        <div className="flex items-start gap-2 py-1 hover:bg-gray-100 rounded px-2 -mx-2">
                                            {!isPrimitive && (
                                                <span 
                                                    className="text-gray-500 text-xs cursor-pointer mt-1"
                                                    onClick={() => onToggleCollapse?.(variablePath)}
                                                >
                                                    {childCollapsed ? '▶' : '▼'}
                                                </span>
                                            )}
                                            <div 
                                                className="flex-1 min-w-0 cursor-move"
                                                draggable="true"
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                                    e.dataTransfer.effectAllowed = 'copy';
                                                }}
                                                title={`Kéo thả để sử dụng {{${variablePath}}}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono flex-shrink-0`}>
                                                        {typeInfo.icon}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-700 truncate">
                                                        {key}
                                                    </span>
                                                    {!isPrimitive && childCollapsed && (
                                                        <span className="text-xs text-gray-500">
                                                            {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {isPrimitive && (
                                                    <div 
                                                        className="mt-1 text-xs text-gray-600 font-mono break-all cursor-move"
                                                        draggable="true"
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('text/plain', `{{${variablePath}}}`);
                                                            e.dataTransfer.effectAllowed = 'copy';
                                                        }}
                                                    >
                                                        {typeof value === 'string' 
                                                            ? `"${truncateText(value)}"`
                                                            : String(value)
                                                        }
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => {
                                                    const variable = `{{${variablePath}}}`;
                                                    navigator.clipboard.writeText(variable);
                                                    alert(`✓ Đã copy: ${variable}`);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-opacity flex-shrink-0"
                                                title="Copy variable"
                                            >
                                                📋
                                            </button>
                                        </div>

                                        {!isPrimitive && !childCollapsed && (
                                            <div className="ml-6 mt-1 border-l-2 border-gray-200 pl-3">
                                                {renderDraggableJSON(value, variablePath, level + 1)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        const typeInfo = getTypeInfo(obj);
        return (
            <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 bg-${typeInfo.color}-100 text-${typeInfo.color}-700 rounded font-mono`}>
                    {typeInfo.icon}
                </span>
                <span className="text-xs text-gray-600 font-mono">
                    {typeof obj === 'string' ? `"${truncateText(obj)}"` : String(obj)}
                </span>
            </div>
        );
    };

    if (!data) {
        return (
            <div className={`text-center text-gray-500 py-8 ${className}`}>
                <p>No data available</p>
            </div>
        );
    }

    return (
        <div className={className}>
            {renderDraggableJSON(data, prefix, indent)}
        </div>
    );
}


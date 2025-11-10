import React, { useState, useRef, useEffect } from 'react';
import { normalizeVariablePrefix, buildVariablePath, buildArrayPath, resolveVariableValue } from '../utils/variablePath';

/**
 * Expandable Textarea với syntax highlighting cho {{variables}}
 * Giống như n8n - có icon expand ở góc, highlight variables màu xanh
 */
function ExpandableTextarea({ 
    value, 
    onChange, 
    onDrop,
    placeholder = '',
    rows = 4,
    className = '',
    label = '',
    hint = '',
    disabled = false,
    inputData = {} // Thêm inputData để resolve variables trong preview
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const textareaRef = useRef(null);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    // Handle drop event
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const variable = e.dataTransfer.getData('text/plain');
        if (!variable) return;
        
        const textarea = e.target;
        
        // Get cursor position - use !== undefined to handle position 0 correctly
        const start = textarea.selectionStart !== undefined && textarea.selectionStart !== null 
            ? textarea.selectionStart 
            : (textarea.value ? textarea.value.length : 0);
        const end = textarea.selectionEnd !== undefined && textarea.selectionEnd !== null 
            ? textarea.selectionEnd 
            : start;
        
        // Use textarea.value (DOM value) instead of React value prop to get the latest text
        const currentValue = textarea.value || '';
        const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
        
        // Immediately update value
        if (onChange) {
            onChange(newValue);
        }
        
        // Set cursor position after variable
        setTimeout(() => {
            if (textareaRef.current) {
                const newCursorPos = start + variable.length;
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                textareaRef.current.focus();
            }
        }, 10);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    // Resolve variables từ inputData
    const resolveVariables = (text) => {
        if (!text || !inputData) return text;
        
        return text.replace(/\{\{([^}]+)\}\}/g, (fullMatch, path) => {
            const trimmedPath = path.trim();
            if (!trimmedPath) {
                return fullMatch;
            }

            const value = getValueFromPath(trimmedPath, inputData);
            if (value !== undefined) {
                if (value === null) {
                    return 'null';
                }
                return typeof value === 'string' ? value : JSON.stringify(value);
            }
            
            return fullMatch; // Keep original if not found
        });
    };

    // Get value from path - Supports complex paths with array indices
    // Examples: "NodeName.field", "NodeName.array[0]", "NodeName.array[0].nested[1].field"
    // Also handles built-in variables like "now"
    const getValueFromPath = (path, data) => {
        // Handle built-in variables
        if (path === 'now') {
            const now = new Date();
            const vietnamTime = now.toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            return vietnamTime;
        }
        
        if (!data) return undefined;
        
        const resolved = resolveVariableValue(path, data);
        return resolved.exists ? resolved.value : undefined;
    };

    // Highlight {{variables}} trong text - mode = 'template' or 'resolved'
    const renderHighlightedText = (text, mode = 'template') => {
        if (!text) return null;
        
        // Split text by {{...}} pattern
        const parts = [];
        let lastIndex = 0;
        const regex = /\{\{([^}]+)\}\}/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Add text before variable
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: text.substring(lastIndex, match.index),
                    key: `text-${lastIndex}`
                });
            }
            
            // Add variable (resolved or template)
            if (mode === 'resolved') {
                const path = match[1].trim();
                const value = getValueFromPath(path, inputData);
                if (value !== undefined) {
                    const displayValue = value === null
                        ? 'null'
                        : (typeof value === 'string' ? value : JSON.stringify(value));
                
                parts.push({
                        type: 'resolved',
                    content: displayValue,
                    key: `var-${match.index}`,
                        exists: true,
                    });
                } else {
                    parts.push({
                        type: 'variable',
                        content: match[0],
                        key: `var-${match.index}`,
                        exists: false,
                    });
                }
            } else {
                // Check if variable exists in inputData
                const path = match[1].trim();
                
                // Check if it's a built-in variable (like 'now')
                const isBuiltIn = path === 'now';
                
                // For built-in variables, always exists
                // For regular variables, check inputData
                const value = isBuiltIn ? getValueFromPath(path, {}) : getValueFromPath(path, inputData);
                const exists = isBuiltIn || value !== undefined;
                
                parts.push({
                    type: 'variable',
                    content: match[0], // Full {{...}}
                    key: `var-${match.index}`,
                    exists: exists, // Track if variable exists
                    isBuiltIn: isBuiltIn // Track if it's a built-in variable
                });
            }
            
            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push({
                type: 'text',
                content: text.substring(lastIndex),
                key: `text-${lastIndex}`
            });
        }

        return parts.map(part => {
            if (part.type === 'variable' || part.type === 'resolved') {
                // Green if exists, red if not found
                const exists = part.exists !== false; // Default to true if not set (for resolved values)
                const colorClass = exists 
                    ? 'text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
                
                return (
                    <span key={part.key} className={`${colorClass} font-semibold px-1 rounded`}>
                        {part.content}
                    </span>
                );
            }
            return <span key={part.key} className="text-gray-900 dark:text-white">{part.content}</span>;
        });
    };

    const textareaComponent = (
        <div className="relative">
            <textarea
                ref={textareaRef}
                value={value || ''}
                onChange={(e) => onChange && onChange(e.target.value)}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onSelect={(e) => setCursorPosition(e.target.selectionStart)}
                onClick={(e) => setCursorPosition(e.target.selectionStart)}
                onKeyUp={(e) => setCursorPosition(e.target.selectionStart)}
                placeholder={placeholder}
                rows={isExpanded ? 20 : rows}
                disabled={disabled}
                className={`w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm resize-none ${className}`}
                style={{ 
                    minHeight: isExpanded ? '500px' : 'auto',
                    whiteSpace: 'pre-wrap',
                }}
            />
            
            {/* Expand/Collapse Icon */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="absolute top-2 right-2 p-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded text-gray-600 dark:text-gray-300 transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand'}
            >
                {isExpanded ? (
                    // Minimize icon
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    // Expand icon
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                )}
            </button>
        </div>
    );

    // Render INPUT panel với draggable variables
    const renderInputPanel = () => {
        if (!inputData || Object.keys(inputData).length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <p className="text-sm">No input data available</p>
                </div>
            );
        }

        return (
            <div className="space-y-3">
                {Object.entries(inputData).filter(([key]) => !key.match(/^\d+$/)).map(([nodeName, data]) => (
                    <div key={nodeName}>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{nodeName}:</div>
                        <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
                            {renderDraggableData(data, nodeName)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // Toggle collapse state
    const toggleCollapse = (path) => {
        setCollapsedPaths(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    // Render draggable data fields
    const renderDraggableData = (obj, prefix = '', depth = 0) => {
        const currentPrefix = normalizeVariablePrefix(prefix, depth === 0);

        if (obj === null || obj === undefined) {
            if (!currentPrefix) {
            return <span className="text-xs text-gray-500 dark:text-gray-400">null</span>;
            }

            return (
                <div 
                    className="text-xs text-gray-700 dark:text-gray-300 cursor-move p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    draggable="true"
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `{{${currentPrefix}}}`)}
                    title={`Drag {{${currentPrefix}}}`}
                >
                    null
                </div>
            );
        }

        if (typeof obj !== 'object') {
            return (
                <div 
                    className="text-xs text-gray-700 dark:text-gray-300 cursor-move p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    draggable="true"
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `{{${currentPrefix}}}`)}
                    title={`Drag {{${currentPrefix}}}`}
                >
                    {typeof obj === 'string' ? `"${obj.substring(0, 50)}${obj.length > 50 ? '...' : ''}"` : String(obj)}
                </div>
            );
        }

        if (Array.isArray(obj)) {
            const collapseKey = currentPrefix || prefix;
            const isCollapsed = collapsedPaths.has(collapseKey);
            return (
                <div className="text-xs">
                    <div 
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded"
                        onClick={() => toggleCollapse(collapseKey)}
                    >
                        <span className="text-gray-500 dark:text-gray-400">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="text-purple-600 dark:text-purple-400">Array ({obj.length} items)</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-4 mt-1 space-y-1">
                            {obj.map((item, index) => {
                                const itemPath = buildArrayPath(currentPrefix, index);

                                return (
                                <div key={index}>
                                    <span className="text-gray-500 dark:text-gray-400">[{index}]:</span>
                                    {renderDraggableData(item, itemPath, depth + 1)}
                                </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        // Object
        const basePrefix = currentPrefix || prefix;
        const isCollapsed = collapsedPaths.has(basePrefix);
        const keys = Object.keys(obj);
        
        return (
            <div className="space-y-1">
                {keys.map(key => {
                    const variablePath = buildVariablePath(basePrefix, key);
                    const isPrimitive = typeof obj[key] !== 'object' || obj[key] === null;
                    const hasChildren = !isPrimitive && (Array.isArray(obj[key]) || Object.keys(obj[key]).length > 0);
                    const isChildCollapsed = collapsedPaths.has(variablePath);
                    
                    return (
                        <div key={key}>
                            <div 
                                className="text-xs p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded flex items-start gap-1"
                            >
                                {hasChildren && (
                                    <span 
                                        className="text-gray-500 dark:text-gray-400 cursor-pointer"
                                        onClick={() => toggleCollapse(variablePath)}
                                    >
                                        {isChildCollapsed ? '▶' : '▼'}
                                    </span>
                                )}
                                <div
                                    className="flex-1 cursor-move"
                                    draggable="true"
                                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `{{${variablePath}}}`)}
                                    title={`Drag {{${variablePath}}}`}
                                >
                                    <span className="text-blue-600 dark:text-blue-400 font-medium">{key}:</span>{' '}
                                    {isPrimitive && (
                                        <span className="text-gray-700 dark:text-gray-300">
                                            {typeof obj[key] === 'string' 
                                                ? `"${obj[key].substring(0, 50)}${obj[key].length > 50 ? '...' : ''}"`
                                                : String(obj[key])}
                                        </span>
                                    )}
                                    {!isPrimitive && (
                                        <span className="text-gray-500 dark:text-gray-400">
                                            {Array.isArray(obj[key]) ? `[${obj[key].length}]` : `{${Object.keys(obj[key]).length}}`}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {hasChildren && !isChildCollapsed && (
                                <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                                    {renderDraggableData(obj[key], variablePath, depth + 1)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Modal for expanded view
    if (isExpanded) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {label || 'Edit Content'}
                        </h3>
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content - 3 columns */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left: INPUT panel */}
                        <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h4 className="font-semibold text-gray-900 dark:text-white text-sm">INPUT</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Kéo thả variables vào editor
                                </p>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto">
                                {renderInputPanel()}
                            </div>
                        </div>

                        {/* Center: Expression */}
                        <div className="w-2/4 border-r border-gray-200 dark:border-gray-700 flex flex-col p-6 overflow-auto">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Expression
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 font-normal">
                                    (Variables in <span className="text-green-500 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/20 px-1 rounded">green</span>)
                                </span>
                            </label>
                            <div className="flex-1">
                                <div className="relative">
                                    <textarea
                                        ref={textareaRef}
                                        value={value || ''}
                                        onChange={(e) => {
                                            if (onChange) {
                                                onChange(e.target.value);
                                            }
                                        }}
                                        onDrop={handleDrop}
                                        onDragOver={handleDragOver}
                                        onSelect={(e) => setCursorPosition(e.target.selectionStart)}
                                        onClick={(e) => setCursorPosition(e.target.selectionStart)}
                                        onKeyUp={(e) => setCursorPosition(e.target.selectionStart)}
                                        placeholder={placeholder}
                                        rows={20}
                                        disabled={disabled}
                                        className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm resize-none ${className}`}
                                        style={{ 
                                            minHeight: '500px',
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    />
                                </div>
                                {/* Show syntax preview below textarea */}
                                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md font-mono text-xs whitespace-pre-wrap break-words">
                                    {renderHighlightedText(value, 'template')}
                                </div>
                            </div>
                        </div>

                        {/* Right: Result */}
                        <div className="w-1/4 flex flex-col p-6 overflow-auto">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Result
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 font-normal">
                                    (Resolved values in <span className="text-green-500 dark:text-green-400 font-semibold">green</span>)
                                </span>
                            </label>
                            <div className="flex-1 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md font-mono text-sm whitespace-pre-wrap break-words overflow-y-auto">
                                {renderHighlightedText(value, 'resolved')}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end">
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            {label && (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {label}
                </label>
            )}
            {textareaComponent}
            {hint && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {hint}
                </p>
            )}
        </div>
    );
}

export default ExpandableTextarea;


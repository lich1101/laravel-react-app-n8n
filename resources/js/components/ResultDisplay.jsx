import React, { useState } from 'react';

/**
 * Result Display với syntax highlighting cho resolved variables
 * Giống như n8n - highlight các giá trị resolved từ variables màu xanh
 */
function ResultDisplay({ data, title = 'OUTPUT', showRaw = false }) {
    const [viewMode, setViewMode] = useState('formatted'); // 'formatted' or 'json'

    // Detect if a value looks like it came from a variable resolution
    // (có thể cải thiện logic này based on metadata từ backend)
    const isLikelyResolvedVariable = (value, key) => {
        // Heuristic: values that are strings and not too long might be from variables
        if (typeof value === 'string') {
            // Skip very short or very long strings
            if (value.length > 5 && value.length < 200) {
                return true;
            }
        }
        return false;
    };

    // Render value with potential highlighting
    const renderValue = (value, key = '', depth = 0) => {
        // Null/undefined
        if (value === null || value === undefined) {
            return (
                <span className="text-gray-500 italic">
                    {value === null ? 'null' : 'undefined'}
                </span>
            );
        }

        // Boolean
        if (typeof value === 'boolean') {
            return (
                <span className="text-purple-600 font-semibold">
                    {value.toString()}
                </span>
            );
        }

        // Number
        if (typeof value === 'number') {
            return (
                <span className="text-orange-600 font-semibold">
                    {value}
                </span>
            );
        }

        // String - potentially highlight if looks like resolved variable
        if (typeof value === 'string') {
            const shouldHighlight = isLikelyResolvedVariable(value, key);
            
            return (
                <span className={shouldHighlight ? 'text-primary font-semibold' : 'text-secondary'}>
                    "{value}"
                </span>
            );
        }

        // Array
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return <span className="text-gray-500">[]</span>;
            }
            
            return (
                <div className="ml-4">
                    <span className="text-gray-600">[</span>
                    {value.map((item, index) => (
                        <div key={index} className="ml-4">
                            <span className="text-gray-500 mr-2">{index}:</span>
                            {renderValue(item, `${key}[${index}]`, depth + 1)}
                            {index < value.length - 1 && <span className="text-gray-600">,</span>}
                        </div>
                    ))}
                    <span className="text-gray-600">]</span>
                </div>
            );
        }

        // Object
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (keys.length === 0) {
                return <span className="text-gray-500">{'{}'}</span>;
            }

            return (
                <div className="ml-4">
                    <span className="text-gray-600">{'{'}</span>
                    {keys.map((k, index) => (
                        <div key={k} className="ml-4">
                            <span className="text-blue-700 font-medium">{k}</span>
                            <span className="text-gray-600">: </span>
                            {renderValue(value[k], k, depth + 1)}
                            {index < keys.length - 1 && <span className="text-gray-600">,</span>}
                        </div>
                    ))}
                    <span className="text-gray-600">{'}'}</span>
                </div>
            );
        }

        return <span>{String(value)}</span>;
    };

    // Render as formatted with highlighting
    const renderFormatted = () => {
        if (!data) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-center">No data available</p>
                    <p className="text-xs text-center mt-1">Execute the node to see results</p>
                </div>
            );
        }

        return (
            <div className="font-mono text-sm whitespace-pre-wrap break-words">
                {renderValue(data)}
            </div>
        );
    };

    // Render as raw JSON
    const renderJSON = () => {
        if (!data) {
            return (
                <div className="text-gray-500 text-center py-8">
                    No data
                </div>
            );
        }

        return (
            <pre className="text-xs whitespace-pre-wrap break-words">
                {JSON.stringify(data, null, 2)}
            </pre>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header with view mode toggle */}
            <div className="bg-surface-muted px-4 py-3 border-b border-subtle flex items-center justify-between">
                <h3 className="font-semibold text-primary">{title}</h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode('formatted')}
                        className={`px-3 py-1 text-xs rounded ${
                            viewMode === 'formatted'
                                ? 'bg-primary-soft text-primary shadow-card'
                                : 'bg-surface-muted text-muted hover:bg-surface-strong'
                        }`}
                    >
                        Formatted
                    </button>
                    <button
                        onClick={() => setViewMode('json')}
                        className={`px-3 py-1 text-xs rounded ${
                            viewMode === 'json'
                                ? 'bg-primary-soft text-primary shadow-card'
                                : 'bg-surface-muted text-muted hover:bg-surface-strong'
                        }`}
                    >
                        JSON
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 overflow-y-auto bg-surface-elevated">
                {viewMode === 'formatted' ? renderFormatted() : renderJSON()}
            </div>

            {/* Legend */}
            {data && viewMode === 'formatted' && (
                <div className="border-t border-subtle px-4 py-2 bg-surface-muted">
                    <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted">Legend:</span>
                        <span className="text-primary font-semibold">Resolved Variables</span>
                        <span className="text-orange-600 font-semibold">Numbers</span>
                        <span className="text-purple-600 font-semibold">Booleans</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ResultDisplay;


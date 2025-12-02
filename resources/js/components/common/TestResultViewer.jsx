import React from 'react';
import JSONViewer from './JSONViewer';

/**
 * Component để hiển thị test results với view mode switching (schema/json)
 * @param {Object} props
 * @param {Object} props.data - Data to display (inputData or outputData)
 * @param {string} props.viewMode - Current view mode ('schema' or 'json')
 * @param {Function} props.onViewModeChange - Handler to change view mode
 * @param {Set} props.collapsedPaths - Set of collapsed paths
 * @param {Function} props.onToggleCollapse - Handler to toggle collapse
 * @param {string} props.title - Panel title
 * @param {boolean} props.showViewModeToggle - Whether to show view mode toggle buttons
 * @param {ReactNode} props.emptyState - Custom empty state component
 * @param {boolean} props.isTesting - Whether test is currently running
 * @param {string} props.testingMessage - Message to show while testing
 */
export default function TestResultViewer({
    data,
    viewMode = 'schema',
    onViewModeChange,
    collapsedPaths = new Set(),
    onToggleCollapse,
    title = 'Data',
    showViewModeToggle = true,
    emptyState,
    className = '',
    isTesting = false,
    testingMessage = 'Đang xử lý...'
}) {
    const renderContent = () => {
        if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
            return emptyState || (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    <p className="text-center text-sm">No data available</p>
                </div>
            );
        }

        if (viewMode === 'json') {
            // Handle multiple input sources (nodeName -> data mapping)
            // This is common for inputData format: { "nodeName": { ...data } }
            if (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
                const firstKey = Object.keys(data)[0];
                // Check if it's a mapping of node names to data (like inputData)
                if (typeof data[firstKey] === 'object' && !Array.isArray(data[firstKey])) {
                    return (
                        <div className="space-y-4">
                            {Object.entries(data).map(([nodeName, nodeData]) => (
                                <div key={nodeName}>
                                    <div className="text-xs font-semibold text-gray-700 mb-2">
                                        {nodeName}:
                                    </div>
                                    <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-auto whitespace-pre-wrap text-gray-800 max-h-96">
                                        {JSON.stringify(nodeData, null, 2)}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    );
                }
            }

            return (
                <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-auto whitespace-pre-wrap text-gray-800 max-h-full">
                    {JSON.stringify(data, null, 2)}
                </pre>
            );
        }

        // Schema view - handle inputData format with node names
        if (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
            const firstKey = Object.keys(data)[0];
            // If it looks like inputData format (nodeName -> data mapping)
            if (typeof data[firstKey] === 'object' && !Array.isArray(data[firstKey])) {
                return (
                    <div className="space-y-4 min-w-0">
                        {Object.entries(data).map(([nodeName, nodeData]) => (
                            <div key={nodeName} className="min-w-0">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 min-w-0">
                                    <span className="text-xs font-semibold text-gray-700 truncate min-w-0" title={nodeName}>
                                        {nodeName}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded flex-shrink-0">
                                        {Object.keys(nodeData || {}).length} fields
                                    </span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200 min-w-0 overflow-hidden">
                                    <JSONViewer
                                        data={nodeData}
                                        prefix={nodeName}
                                        collapsedPaths={collapsedPaths}
                                        onToggleCollapse={onToggleCollapse}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                );
            }
        }

        // Single data object schema view
        return (
            <div className="bg-white p-3 rounded-lg border border-gray-200 min-w-0 overflow-hidden">
                <JSONViewer
                    data={data}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={onToggleCollapse}
                />
            </div>
        );
    };

    return (
        <div className={`flex flex-col ${className}`}>
            {showViewModeToggle && data && (
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{title}</h3>
                        <div className="flex space-x-1">
                            <button
                                onClick={() => onViewModeChange?.('schema')}
                                className={`text-xs px-2 py-1 rounded ${
                                    viewMode === 'schema'
                                        ? 'bg-primary-soft text-primary shadow-card'
                                        : 'text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                Schema
                            </button>
                            <button
                                onClick={() => onViewModeChange?.('json')}
                                className={`text-xs px-2 py-1 rounded ${
                                    viewMode === 'json'
                                        ? 'bg-primary-soft text-primary shadow-card'
                                        : 'text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                JSON
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex-1 p-4 overflow-y-auto">
                {isTesting ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                        <p className="text-center">{testingMessage}</p>
                    </div>
                ) : (
                    renderContent()
                )}
            </div>
        </div>
    );
}


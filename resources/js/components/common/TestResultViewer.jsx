import React, { useMemo } from 'react';
import JSONViewer from './JSONViewer';

/**
 * Component để hiển thị test results với view mode switching (schema/json/preview)
 * @param {Object} props
 * @param {Object} props.data - Data to display (inputData or outputData)
 * @param {string} props.viewMode - Current view mode ('schema', 'json', or 'preview')
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
    // Detect if data contains base64/dataUri for preview
    const previewData = useMemo(() => {
        if (!data || typeof data !== 'object') return null;
        
        // Check if it's a direct object with base64/dataUri
        if (data.dataUri || data.base64) {
            return {
                dataUri: data.dataUri,
                base64: data.base64,
                mimeType: data.mimeType || 'application/octet-stream',
                source: data.source,
                size: data.size
            };
        }
        
        // Check nested objects (e.g., node outputs)
        const firstKey = Object.keys(data)[0];
        if (firstKey && typeof data[firstKey] === 'object') {
            const nestedData = data[firstKey];
            if (nestedData.dataUri || nestedData.base64) {
                return {
                    dataUri: nestedData.dataUri,
                    base64: nestedData.base64,
                    mimeType: nestedData.mimeType || 'application/octet-stream',
                    source: nestedData.source,
                    size: nestedData.size
                };
            }
        }
        
        return null;
    }, [data]);

    const hasPreview = !!previewData;

    const renderPreview = () => {
        if (!previewData) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <p className="text-center text-sm">No preview available</p>
                </div>
            );
        }

        const { dataUri, base64, mimeType, source, size } = previewData;
        const previewSrc = dataUri || (base64 ? `data:${mimeType};base64,${base64}` : null);

        if (!previewSrc) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <p className="text-center text-sm">Cannot generate preview</p>
                </div>
            );
        }

        // Render based on MIME type
        const renderByMimeType = () => {
            // Images
            if (mimeType.startsWith('image/')) {
                return (
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <img 
                            src={previewSrc} 
                            alt="Preview" 
                            className="max-w-full max-h-[500px] object-contain rounded shadow-lg"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextElementSibling.style.display = 'block';
                            }}
                        />
                        <div style={{ display: 'none' }} className="text-red-500 text-sm">
                            Failed to load image
                        </div>
                    </div>
                );
            }
            
            // Videos
            if (mimeType.startsWith('video/')) {
                return (
                    <div className="flex flex-col items-center justify-center">
                        <video 
                            controls 
                            className="max-w-full max-h-[500px] rounded shadow-lg"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextElementSibling.style.display = 'block';
                            }}
                        >
                            <source src={previewSrc} type={mimeType} />
                            Your browser does not support the video tag.
                        </video>
                        <div style={{ display: 'none' }} className="text-red-500 text-sm mt-2">
                            Failed to load video
                        </div>
                    </div>
                );
            }
            
            // Audio
            if (mimeType.startsWith('audio/')) {
                return (
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-full max-w-md">
                            <audio 
                                controls 
                                className="w-full"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextElementSibling.style.display = 'block';
                                }}
                            >
                                <source src={previewSrc} type={mimeType} />
                                Your browser does not support the audio element.
                            </audio>
                            <div style={{ display: 'none' }} className="text-red-500 text-sm mt-2">
                                Failed to load audio
                            </div>
                        </div>
                    </div>
                );
            }
            
            // PDF
            if (mimeType === 'application/pdf') {
                return (
                    <div className="w-full h-[600px]">
                        <iframe 
                            src={previewSrc}
                            className="w-full h-full border rounded"
                            title="PDF Preview"
                        />
                    </div>
                );
            }
            
            // Text-based files
            if (mimeType.startsWith('text/') || mimeType === 'application/json') {
                // Decode base64 to text
                try {
                    const text = base64 ? atob(base64.replace(/^data:.*?;base64,/, '')) : '';
                    return (
                        <div className="w-full">
                            <pre className="text-xs bg-gray-50 p-4 rounded border border-gray-200 overflow-auto whitespace-pre-wrap text-gray-800 max-h-[600px]">
                                {text}
                            </pre>
                        </div>
                    );
                } catch (error) {
                    return (
                        <div className="text-red-500 text-sm">
                            Failed to decode text content
                        </div>
                    );
                }
            }
            
            // Unsupported type
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-center text-sm">Preview not available for this file type</p>
                    <p className="text-center text-xs text-gray-400 mt-1">{mimeType}</p>
                </div>
            );
        };

        return (
            <div className="space-y-4">
                {/* File info */}
                <div className="bg-gray-50 p-3 rounded border border-gray-200 text-xs space-y-1">
                    <div><strong>MIME Type:</strong> {mimeType}</div>
                    {size && <div><strong>Size:</strong> {(size / 1024).toFixed(2)} KB</div>}
                    {source && (
                        <div className="flex items-start">
                            <strong className="mr-2">Source:</strong> 
                            <span className="break-all">{source}</span>
                        </div>
                    )}
                </div>
                
                {/* Preview content */}
                <div className="flex items-center justify-center min-h-[200px]">
                    {renderByMimeType()}
                </div>
            </div>
        );
    };

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

        // Preview mode
        if (viewMode === 'preview') {
            return renderPreview();
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
        <div className={`flex flex-col h-full ${className}`}>
            {showViewModeToggle && data && (
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex-shrink-0">
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
                            {hasPreview && (
                                <button
                                    onClick={() => onViewModeChange?.('preview')}
                                    className={`text-xs px-2 py-1 rounded ${
                                        viewMode === 'preview'
                                            ? 'bg-primary-soft text-primary shadow-card'
                                            : 'text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Preview
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <div className="flex-1 p-4 overflow-y-auto min-h-0">
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


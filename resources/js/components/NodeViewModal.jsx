import React from 'react';

const NodeViewModal = ({ node, onClose, inputData, outputData }) => {
    if (!node) return null;

    const config = node.data?.config || {};
    const nodeType = node.type;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-11/12 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {nodeType === 'webhook' ? 'Webhook Configuration' :
                         nodeType === 'http' ? 'HTTP Request Configuration' :
                         'Code Configuration'} - View Only
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto flex flex-col">
                    {/* Configuration */}
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Configuration</h3>
                        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-4 rounded-lg">
                            {nodeType === 'webhook' && (
                                <div className="space-y-2 text-sm">
                                    <div className="text-gray-900 dark:text-gray-100"><strong className="text-gray-700 dark:text-gray-300">Path:</strong> <span className="text-gray-800 dark:text-gray-200">{config.path || 'N/A'}</span></div>
                                    <div className="text-gray-900 dark:text-gray-100"><strong className="text-gray-700 dark:text-gray-300">Method:</strong> <span className="text-gray-800 dark:text-gray-200">{config.method || 'N/A'}</span></div>
                                    <div className="text-gray-900 dark:text-gray-100"><strong className="text-gray-700 dark:text-gray-300">Auth:</strong> <span className="text-gray-800 dark:text-gray-200">{config.auth || 'None'}</span></div>
                                    <div className="text-gray-900 dark:text-gray-100"><strong className="text-gray-700 dark:text-gray-300">Respond:</strong> <span className="text-gray-800 dark:text-gray-200">{config.respond || 'N/A'}</span></div>
                                </div>
                            )}
                            {nodeType === 'http' && (
                                <div className="space-y-2 text-sm">
                                    <div className="text-gray-900 dark:text-gray-100"><strong className="text-gray-700 dark:text-gray-300">URL:</strong> <span className="text-gray-800 dark:text-gray-200">{config.url || 'N/A'}</span></div>
                                    <div className="text-gray-900 dark:text-gray-100"><strong className="text-gray-700 dark:text-gray-300">Method:</strong> <span className="text-gray-800 dark:text-gray-200">{config.method || 'N/A'}</span></div>
                                    <div className="text-gray-900 dark:text-gray-100"><strong className="text-gray-700 dark:text-gray-300">Auth:</strong> <span className="text-gray-800 dark:text-gray-200">{config.auth || 'None'}</span></div>
                                    {config.headers && config.headers.length > 0 && (
                                        <div className="text-gray-900 dark:text-gray-100">
                                            <strong className="text-gray-700 dark:text-gray-300">Headers:</strong>
                                            <pre className="mt-1 text-xs bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-2 rounded border border-gray-200 dark:border-gray-700">{JSON.stringify(config.headers, null, 2)}</pre>
                                        </div>
                                    )}
                                    {config.queryParams && config.queryParams.length > 0 && (
                                        <div className="text-gray-900 dark:text-gray-100">
                                            <strong className="text-gray-700 dark:text-gray-300">Query Parameters:</strong>
                                            <pre className="mt-1 text-xs bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-2 rounded border border-gray-200 dark:border-gray-700">{JSON.stringify(config.queryParams, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Input and Output Side by Side */}
                    <div className="flex-1 flex">
                        {/* Input Data - Left */}
                        <div className="flex-1 p-6 border-r border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Input</h3>
                            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg h-full flex flex-col">
                                {inputData && Array.isArray(inputData) && inputData.length > 0 ? (
                                    <div className="flex-1 overflow-y-auto p-4">
                                        {inputData.map((input, index) => (
                                            <div key={index} className="mb-4 last:mb-0">
                                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Input #{index}:</div>
                                                <pre className="text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded overflow-x-auto border border-gray-200 dark:border-gray-700">
                                                    {JSON.stringify(input, null, 2)}
                                                </pre>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-sm text-gray-500">No input data available</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Output Data - Right */}
                        <div className="flex-1 p-6">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Output</h3>
                            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg h-full flex flex-col">
                                {outputData && Object.keys(outputData).length > 0 ? (
                                    <div className="flex-1 overflow-y-auto p-4">
                                        <pre className="text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded overflow-x-auto border border-gray-200 dark:border-gray-700">
                                            {JSON.stringify(outputData, null, 2)}
                                        </pre>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-sm text-gray-500">No output data available</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NodeViewModal;

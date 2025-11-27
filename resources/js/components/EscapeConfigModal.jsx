import React, { useState, useEffect } from 'react';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function EscapeConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        fields: [
            { name: '', value: '' }
        ],
    });

    // Sử dụng custom hook cho logic chung
    const {
        isTesting,
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput,
        setInputViewMode,
        setOutputViewMode,
        handleSave,
        handleClose,
        handleTest,
        handleStopTest,
        togglePathCollapse,
    } = useConfigModal({
        onTest,
        onSave: () => onSave(config),
        onClose,
        onTestResult,
        node,
        config,
        inputData,
        outputData,
        readOnly
    });

    useEffect(() => {
        if (node?.data?.config) {
            setConfig({ ...config, ...node.data.config });
        }
    }, [node]);

    // Add new field
    const addField = () => {
        setConfig({
            ...config,
            fields: [...config.fields, { name: '', value: '' }]
        });
    };

    // Update field
    const updateField = (index, key, value) => {
        const newFields = [...config.fields];
        newFields[index][key] = value;
        setConfig({ ...config, fields: newFields });
    };

    // Remove field
    const removeField = (index) => {
        const newFields = config.fields.filter((_, i) => i !== index);
        // Always keep at least one field
        if (newFields.length === 0) {
            newFields.push({ name: '', value: '' });
        }
        setConfig({ ...config, fields: newFields });
    };

    // Test buttons
    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Stop step
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={config.fields.every(f => !f.name || !f.value)}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                    Test step
                </button>
            )}
        </>
    ) : null;

    return (
        <ConfigModalLayout
            node={node}
            onRename={onRename}
            onClose={handleClose}
            title="Escape"
            icon="⚡"
            readOnly={readOnly}
            isTesting={false}
            testButtons={testButtons}
        >
            {/* Left Panel - INPUT */}
            <div className="w-1/3 border-r border-gray-200 flex flex-col">
                <TestResultViewer
                    data={inputData}
                    viewMode={inputViewMode}
                    onViewModeChange={setInputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="INPUT"
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            <p className="text-center text-sm">
                                Connect this node to receive input data
                            </p>
                            <p className="text-center text-xs mt-2">
                                Kéo thả fields vào Value để escape
                            </p>
                        </div>
                    }
                />
            </div>

                    {/* Center Panel - Fields Configuration */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <button className="px-4 py-1.5 bg-yellow-600 text-white rounded text-sm font-medium">
                                Fields to Escape & Set
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            <div className="text-sm text-gray-700 mb-4">
                                <p className="font-medium mb-2">💡 Escape Rules:</p>
                                <div className="text-xs bg-gray-100 p-2 rounded space-y-1">
                                    <p>• Backslash → \\\\</p>
                                    <p>• Quotes → \\"</p>
                                    <p>• Newline → \\n</p>
                                    <p>• Tab → \\t</p>
                                    <p>• Multiple spaces → single space</p>
                                    <p>• Trim whitespace</p>
                                </div>
                            </div>

                            {/* Fields List */}
                            <div className="space-y-3">
                                {config.fields.map((field, index) => (
                                    <div key={index} className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-semibold text-gray-700">
                                                Field {index + 1}
                                            </span>
                                            {config.fields.length > 1 && !readOnly && (
                                                <button
                                                    onClick={() => removeField(index)}
                                                    className="text-red-600 hover:text-red-700"
                                                    title="Remove field"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        
                                        {/* Field Name */}
                                        <div className="mb-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                Output Field Name
                                            </label>
                                            <ExpandableTextarea
                                                value={field.name}
                                                onChange={(newValue) => updateField(index, 'name', newValue)}
                                                placeholder="e.g., body.content or systemMessage"
                                                rows={1}
                                                inputData={inputData}
                                                disabled={readOnly}
                                            />
                                            <p className="mt-1 text-xs text-gray-500">
                                                Tên field trong output (support nested: a.b.c)
                                            </p>
                                        </div>

                                        {/* Field Value */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                Value (will be escaped)
                                            </label>
                                            <ExpandableTextarea
                                                value={field.value}
                                                onChange={(newValue) => updateField(index, 'value', newValue)}
                                                placeholder="Drag variables or type content"
                                                rows={4}
                                                inputData={inputData}
                                                disabled={readOnly}
                                            />
                                            <p className="mt-1 text-xs text-gray-500">
                                                💡 Dùng {`{{variable}}`} hoặc kéo thả từ INPUT
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add Field Button */}
                            {!readOnly && (
                                <button
                                    onClick={addField}
                                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-yellow-500 hover:text-yellow-600 transition-colors"
                                >
                                    + Add Field
                                </button>
                            )}
                        </div>
                    </div>

            {/* Right Panel - OUTPUT */}
            <div className="w-1/3 flex flex-col">
                <TestResultViewer
                    data={displayOutput}
                    viewMode={outputViewMode}
                    onViewModeChange={setOutputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="OUTPUT"
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-center">
                                Click "Test step" để xem output sau khi escape
                            </p>
                        </div>
                    }
                />
            </div>
        </ConfigModalLayout>
    );
}

export default EscapeConfigModal;


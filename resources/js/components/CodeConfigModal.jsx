import React, { useState, useEffect } from 'react';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function CodeConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [config, setConfig] = useState({
        language: 'javascript',
        code: `// Access input data from previous nodes
const item = $input.first();    // Get first input
const allItems = $input.all();  // Get all inputs as array
// const item2 = $input.item(1);  // Get specific input by index

// You can access fields directly
// Example: item.choices[0].message.content

// Process your data
const result = {
  message: 'Hello from Code node',
  processedData: item,
  totalInputs: allItems.length
};

// Must return output for next nodes
return result;`,
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

    // Test buttons
    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="btn text-sm px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                >
                    Stop step
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={!config.code}
                    className="btn text-sm px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white disabled:bg-surface-muted disabled:text-muted disabled:cursor-not-allowed transition-colors"
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
            title="Code"
            icon="💻"
            readOnly={readOnly}
            isTesting={false}
            testButtons={testButtons}
        >
            {/* Left Panel - INPUT */}
            <div className="w-1/3 border-r border-subtle flex flex-col bg-surface">
                <TestResultViewer
                    data={inputData}
                    viewMode={inputViewMode}
                    onViewModeChange={setInputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="INPUT"
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-muted">
                            <svg className="w-16 h-16 mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            <p className="text-center text-sm">
                                Connect this node to receive input data
                            </p>
                            <p className="text-center text-xs mt-2 text-muted">
                                Access via $input.first() hoặc $input.all()
                            </p>
                        </div>
                    }
                />
            </div>

                    {/* Center Panel - Code Editor */}
                    <div className="w-1/3 flex flex-col bg-surface">
                        <div className="bg-surface-muted px-4 py-3 border-b border-subtle">
                            <button className="btn text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-card transition-colors">
                                JavaScript Code
                            </button>
                        </div>
                        <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
                            {/* Language Selector */}
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    Language
                                </label>
                                <select
                                    value={config.language}
                                    onChange={(e) => setConfig({ ...config, language: e.target.value })}
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-subtle rounded-lg bg-surface text-primary shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="javascript">JavaScript</option>
                                </select>
                            </div>

                            {/* Code Editor */}
                            <div className="flex-1 flex flex-col">
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    JavaScript Code *
                                </label>
                                <textarea
                                    value={config.code}
                                    onChange={(e) => setConfig({ ...config, code: e.target.value })}
                                    placeholder="// Write your JavaScript code here..."
                                    disabled={readOnly}
                                    className="flex-1 px-3 py-3 border border-subtle rounded-xl bg-surface text-secondary font-mono text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ minHeight: '400px', fontFamily: 'Monaco, Menlo, monospace' }}
                                />
                            </div>

                            {/* Help Text */}
                            <div className="text-xs text-muted space-y-3">
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 space-y-2 text-secondary">
                                    <p><strong>💡 Input Helper:</strong></p>
                                    <p>• <code className="bg-surface-muted px-1 rounded">$input.first()</code> - Lấy input đầu tiên</p>
                                    <p>• <code className="bg-surface-muted px-1 rounded">$input.all()</code> - Lấy tất cả inputs (array)</p>
                                    <p>• <code className="bg-surface-muted px-1 rounded">$input.item(0)</code> - Lấy input theo index</p>
                                </div>
                                
                                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 space-y-2 text-secondary">
                                    <p><strong>✅ Example:</strong></p>
                                    <pre className="bg-surface text-secondary border border-subtle rounded-lg p-3 text-xs overflow-x-auto shadow-inner">
{`const item = $input.first();
const text = item.choices[0].message.content;

return {
  processedText: text.toUpperCase(),
  length: text.length
};`}
                                    </pre>
                                </div>
                                
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-secondary">
                                    <p><strong>⚠️ Lưu ý:</strong></p>
                                    <p>• Code chạy trên <strong>Node.js v18</strong></p>
                                    <p>• Phải có <code className="bg-surface-muted px-1 rounded">return</code> để trả output</p>
                                    <p>• Support async/await</p>
                                </div>
                            </div>
                        </div>
                    </div>

            {/* Right Panel - OUTPUT */}
            <div className="w-1/3 flex flex-col bg-surface">
                <TestResultViewer
                    data={displayOutput}
                    viewMode={outputViewMode}
                    onViewModeChange={setOutputViewMode}
                    collapsedPaths={collapsedPaths}
                    onToggleCollapse={togglePathCollapse}
                    title="OUTPUT"
                    emptyState={
                        <div className="flex flex-col items-center justify-center h-full text-muted">
                            <svg className="w-16 h-16 mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-center">
                                Click "Test step" để execute code và xem kết quả
                            </p>
                        </div>
                    }
                />
            </div>
        </ConfigModalLayout>
    );
}

export default CodeConfigModal;


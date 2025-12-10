import React, { useState, useEffect, useRef } from 'react';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function ConvertConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const MAX_EXPIRATION_SECONDS = 5 * 24 * 60 * 60; // 5 days

    const [config, setConfig] = useState({
        operation: 'toBase64',
        // To Base64
        source: '',
        // From Base64
        base64Data: '',
        filename: '',
        mimeType: 'image/jpeg',
        expirationValue: 1,
        expirationUnit: 'days',
    });

    const operations = [
        { value: 'toBase64', label: 'File/URL → Base64' },
        { value: 'fromBase64', label: 'Base64 → File/Public URL' },
    ];

    const mimeTypes = [
        { value: 'image/jpeg', label: 'Image - JPEG', ext: 'jpg' },
        { value: 'image/png', label: 'Image - PNG', ext: 'png' },
        { value: 'image/gif', label: 'Image - GIF', ext: 'gif' },
        { value: 'image/webp', label: 'Image - WebP', ext: 'webp' },
        { value: 'video/mp4', label: 'Video - MP4', ext: 'mp4' },
        { value: 'audio/mpeg', label: 'Audio - MP3', ext: 'mp3' },
        { value: 'application/pdf', label: 'Document - PDF', ext: 'pdf' },
        { value: 'text/plain', label: 'Text - TXT', ext: 'txt' },
        { value: 'application/json', label: 'Data - JSON', ext: 'json' },
    ];

    const expirationUnits = [
        { value: 'minutes', label: 'Phút' },
        { value: 'hours', label: 'Giờ' },
        { value: 'days', label: 'Ngày' },
    ];

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const testAbortControllerRef = useRef(null);

    const {
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput,
        setInputViewMode,
        setOutputViewMode,
        togglePathCollapse,
    } = useConfigModal({
        onTest: null,
        onSave: () => onSave(config),
        onClose: () => {
            if (isTesting && testAbortControllerRef.current) {
                handleStopTest();
            }
            onSave(config);
            onClose();
        },
        onTestResult,
        node,
        config,
        inputData,
        outputData: testResults || outputData,
        readOnly
    });

    useEffect(() => {
        if (node?.data?.config) {
            setConfig(prev => ({
                ...prev,
                ...node.data.config,
            }));
        }
    }, [node]);

    const handleTest = async () => {
        setIsTesting(true);
        setTestResults(null);
        testAbortControllerRef.current = new AbortController();

        try {
            const result = await onTest(config);
            setTestResults(result);
            if (onTestResult && node?.id) {
                onTestResult(node.id, result);
            }
        } catch (error) {
            const errorResult = {
                error: true,
                message: error.response?.data?.message || error.message || 'Test failed'
            };
            setTestResults(errorResult);
            if (onTestResult && node?.id) {
                onTestResult(node.id, errorResult);
            }
        } finally {
            setIsTesting(false);
            testAbortControllerRef.current = null;
        }
    };

    const handleStopTest = () => {
        if (testAbortControllerRef.current) {
            testAbortControllerRef.current.abort();
            testAbortControllerRef.current = null;
            setIsTesting(false);
            setTestResults({
                error: true,
                message: 'Test was cancelled by user'
            });
        }
    };

    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>■</span>
                    <span>Stop step</span>
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>▲</span>
                    <span>Test step</span>
                </button>
            )}
        </>
    ) : null;

    const handleClose = () => {
        if (isTesting && testAbortControllerRef.current) {
            handleStopTest();
        }
        onSave(config);
        onClose();
    };

    const currentDisplayOutput = testResults || outputData || displayOutput;

    const convertExpirationToSeconds = (value, unit) => {
        const numericValue = Number(value) || 0;
        switch (unit) {
            case 'minutes':
                return numericValue * 60;
            case 'hours':
                return numericValue * 3600;
            case 'days':
            default:
                return numericValue * 86400;
        }
    };

    const normalizeExpirationValue = (value, unit) => {
        const safeValue = Math.max(1, Number(value) || 1);
        const seconds = convertExpirationToSeconds(safeValue, unit);

        if (seconds > MAX_EXPIRATION_SECONDS) {
            // Clamp to the maximum allowed for the chosen unit
            const maxForUnit = {
                minutes: Math.floor(MAX_EXPIRATION_SECONDS / 60),
                hours: Math.floor(MAX_EXPIRATION_SECONDS / 3600),
                days: Math.floor(MAX_EXPIRATION_SECONDS / 86400),
            }[unit] || Math.floor(MAX_EXPIRATION_SECONDS / 86400);

            return maxForUnit;
        }

        return safeValue;
    };

    const renderConfigForm = () => {
        return (
            <div className="space-y-4">
                {/* Operation Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Operation *
                    </label>
                    <select
                        value={config.operation}
                        onChange={(e) => setConfig({ ...config, operation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                        disabled={readOnly}
                    >
                        {operations.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                    </select>
                </div>

                {/* To Base64 Fields */}
                {config.operation === 'toBase64' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Source (URL or File Path) *
                        </label>
                        <ExpandableTextarea
                            value={config.source}
                            onChange={(value) => setConfig({ ...config, source: value })}
                            placeholder="https://example.com/image.jpg or /path/to/file or use {{NodeName.field}}"
                            disabled={readOnly}
                            inputData={inputData}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            URL hoặc đường dẫn file. Hỗ trợ images, videos, audio, PDF, text, etc.
                        </p>
                    </div>
                )}

                {/* From Base64 Fields */}
                {config.operation === 'fromBase64' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Base64 Data *
                            </label>
                            <ExpandableTextarea
                                value={config.base64Data}
                                onChange={(value) => setConfig({ ...config, base64Data: value })}
                                placeholder="data:image/jpeg;base64,/9j/4AAQ... hoặc chỉ base64 string hoặc {{NodeName.field}}"
                                disabled={readOnly}
                                inputData={inputData}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Data URI (data:mime;base64,...) hoặc pure base64 string
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Filename (without extension)
                                </label>
                                <input
                                    type="text"
                                    value={config.filename}
                                    onChange={(e) => setConfig({ ...config, filename: e.target.value })}
                                    placeholder="my-file"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Để trống sẽ auto-generate
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    MIME Type
                                </label>
                                <select
                                    value={config.mimeType}
                                    onChange={(e) => setConfig({ ...config, mimeType: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                >
                                    {mimeTypes.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    Dùng cho pure base64 string
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Thời gian tồn tại
                                </label>
                                <div className="flex space-x-2">
                                    <input
                                        type="number"
                                        min="1"
                                        value={config.expirationValue}
                                        onChange={(e) => {
                                            const normalizedValue = normalizeExpirationValue(e.target.value, config.expirationUnit);
                                            setConfig({ ...config, expirationValue: normalizedValue });
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        disabled={readOnly}
                                    />
                                    <select
                                        value={config.expirationUnit}
                                        onChange={(e) => {
                                            const unit = e.target.value;
                                            const normalizedValue = normalizeExpirationValue(config.expirationValue, unit);
                                            setConfig({ ...config, expirationUnit: unit, expirationValue: normalizedValue });
                                        }}
                                        className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        disabled={readOnly}
                                    >
                                        {expirationUnits.map(unit => (
                                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Tối đa 5 ngày. Hết hạn file sẽ tự xóa để tránh nặng hệ thống.
                                </p>
                            </div>
                        </div>

                        <div className="text-xs bg-blue-50 border border-blue-200 rounded p-3">
                            <strong>ℹ️ Lưu ý:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-1 text-gray-600">
                                <li>File sẽ được lưu vào <code className="bg-white px-1 rounded">storage/app/public/converts/</code></li>
                                <li>Public URL sẽ dạng: <code className="bg-white px-1 rounded">https://domain.com/storage/converts/filename.ext</code></li>
                                <li>Đảm bảo đã chạy: <code className="bg-white px-1 rounded">php artisan storage:link</code></li>
                            </ul>
                        </div>
                    </>
                )}
            </div>
        );
    };

    return (
        <ConfigModalLayout
            title="Convert"
            iconPath="/icons/nodes/convert.svg"
            node={node}
            onRename={onRename}
            onClose={handleClose}
            readOnly={readOnly}
            isTesting={false}
            testButtons={testButtons}
            size="large"
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
                            <p className="text-center text-sm">Connect this node to receive input data</p>
                            <p className="text-center text-xs mt-2">Kéo thả biến từ đây vào config</p>
                        </div>
                    }
                />
            </div>

            {/* Center Panel - Configuration */}
            <div className="w-1/3 flex flex-col">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                        Parameters
                    </button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto">
                    {renderConfigForm()}
                </div>
            </div>

            {/* Right Panel - OUTPUT */}
            <div className="w-1/3 border-l border-gray-200 flex flex-col">
                <TestResultViewer
                    data={currentDisplayOutput}
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
                            <p className="text-center text-sm">Click 'Test step' to see output</p>
                        </div>
                    }
                />
            </div>
        </ConfigModalLayout>
    );
}

export default ConvertConfigModal;


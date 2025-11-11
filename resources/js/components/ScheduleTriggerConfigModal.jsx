import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import ExpandableTextarea from './ExpandableTextarea';
import ResultDisplay from './ResultDisplay';

const ScheduleTriggerConfigModal = ({ node, onSave, onClose, workflowId, onTestResult, onRename, outputData, readOnly = false }) => {
    const [config, setConfig] = useState({
        triggerType: 'interval', // 'interval' hoặc 'cron'
        interval: 'hours', // 'minutes', 'hours', 'days', 'weeks', 'months'
        intervalValue: 1,
        cronExpression: '0 * * * *',
        triggerAt: {
            minute: 0,
            hour: 0,
            dayOfWeek: '*',
            dayOfMonth: '*',
        },
        timezone: 'Asia/Ho_Chi_Minh',
        ...node?.data?.config,
    });

    const [activeTab, setActiveTab] = useState('schema');

    const handleSave = () => {
        onSave(config);
    };

    const handleClose = () => {
        handleSave();
        onClose();
    };

    const handleTestTrigger = () => {
        // Simulate trigger with current timestamp
        const mockData = {
            triggeredAt: new Date().toISOString(),
            timezone: config.timezone,
            schedule: config.triggerType === 'cron' ? config.cronExpression : `Every ${config.intervalValue} ${config.interval}`,
        };

        if (onTestResult && node?.id) {
            onTestResult(node.id, mockData);
        }
    };

    // Get current display output
    const getDisplayOutput = () => {
        if (outputData) return outputData;
        return null;
    };

    const intervalOptions = [
        { value: 'minutes', label: 'Minutes', min: 1, max: 59 },
        { value: 'hours', label: 'Hours', min: 1, max: 23 },
        { value: 'days', label: 'Days', min: 1, max: 31 },
        { value: 'weeks', label: 'Weeks', min: 1, max: 52 },
        { value: 'months', label: 'Months', min: 1, max: 12 },
    ];

    const currentIntervalOption = intervalOptions.find(opt => opt.value === config.interval) || intervalOptions[1];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">⏰</span>
                        <h2 
                            className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (onRename) {
                                    onRename();
                                }
                            }}
                            title="Click để đổi tên node"
                        >
                            {node?.data?.customName || 'Schedule Trigger'}
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel - Configuration */}
                    <div className="w-2/3 border-r border-gray-200 flex flex-col p-6 overflow-y-auto">
                        <div className="space-y-6">
                            {/* Info Box */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    <strong>ℹ️ Lưu ý:</strong> Workflow sẽ tự động chạy theo lịch trình bạn định nghĩa sau khi <strong>Activate</strong> workflow.
                                    Schedule Trigger là node khởi đầu, giống Webhook nhưng tự kích hoạt theo thời gian.
                                </p>
                            </div>

                            {/* Trigger Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Schedule Type *
                                </label>
                                <select
                                    value={config.triggerType}
                                    onChange={(e) => setConfig({ ...config, triggerType: e.target.value })}
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                >
                                    <option value="interval">Simple Interval (Mỗi X phút/giờ/ngày...)</option>
                                    <option value="cron">Cron Expression (Lịch trình phức tạp)</option>
                                </select>
                            </div>

                            {/* Interval Configuration */}
                            {config.triggerType === 'interval' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Trigger Interval *
                                        </label>
                                        <select
                                            value={config.interval}
                                            onChange={(e) => setConfig({ ...config, interval: e.target.value, intervalValue: 1 })}
                                            disabled={readOnly}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                        >
                                            <option value="minutes">Minutes (Phút)</option>
                                            <option value="hours">Hours (Giờ)</option>
                                            <option value="days">Days (Ngày)</option>
                                            <option value="weeks">Weeks (Tuần)</option>
                                            <option value="months">Months (Tháng)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {config.interval === 'minutes' && 'Mỗi bao nhiêu phút? *'}
                                            {config.interval === 'hours' && 'Mỗi bao nhiêu giờ? *'}
                                            {config.interval === 'days' && 'Mỗi bao nhiêu ngày? *'}
                                            {config.interval === 'weeks' && 'Mỗi bao nhiêu tuần? *'}
                                            {config.interval === 'months' && 'Mỗi bao nhiêu tháng? *'}
                                        </label>
                                        <ExpandableTextarea
                                            value={config.intervalValue !== undefined ? String(config.intervalValue) : '1'}
                                            onChange={(newValue) => {
                                                const parsed = parseInt(newValue, 10);
                                                let clamped = Number.isNaN(parsed) ? currentIntervalOption.min : parsed;
                                                clamped = Math.max(currentIntervalOption.min, Math.min(currentIntervalOption.max, clamped));
                                                setConfig({ ...config, intervalValue: clamped });
                                            }}
                                            disabled={readOnly}
                                            rows={1}
                                        />
                                        <p className="mt-1 text-xs text-gray-500">
                                            Min: {currentIntervalOption.min}, Max: {currentIntervalOption.max}
                                        </p>
                                    </div>

                                    {/* Specific Time Settings for Days/Weeks/Months */}
                                    {['days', 'weeks', 'months'].includes(config.interval) && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Trigger at Hour (0-23)
                                                </label>
                                                <ExpandableTextarea
                                                    value={config.triggerAt.hour !== undefined ? String(config.triggerAt.hour) : '0'}
                                                    onChange={(newValue) => {
                                                        const parsed = parseInt(newValue, 10);
                                                        const clamped = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(23, parsed));
                                                        setConfig({
                                                            ...config,
                                                            triggerAt: { ...config.triggerAt, hour: clamped }
                                                        });
                                                    }}
                                                    disabled={readOnly}
                                                    rows={1}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Trigger at Minute (0-59)
                                                </label>
                                                <ExpandableTextarea
                                                    value={config.triggerAt.minute !== undefined ? String(config.triggerAt.minute) : '0'}
                                                    onChange={(newValue) => {
                                                        const parsed = parseInt(newValue, 10);
                                                        const clamped = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(59, parsed));
                                                        setConfig({
                                                            ...config,
                                                            triggerAt: { ...config.triggerAt, minute: clamped }
                                                        });
                                                    }}
                                                    disabled={readOnly}
                                                    rows={1}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Preview */}
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <p className="text-sm font-semibold text-green-800 mb-2">
                                            📅 Schedule Preview:
                                        </p>
                                        <p className="text-sm text-green-700">
                                            {config.interval === 'minutes' && `Chạy mỗi ${config.intervalValue} phút`}
                                            {config.interval === 'hours' && `Chạy mỗi ${config.intervalValue} giờ`}
                                            {config.interval === 'days' && `Chạy mỗi ${config.intervalValue} ngày lúc ${String(config.triggerAt.hour).padStart(2, '0')}:${String(config.triggerAt.minute).padStart(2, '0')}`}
                                            {config.interval === 'weeks' && `Chạy mỗi ${config.intervalValue} tuần lúc ${String(config.triggerAt.hour).padStart(2, '0')}:${String(config.triggerAt.minute).padStart(2, '0')}`}
                                            {config.interval === 'months' && `Chạy mỗi ${config.intervalValue} tháng lúc ${String(config.triggerAt.hour).padStart(2, '0')}:${String(config.triggerAt.minute).padStart(2, '0')}`}
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* Cron Configuration */}
                            {config.triggerType === 'cron' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Cron Expression *
                                        </label>
                                        <ExpandableTextarea
                                            value={config.cronExpression || ''}
                                            onChange={(newValue) => setConfig({ ...config, cronExpression: newValue })}
                                            disabled={readOnly}
                                            rows={1}
                                            placeholder="0 * * * *"
                                            className="font-mono"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">
                                            Format: minute hour day month weekday
                                        </p>
                                    </div>

                                    {/* Cron Helper */}
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                        <p className="text-sm font-semibold text-gray-800 mb-2">
                                            💡 Cron Examples:
                                        </p>
                                        <div className="space-y-1 text-xs text-gray-700 font-mono">
                                            <p><code className="bg-gray-200 px-2 py-1 rounded">0 * * * *</code> - Mỗi giờ</p>
                                            <p><code className="bg-gray-200 px-2 py-1 rounded">*/15 * * * *</code> - Mỗi 15 phút</p>
                                            <p><code className="bg-gray-200 px-2 py-1 rounded">0 9 * * *</code> - Mỗi ngày lúc 9:00</p>
                                            <p><code className="bg-gray-200 px-2 py-1 rounded">0 9 * * 1</code> - Mỗi thứ 2 lúc 9:00</p>
                                            <p><code className="bg-gray-200 px-2 py-1 rounded">0 9 1 * *</code> - Ngày đầu tháng lúc 9:00</p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Timezone */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Timezone
                                </label>
                                <select
                                    value={config.timezone}
                                    onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                >
                                    <option value="Asia/Ho_Chi_Minh">Asia/Ho Chi Minh (GMT+7)</option>
                                    <option value="UTC">UTC (GMT+0)</option>
                                    <option value="America/New_York">America/New York (EST)</option>
                                    <option value="Europe/London">Europe/London (GMT)</option>
                                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                                </select>
                            </div>

                            {/* Warning about activation */}
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <p className="text-sm text-amber-800">
                                    <strong>⚠️ Quan trọng:</strong> Sau khi config xong, bạn cần <strong>Activate workflow</strong> để schedule trigger hoạt động.
                                    Workflow chỉ chạy theo lịch trình khi ở trạng thái Active.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - OUTPUT */}
                    <div className="w-1/3 flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-900">OUTPUT</h3>
                            </div>
                            <button
                                onClick={handleTestTrigger}
                                disabled={readOnly}
                                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium"
                            >
                                Test Trigger
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <ResultDisplay 
                                data={getDisplayOutput()} 
                                title="OUTPUT"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleTriggerConfigModal;


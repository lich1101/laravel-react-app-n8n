import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

const Settings = () => {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({});

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/system-settings');
            setSettings(response.data);
        } catch (err) {
            console.error('Error fetching settings:', err);
            alert('Không thể tải settings');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSetting = async (key, value) => {
        try {
            setSaving(prev => ({ ...prev, [key]: true }));
            await axios.put(`/system-settings/${key}`, { value });
            
            // Update local state
            setSettings(prev => prev.map(s => 
                s.key === key ? { ...s, value: parseInt(value) } : s
            ));
            
            alert('Đã cập nhật setting thành công!');
        } catch (err) {
            console.error('Error updating setting:', err);
            alert('Không thể cập nhật setting');
        } finally {
            setSaving(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleChange = (key, newValue) => {
        setSettings(prev => prev.map(s => 
            s.key === key ? { ...s, value: newValue } : s
        ));
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-secondary">Đang tải settings...</div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-primary">System Settings</h1>

            <div className="border border-subtle rounded-2xl bg-surface-elevated shadow-card">
                <div className="p-6 space-y-6">
                    {settings.map((setting) => (
                        <div key={setting.key} className="border-b border-subtle pb-6 last:border-b-0">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-secondary">
                                            {setting.description || setting.key}
                                        </h3>
                                        <p className="text-sm text-muted mt-1">
                                            Key:{' '}
                                            <code className="px-2 py-1 rounded bg-surface-muted text-primary border border-subtle">
                                                {setting.key}
                                            </code>
                                        </p>
                                    </div>

                                    {setting.type === 'integer' && (
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={setting.value}
                                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                                className="w-32 px-4 py-2 rounded-xl border border-subtle bg-white text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
                                            />
                                            <button
                                                onClick={() => handleUpdateSetting(setting.key, setting.value)}
                                                disabled={saving[setting.key]}
                                                className="btn btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {saving[setting.key] ? 'Đang lưu...' : 'Lưu'}
                                            </button>
                                        </div>
                                    )}

                                    {setting.type === 'boolean' && (
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={setting.value}
                                                onChange={(e) => {
                                                    const newValue = e.target.checked;
                                                    handleChange(setting.key, newValue);
                                                    handleUpdateSetting(setting.key, newValue);
                                                }}
                                                className="w-5 h-5 rounded border border-subtle text-primary focus:ring-primary/40"
                                            />
                                            <span className="text-secondary">
                                                {setting.value ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </label>
                                    )}

                                    {setting.type === 'string' && (
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <input
                                                type="text"
                                                value={setting.value}
                                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                                className="flex-1 min-w-[220px] px-4 py-2 rounded-xl border border-subtle bg-white text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
                                            />
                                            <button
                                                onClick={() => handleUpdateSetting(setting.key, setting.value)}
                                                disabled={saving[setting.key]}
                                                className="btn btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {saving[setting.key] ? 'Đang lưu...' : 'Lưu'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {setting.key === 'max_concurrent_workflows' && (
                                <div className="mt-4 p-4 rounded-xl bg-surface-muted border border-subtle">
                                    <p className="text-sm text-secondary">
                                        💡 <strong>Lưu ý:</strong> Số workflow tối đa có thể chạy cùng lúc.
                                        Nếu vượt quá giới hạn này, workflow mới sẽ bị từ chối với lỗi
                                        "Concurrent workflow limit reached".
                                    </p>
                                    <p className="text-sm text-muted mt-2">
                                        Giá trị khuyến nghị: 3-10 workflows (tùy thuộc vào tài nguyên server)
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Settings;


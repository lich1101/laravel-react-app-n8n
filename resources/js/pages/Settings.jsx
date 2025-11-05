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
                <div className="text-white">Đang tải settings...</div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-6">System Settings</h1>
            
            <div className="bg-gray-800 rounded-lg shadow-lg">
                <div className="p-6 space-y-6">
                    {settings.map((setting) => (
                        <div key={setting.key} className="border-b border-gray-700 pb-6 last:border-b-0">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-white mb-2">
                                        {setting.description || setting.key}
                                    </h3>
                                    <p className="text-sm text-gray-400 mb-4">
                                        Key: <code className="bg-gray-700 px-2 py-1 rounded">{setting.key}</code>
                                    </p>
                                    
                                    {setting.type === 'integer' && (
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={setting.value}
                                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                                className="bg-gray-700 text-white px-4 py-2 rounded w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <button
                                                onClick={() => handleUpdateSetting(setting.key, setting.value)}
                                                disabled={saving[setting.key]}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-gray-300">
                                                {setting.value ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </label>
                                    )}
                                    
                                    {setting.type === 'string' && (
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="text"
                                                value={setting.value}
                                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                                className="bg-gray-700 text-white px-4 py-2 rounded flex-1 max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <button
                                                onClick={() => handleUpdateSetting(setting.key, setting.value)}
                                                disabled={saving[setting.key]}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {saving[setting.key] ? 'Đang lưu...' : 'Lưu'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Current status info */}
                            {setting.key === 'max_concurrent_workflows' && (
                                <div className="mt-4 p-4 bg-gray-700 rounded">
                                    <p className="text-sm text-gray-300">
                                        💡 <strong>Lưu ý:</strong> Số workflow tối đa có thể chạy cùng lúc. 
                                        Nếu vượt quá giới hạn này, workflow mới sẽ bị từ chối với lỗi 
                                        "Concurrent workflow limit reached".
                                    </p>
                                    <p className="text-sm text-gray-400 mt-2">
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


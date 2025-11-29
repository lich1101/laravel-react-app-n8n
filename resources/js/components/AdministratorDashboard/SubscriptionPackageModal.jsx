import React, { useState, useEffect } from 'react';

const SubscriptionPackageModal = ({ isOpen, onClose, onSave, package: editingPackage, folders }) => {
    const [formData, setFormData] = useState({
        name: '',
        max_concurrent_workflows: 5,
        max_user_workflows: 10,
        description: '',
        folder_ids: [],
        duration_value: '',
        duration_unit: 'days',
        price: '',
        badge_enabled: false,
        badge_text: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (editingPackage) {
            // Convert duration_days back to duration_value and duration_unit
            let duration_value = '';
            let duration_unit = 'days';
            if (editingPackage.duration_days) {
                if (editingPackage.duration_days % 365 === 0) {
                    duration_value = (editingPackage.duration_days / 365).toString();
                    duration_unit = 'years';
                } else if (editingPackage.duration_days % 30 === 0) {
                    duration_value = (editingPackage.duration_days / 30).toString();
                    duration_unit = 'months';
                } else {
                    duration_value = editingPackage.duration_days.toString();
                    duration_unit = 'days';
                }
            }
            
            setFormData({
                name: editingPackage.name || '',
                max_concurrent_workflows: editingPackage.max_concurrent_workflows || 5,
                max_user_workflows: editingPackage.max_user_workflows || 10,
                description: editingPackage.description || '',
                folder_ids: editingPackage.folders?.map(f => f.id) || [],
                duration_value: duration_value,
                duration_unit: duration_unit,
                price: editingPackage.price ? editingPackage.price.toString() : '',
                badge_enabled: editingPackage.badge_enabled || false,
                badge_text: editingPackage.badge_text || ''
            });
        } else {
            setFormData({
                name: '',
                max_concurrent_workflows: 5,
                max_user_workflows: 10,
                description: '',
                folder_ids: [],
                duration_value: '',
                duration_unit: 'days',
                price: '',
                badge_enabled: false,
                badge_text: ''
            });
        }
    }, [editingPackage, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Calculate duration_days from duration_value and duration_unit
        let duration_days = null;
        if (formData.duration_value && formData.duration_unit) {
            const value = parseInt(formData.duration_value);
            switch (formData.duration_unit) {
                case 'days':
                    duration_days = value;
                    break;
                case 'months':
                    duration_days = value * 30;
                    break;
                case 'years':
                    duration_days = value * 365;
                    break;
                default:
                    duration_days = value;
            }
        }
        
        const payload = {
            name: formData.name,
            max_concurrent_workflows: parseInt(formData.max_concurrent_workflows),
            max_user_workflows: parseInt(formData.max_user_workflows),
            description: formData.description,
            folder_ids: formData.folder_ids,
            duration_days: duration_days,
            price: formData.price ? parseFloat(formData.price) : null,
            badge_enabled: formData.badge_enabled || false,
            badge_text: formData.badge_text || null,
        };

        try {
            setSaving(true);
            await onSave(payload, editingPackage?.id);
            onClose();
        } catch (error) {
            console.error('Error saving package:', error);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-y-auto z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-semibold text-gray-900">
                            {editingPackage ? 'Chỉnh sửa Gói cước' : 'Thêm Gói cước mới'}
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tên gói cước *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Max Concurrent Workflows *
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    required
                                    value={formData.max_concurrent_workflows}
                                    onChange={(e) => setFormData({ ...formData, max_concurrent_workflows: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Số workflow tối đa có thể chạy đồng thời
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Max User Workflows *
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="1000"
                                    required
                                    value={formData.max_user_workflows}
                                    onChange={(e) => setFormData({ ...formData, max_user_workflows: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Số workflow mà role user có thể tạo thêm
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Mô tả
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows="3"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Thời hạn dùng
                                </label>
                                <div className="flex space-x-2">
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.duration_value}
                                        onChange={(e) => setFormData({ ...formData, duration_value: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Số lượng"
                                    />
                                    <select
                                        value={formData.duration_unit}
                                        onChange={(e) => setFormData({ ...formData, duration_unit: e.target.value })}
                                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="days">Ngày</option>
                                        <option value="months">Tháng</option>
                                        <option value="years">Năm</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Giá (VNĐ)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <div className="flex items-center space-x-2 mb-3">
                                <input
                                    type="checkbox"
                                    checked={formData.badge_enabled}
                                    onChange={(e) => setFormData({ ...formData, badge_enabled: e.target.checked })}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                    id="badge_enabled"
                                />
                                <label htmlFor="badge_enabled" className="text-sm font-medium text-gray-700">
                                    Bật băng rôn (Badge)
                                </label>
                            </div>
                            {formData.badge_enabled && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Text băng rôn
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.badge_text}
                                        onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="VD: PHỔ BIẾN, KHUYÊN DÙNG..."
                                    />
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Folders
                            </label>
                            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3 bg-white">
                                {folders.map((folder) => (
                                    <label key={folder.id} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.folder_ids.includes(folder.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setFormData({
                                                        ...formData,
                                                        folder_ids: [...formData.folder_ids, folder.id]
                                                    });
                                                } else {
                                                    setFormData({
                                                        ...formData,
                                                        folder_ids: formData.folder_ids.filter(id => id !== folder.id)
                                                    });
                                                }
                                            }}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-900">{folder.name}</span>
                                    </label>
                                ))}
                                {folders.length === 0 && (
                                    <p className="text-sm text-gray-500">Chưa có folder nào</p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Đang lưu...' : (editingPackage ? 'Cập nhật' : 'Tạo')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionPackageModal;


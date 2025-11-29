import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';
import InputModal from '../Common/InputModal';

const EmailRecipientsTab = () => {
    const [recipients, setRecipients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingRecipient, setEditingRecipient] = useState(null);
    const [formData, setFormData] = useState({
        email: '',
        name: '',
        notes: '',
        is_active: true,
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchRecipients();
    }, [currentPage]);

    const fetchRecipients = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get('/email-recipients', {
                params: {
                    page: currentPage,
                    per_page: 20,
                },
            });
            setRecipients(response.data.data || []);
            setTotalPages(response.data.last_page || 1);
        } catch (err) {
            console.error('Error fetching recipients:', err);
            setError(err.response?.data?.error || 'Không thể tải danh sách email');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        setFormData({
            email: '',
            name: '',
            notes: '',
            is_active: true,
        });
        setShowAddModal(true);
    };

    const handleEdit = (recipient) => {
        setEditingRecipient(recipient);
        setFormData({
            email: recipient.email,
            name: recipient.name || '',
            notes: recipient.notes || '',
            is_active: recipient.is_active,
        });
        setShowEditModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa email này?')) {
            return;
        }

        try {
            await axios.delete(`/email-recipients/${id}`);
            fetchRecipients();
        } catch (err) {
            console.error('Error deleting recipient:', err);
            alert(err.response?.data?.error || 'Không thể xóa email');
        }
    };

    const handleSubmitAdd = async () => {
        if (!formData.email) {
            alert('Vui lòng nhập email');
            return;
        }

        try {
            setSubmitting(true);
            await axios.post('/email-recipients', formData);
            setShowAddModal(false);
            fetchRecipients();
        } catch (err) {
            console.error('Error adding recipient:', err);
            const errorMsg = err.response?.data?.errors?.email?.[0] || 
                           err.response?.data?.error || 
                           'Không thể thêm email';
            alert(errorMsg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitEdit = async () => {
        if (!formData.email) {
            alert('Vui lòng nhập email');
            return;
        }

        try {
            setSubmitting(true);
            await axios.put(`/email-recipients/${editingRecipient.id}`, formData);
            setShowEditModal(false);
            setEditingRecipient(null);
            fetchRecipients();
        } catch (err) {
            console.error('Error updating recipient:', err);
            const errorMsg = err.response?.data?.errors?.email?.[0] || 
                           err.response?.data?.error || 
                           'Không thể cập nhật email';
            alert(errorMsg);
        } finally {
            setSubmitting(false);
        }
    };

    const toggleActive = async (recipient) => {
        try {
            await axios.put(`/email-recipients/${recipient.id}`, {
                ...recipient,
                is_active: !recipient.is_active,
            });
            fetchRecipients();
        } catch (err) {
            console.error('Error toggling active status:', err);
            alert(err.response?.data?.error || 'Không thể cập nhật trạng thái');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Quản lý Danh sách Email Nhận Thông Báo</h2>
                <button
                    onClick={handleAdd}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                    <span>+</span> Thêm Email
                </button>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-center py-8">Đang tải...</div>
            ) : recipients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    Chưa có email nào được thêm vào danh sách
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Email
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Tên
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Ghi chú
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Trạng thái
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Thao tác
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {recipients.map((recipient) => (
                                    <tr key={recipient.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {recipient.email}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {recipient.name || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {recipient.notes || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => toggleActive(recipient)}
                                                className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                    recipient.is_active
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}
                                            >
                                                {recipient.is_active ? 'Hoạt động' : 'Tắt'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button
                                                onClick={() => handleEdit(recipient)}
                                                className="text-blue-600 hover:text-blue-900 mr-4"
                                            >
                                                Sửa
                                            </button>
                                            <button
                                                onClick={() => handleDelete(recipient.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Xóa
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="mt-4 flex justify-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
                            >
                                Trước
                            </button>
                            <span className="px-4 py-2">
                                Trang {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
                            >
                                Sau
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4">Thêm Email Mới</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="example@email.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tên (tùy chọn)
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Tên người nhận"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Ghi chú (tùy chọn)
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    rows="3"
                                    placeholder="Ghi chú về email này"
                                />
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="is_active_add"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="mr-2"
                                />
                                <label htmlFor="is_active_add" className="text-sm text-gray-700">
                                    Kích hoạt email này
                                </label>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                                disabled={submitting}
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSubmitAdd}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                disabled={submitting || !formData.email}
                            >
                                {submitting ? 'Đang thêm...' : 'Thêm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && editingRecipient && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4">Sửa Email</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="example@email.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tên (tùy chọn)
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Tên người nhận"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Ghi chú (tùy chọn)
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    rows="3"
                                    placeholder="Ghi chú về email này"
                                />
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="is_active_edit"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="mr-2"
                                />
                                <label htmlFor="is_active_edit" className="text-sm text-gray-700">
                                    Kích hoạt email này
                                </label>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowEditModal(false);
                                    setEditingRecipient(null);
                                }}
                                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                                disabled={submitting}
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSubmitEdit}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                disabled={submitting || !formData.email}
                            >
                                {submitting ? 'Đang cập nhật...' : 'Cập nhật'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailRecipientsTab;


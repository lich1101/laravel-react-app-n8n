import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';
import ConfirmModal from '../Common/ConfirmModal';

const PaymentOrderEmailsTab = () => {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showClearModal, setShowClearModal] = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => {
        fetchEmails();
    }, [currentPage]);

    const fetchEmails = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get('/payment-order-emails', {
                params: {
                    page: currentPage,
                    per_page: 20,
                },
            });
            setEmails(response.data.data || []);
            setTotalPages(response.data.last_page || 1);
        } catch (err) {
            console.error('Error fetching emails:', err);
            setError(err.response?.data?.error || 'Không thể tải danh sách emails');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatCurrency = (amount) => {
        if (!amount) return '-';
        return parseFloat(amount).toLocaleString('vi-VN') + ' VNĐ';
    };

    const getStatusBadge = (status) => {
        if (status === 'sent') {
            return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Đã gửi
                </span>
            );
        }
        return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                Thất bại
            </span>
        );
    };

    const getOrderTypeLabel = (type) => {
        switch (type) {
            case 'new':
                return 'Đăng ký mới';
            case 'renewal':
                return 'Gia hạn';
            case 'change':
                return 'Thay đổi gói';
            default:
                return type || '-';
        }
    };

    const handleClearAll = async () => {
        try {
            setClearing(true);
            await axios.delete('/payment-order-emails');
            setShowClearModal(false);
            setCurrentPage(1);
            fetchEmails();
        } catch (err) {
            console.error('Error clearing emails:', err);
            alert(err.response?.data?.error || 'Không thể xóa tất cả emails');
        } finally {
            setClearing(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="text-center text-secondary">Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary">Quản lý Emails Đơn Hàng</h2>
                {emails.length > 0 && (
                    <button
                        onClick={() => setShowClearModal(true)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
                    >
                        <span>🗑️</span>
                        Xóa tất cả
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-800">
                    {error}
                </div>
            )}

            {emails.length === 0 ? (
                <div className="text-center text-muted py-8">
                    Chưa có email nào được gửi
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Thời gian
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Người nhận
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Khách hàng
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Gói cước
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Loại đơn
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Số tiền
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Trạng thái
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {emails.map((email) => (
                                    <tr key={email.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {formatDate(email.created_at)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {email.recipient_email}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div>
                                                <div className="font-medium text-gray-900">{email.customer_name || '-'}</div>
                                                <div className="text-gray-500 text-xs">{email.customer_email || '-'}</div>
                                                {email.customer_phone && (
                                                    <div className="text-gray-500 text-xs">{email.customer_phone}</div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {email.package_name || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {getOrderTypeLabel(email.order_type)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                                            {formatCurrency(email.amount)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(email.status)}
                                            {email.status === 'failed' && email.error_message && (
                                                <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={email.error_message}>
                                                    {email.error_message}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="mt-4 flex justify-center items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Trước
                            </button>
                            <span className="text-sm text-gray-600">
                                Trang {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Sau
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Clear All Confirmation Modal */}
            <ConfirmModal
                isOpen={showClearModal}
                title="Xác nhận xóa tất cả"
                message="Bạn có chắc chắn muốn xóa tất cả email logs? Hành động này không thể hoàn tác."
                confirmText={clearing ? 'Đang xóa...' : 'Xóa tất cả'}
                cancelText="Hủy"
                onConfirm={handleClearAll}
                onClose={() => setShowClearModal(false)}
                type="danger"
            />
        </div>
    );
};

export default PaymentOrderEmailsTab;


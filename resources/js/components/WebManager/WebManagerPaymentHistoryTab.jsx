import React, { useEffect, useState } from 'react';
import axios from '../../config/axios';

const WebManagerPaymentHistoryTab = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get('/web-manager/payment-orders');
            setOrders(response.data || []);
        } catch (err) {
            console.error('Error fetching payment orders:', err);
            setError(err.response?.data?.error || 'Không thể tải lịch sử thanh toán');
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            'pending': { label: 'Chờ duyệt', class: 'bg-yellow-100 text-yellow-800' },
            'approved': { label: 'Đã duyệt', class: 'bg-green-100 text-green-800' },
            'rejected': { label: 'Đã từ chối', class: 'bg-red-100 text-red-800' },
        };
        const statusInfo = statusMap[status] || { label: status, class: 'bg-gray-100 text-gray-800' };
        return (
            <span className={`px-3 py-1 rounded-full text-sm ${statusInfo.class}`}>
                {statusInfo.label}
            </span>
        );
    };

    const getTypeLabel = (type) => {
        const typeMap = {
            'new': 'Đăng ký mới',
            'renewal': 'Gia hạn',
            'change': 'Thay đổi gói',
        };
        return typeMap[type] || type;
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="text-center text-secondary">Đang tải...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-primary">Lịch sử thanh toán</h2>

            {orders.length === 0 ? (
                <div className="text-center text-muted py-8">
                    Chưa có đơn hàng nào
                </div>
            ) : (
                <div className="bg-surface-elevated rounded-2xl border border-subtle shadow-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-surface-muted">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                                        Mã đơn hàng
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                                        Loại
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                                        Gói cước
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                                        Số tiền
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                                        Trạng thái
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                                        Ngày tạo
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-surface divide-y divide-subtle">
                                {orders.map((order) => (
                                    <tr key={order.id} className="hover:bg-surface-muted">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-primary">
                                            {order.uuid}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-primary">
                                            {getTypeLabel(order.type)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-primary">
                                            {order.subscription_package?.name || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-primary font-semibold">
                                            {order.amount ? `${order.amount.toLocaleString('vi-VN')} VNĐ` : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {getStatusBadge(order.status)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                                            {new Date(order.created_at).toLocaleString('vi-VN')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WebManagerPaymentHistoryTab;


import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';

const SubscriptionRenewalsTab = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all'); // all, pending, approved, rejected
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, [statusFilter]);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const params = statusFilter !== 'all' ? { status: statusFilter } : {};
            const response = await axios.get('/subscription-renewals', { params });
            setOrders(response.data);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (orderId) => {
        if (!window.confirm('Bạn có chắc chắn muốn duyệt đơn hàng này?')) {
            return;
        }

        try {
            setProcessing(true);
            await axios.post(`/subscription-renewals/${orderId}/approve`);
            alert('Đơn hàng đã được duyệt thành công');
            fetchOrders();
            setSelectedOrder(null);
        } catch (error) {
            alert(error.response?.data?.error || 'Không thể duyệt đơn hàng');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async (orderId) => {
        const notes = window.prompt('Nhập lý do từ chối (nếu có):');
        if (notes === null) return; // User cancelled

        try {
            setProcessing(true);
            await axios.post(`/subscription-renewals/${orderId}/reject`, { notes });
            alert('Đơn hàng đã bị từ chối');
            fetchOrders();
            setSelectedOrder(null);
        } catch (error) {
            alert(error.response?.data?.error || 'Không thể từ chối đơn hàng');
        } finally {
            setProcessing(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('vi-VN');
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="text-center">Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Quản lý Gia hạn</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setStatusFilter('all')}
                        className={`px-4 py-2 rounded-lg ${
                            statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        Tất cả
                    </button>
                    <button
                        onClick={() => setStatusFilter('pending')}
                        className={`px-4 py-2 rounded-lg ${
                            statusFilter === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        Chờ duyệt
                    </button>
                    <button
                        onClick={() => setStatusFilter('approved')}
                        className={`px-4 py-2 rounded-lg ${
                            statusFilter === 'approved' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        Đã duyệt
                    </button>
                    <button
                        onClick={() => setStatusFilter('rejected')}
                        className={`px-4 py-2 rounded-lg ${
                            statusFilter === 'rejected' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        Đã từ chối
                    </button>
                </div>
            </div>

            {orders.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                    Không có đơn hàng nào
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Mã đơn
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Người dùng
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Gói cước
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Số tiền
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Trạng thái
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Ngày tạo
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Thao tác
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {orders.map((order) => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                                        {order.uuid.substring(0, 8)}...
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {order.user?.name || order.user?.email || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {order.subscription_package?.name || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                                        {formatCurrency(order.amount)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`px-2 py-1 text-xs rounded-full ${
                                                order.status === 'approved'
                                                    ? 'bg-green-100 text-green-800'
                                                    : order.status === 'rejected'
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-yellow-100 text-yellow-800'
                                            }`}
                                        >
                                            {order.status === 'approved'
                                                ? 'Đã duyệt'
                                                : order.status === 'rejected'
                                                ? 'Đã từ chối'
                                                : 'Chờ duyệt'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDate(order.created_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {order.status === 'pending' && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleApprove(order.id)}
                                                    disabled={processing}
                                                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                                >
                                                    Duyệt
                                                </button>
                                                <button
                                                    onClick={() => handleReject(order.id)}
                                                    disabled={processing}
                                                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                                >
                                                    Từ chối
                                                </button>
                                            </div>
                                        )}
                                        {order.status !== 'pending' && (
                                            <span className="text-gray-400">
                                                {order.approved_by && order.approved_by?.name
                                                    ? `Bởi ${order.approved_by.name}`
                                                    : '-'}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default SubscriptionRenewalsTab;


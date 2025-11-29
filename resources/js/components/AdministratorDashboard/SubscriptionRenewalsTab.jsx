import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import ConfirmModal from '../Common/ConfirmModal';
import InputModal from '../Common/InputModal';

const SubscriptionRenewalsTab = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [allOrders, setAllOrders] = useState([]); // Store all orders for filtering
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all'); // all, pending, approved, rejected
    const [searchFilter, setSearchFilter] = useState(''); // Search filter
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [redirecting, setRedirecting] = useState(false);
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [orderToProcess, setOrderToProcess] = useState(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    useEffect(() => {
        // Apply both search and status filters
        applyFilters();
    }, [searchFilter, statusFilter, allOrders]);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            // Always fetch all orders to enable search
            const response = await axios.get('/subscription-renewals');
            setAllOrders(response.data);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...allOrders];

        // Apply search filter
        if (searchFilter.trim()) {
            const searchTerm = searchFilter.toLowerCase().trim();
            filtered = filtered.filter(order => {
                // Search in all fields
                const searchableText = [
                    order.uuid || '',
                    order.user?.name || '',
                    order.user?.email || '',
                    order.subscription_package?.name || '',
                    order.amount?.toString() || '',
                    order.status || '',
                    formatDate(order.created_at) || '',
                ].join(' ').toLowerCase();
                
                return searchableText.includes(searchTerm);
            });
        }

        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(order => order.status === statusFilter);
        }

        setOrders(filtered);
    };

    const handleApproveClick = (orderId) => {
        setOrderToProcess(orderId);
        setShowApproveModal(true);
    };

    const handleApprove = async () => {
        if (!orderToProcess) return;

        try {
            setProcessing(true);
            setShowApproveModal(false);
            await axios.post(`/subscription-renewals/${orderToProcess}/approve`);
            
            // Show loading and redirect to projects page
            setRedirecting(true);
            setTimeout(() => {
                navigate('/administrator/projects');
            }, 500);
        } catch (error) {
            console.error('Error approving order:', error);
            setProcessing(false);
            setOrderToProcess(null);
        }
    };

    const handleRejectClick = (orderId) => {
        setOrderToProcess(orderId);
        setShowRejectModal(true);
    };

    const handleReject = async (notes) => {
        if (!orderToProcess) return;

        try {
            setProcessing(true);
            setShowRejectModal(false);
            await axios.post(`/subscription-renewals/${orderToProcess}/reject`, { notes: notes || null });
            fetchOrders();
            setSelectedOrder(null);
            setOrderToProcess(null);
        } catch (error) {
            console.error('Error rejecting order:', error);
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

    if (loading || redirecting) {
        return (
            <div className="p-8">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                    <div className="text-gray-600">
                        {redirecting ? 'Đang chuyển đến trang quản lý dự án...' : 'Đang tải...'}
                    </div>
                </div>
            </div>
        );
    }

    // Count pending orders
    const pendingCount = allOrders.filter(order => order.status === 'pending').length;

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold">Quản lý Gia hạn</h2>
                    {pendingCount > 0 && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
                            {pendingCount} đơn chờ duyệt
                        </span>
                    )}
                </div>
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

            {/* Search Filter */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Tìm kiếm theo mã đơn, tên, email, gói cước, số tiền, trạng thái..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
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
                                    Email
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
                                        {order.user?.name || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {order.user?.email || '-'}
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
                                                    onClick={() => handleApproveClick(order.id)}
                                                    disabled={processing}
                                                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                                >
                                                    Duyệt
                                                </button>
                                                <button
                                                    onClick={() => handleRejectClick(order.id)}
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

            {/* Confirm Approve Modal */}
            <ConfirmModal
                isOpen={showApproveModal}
                onClose={() => {
                    setShowApproveModal(false);
                    setOrderToProcess(null);
                }}
                onConfirm={handleApprove}
                title="Xác nhận duyệt đơn hàng"
                message="Bạn có chắc chắn muốn duyệt đơn hàng này?"
                confirmText="Duyệt"
                cancelText="Hủy"
                type="success"
            />

            {/* Reject Order Modal */}
            <InputModal
                isOpen={showRejectModal}
                onClose={() => {
                    setShowRejectModal(false);
                    setOrderToProcess(null);
                }}
                onConfirm={(notes) => handleReject(notes)}
                title="Từ chối đơn hàng"
                message="Nhập lý do từ chối (nếu có):"
                placeholder="Lý do từ chối..."
                confirmText="Từ chối"
                cancelText="Hủy"
            />
        </div>
    );
};

export default SubscriptionRenewalsTab;


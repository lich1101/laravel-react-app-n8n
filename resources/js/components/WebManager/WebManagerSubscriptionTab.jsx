import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';

const WebManagerSubscriptionTab = ({ type = 'new' }) => {
    const [packages, setPackages] = useState([]);
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creatingOrder, setCreatingOrder] = useState(false);
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const [order, setOrder] = useState(null);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchData();
    }, [type]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [packagesRes, projectRes] = await Promise.all([
                axios.get('/web-manager/subscription-packages'),
                axios.get('/web-manager/project').catch((err) => {
                    if (err.response?.status === 404) {
                        return { data: null };
                    }
                    throw err;
                }),
            ]);
            
            const allPackages = packagesRes.data || [];
            const projectData = projectRes?.data || null;
            setProject(projectData);

            // Filter packages based on type
            if (type === 'change') {
                // Thay đổi gói: chỉ hiển thị khi đã có gói và được duyệt, hiển thị các gói chưa đăng ký
                if (!projectData || !projectData.subscription_package_id) {
                    // Chưa có gói, không cho vào
                    setPackages([]);
                } else {
                    // Hiển thị các gói khác (chưa đăng ký)
                    const currentPackageId = projectData.subscription_package_id;
                    setPackages(allPackages.filter(pkg => pkg.id !== currentPackageId));
                }
            } else {
                // Gia hạn/Đăng ký: hiển thị tất cả gói (hoặc chỉ gói hiện tại nếu đã có)
                if (projectData && projectData.subscription_package_id) {
                    // Đã có gói: chỉ hiển thị gói hiện tại để gia hạn
                    const currentPackage = allPackages.find(pkg => pkg.id === projectData.subscription_package_id);
                    setPackages(currentPackage ? [currentPackage] : []);
                } else {
                    // Chưa có gói: hiển thị tất cả để đăng ký
                    setPackages(allPackages);
                }
            }
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.response?.data?.error || 'Không thể tải dữ liệu');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOrder = async () => {
        if (!selectedPackage) {
            setError('Vui lòng chọn gói cước');
            return;
        }

        try {
            setCreatingOrder(true);
            setError(null);

            // Xác định type:
            // - Nếu route là 'change': type = 'change'
            // - Nếu có project và route không phải 'change': type = 'renewal'
            // - Nếu không có project: type = 'new'
            let orderType = 'new';
            if (type === 'change') {
                orderType = 'change';
            } else if (project) {
                orderType = 'renewal';
            }
            
            const response = await axios.post('/web-manager/payment-orders', {
                subscription_package_id: selectedPackage.id,
                project_id: project?.id || null,
                type: orderType,
            });

            setOrder(response.data.order);
        } catch (err) {
            setError(err.response?.data?.error || 'Không thể tạo đơn hàng');
        } finally {
            setCreatingOrder(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="text-center text-secondary">Đang tải...</div>
            </div>
        );
    }

    // Check if project exists - if not, redirect to create project
    if (!project) {
        return (
            <div className="p-8">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 max-w-2xl">
                    <h3 className="text-lg font-semibold text-yellow-800 mb-2">Chưa có trang web</h3>
                    <p className="text-yellow-700 mb-4">
                        Bạn cần tạo trang web trước khi có thể {type === 'change' ? 'thay đổi gói' : 'đăng ký hoặc gia hạn gói'}.
                    </p>
                    <button
                        onClick={() => navigate('/dashboard/web')}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-card"
                    >
                        Tạo trang web ngay
                    </button>
                </div>
            </div>
        );
    }

    // For change package: check if user has a package
    if (type === 'change' && !project.subscription_package_id) {
        return (
            <div className="p-8">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 max-w-2xl">
                    <h3 className="text-lg font-semibold text-yellow-800 mb-2">Chưa đăng ký gói</h3>
                    <p className="text-yellow-700 mb-4">
                        Bạn cần đăng ký gói cước trước khi có thể thay đổi gói. Vui lòng sử dụng chức năng "Gia hạn/Đăng ký gói" để đăng ký gói đầu tiên.
                    </p>
                    <button
                        onClick={() => navigate('/dashboard/subscription')}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-card"
                    >
                        Đăng ký gói
                    </button>
                </div>
            </div>
        );
    }

    if (order) {
        return (
            <div className="p-8">
                <h2 className="text-2xl font-bold mb-6 text-primary">Thanh toán</h2>
                
                <div className="bg-surface-elevated rounded-2xl border border-subtle shadow-card p-6 max-w-2xl mx-auto">
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-semibold mb-2 text-primary">Quét mã QR để thanh toán</h3>
                        <p className="text-secondary mb-4">
                            Số tiền: <span className="font-bold text-lg text-primary">{order.amount.toLocaleString('vi-VN')} VNĐ</span>
                        </p>
                        <p className="text-sm text-muted mb-4">
                            Mã đơn hàng: {order.uuid}
                        </p>
                    </div>

                    {order.qr_code_url && (
                        <div className="flex justify-center mb-6">
                            <img 
                                src={order.qr_code_url} 
                                alt="QR Code" 
                                className="w-64 h-64 border-2 border-subtle rounded-xl"
                            />
                        </div>
                    )}

                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                        <p className="text-sm text-yellow-800">
                            <strong>Lưu ý:</strong> Sau khi thanh toán, đơn hàng của bạn sẽ được đưa vào hàng đợi chờ duyệt. 
                            Vui lòng chờ quản trị viên duyệt đơn hàng.
                        </p>
                    </div>

                    <div className="flex justify-center gap-4">
                        <button
                            onClick={async () => {
                                try {
                                    setSubmittingPayment(true);
                                    await axios.post(`/web-manager/payment-orders/${order.id}/submit-payment`);
                                    alert('Đơn hàng đã được gửi vào hàng đợi chờ duyệt. Vui lòng chờ quản trị viên duyệt.');
                                    setOrder(null);
                                    setSelectedPackage(null);
                                    fetchData(); // Refresh to show updated order status
                                } catch (err) {
                                    alert(err.response?.data?.error || 'Không thể gửi đơn hàng');
                                } finally {
                                    setSubmittingPayment(false);
                                }
                            }}
                            disabled={submittingPayment}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-card"
                        >
                            {submittingPayment ? 'Đang gửi...' : 'Đã thanh toán'}
                        </button>
                        <button
                            onClick={() => {
                                setOrder(null);
                                setSelectedPackage(null);
                            }}
                            className="px-6 py-2 bg-surface-muted text-secondary rounded-xl hover:bg-surface-strong transition-colors"
                        >
                            Quay lại
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-primary">
                {type === 'change' ? 'Thay đổi gói' : project.subscription_package_id ? 'Gia hạn gói' : 'Đăng ký gói'}
            </h2>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-800">
                    {error}
                </div>
            )}

            {packages.length === 0 ? (
                <div className="text-center text-muted py-8">
                    {type === 'change' 
                        ? 'Không có gói cước nào khả dụng để thay đổi'
                        : 'Không có gói cước nào khả dụng'}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                    {packages.map((pkg) => (
                        <div
                            key={pkg.id}
                            onClick={() => setSelectedPackage(pkg)}
                            className={`bg-surface-elevated rounded-2xl border-2 shadow-card p-6 cursor-pointer transition-all ${
                                selectedPackage?.id === pkg.id
                                    ? 'border-primary bg-primary-soft'
                                    : 'border-subtle hover:border-primary hover:shadow-lg'
                            }`}
                        >
                            <h3 className="text-xl font-bold mb-2 text-primary">{pkg.name}</h3>
                            <div className="text-2xl font-bold text-primary mb-2">
                                {pkg.price ? `${pkg.price.toLocaleString('vi-VN')} VNĐ` : 'Liên hệ'}
                            </div>
                            {pkg.duration_days && (
                                <div className="text-sm text-secondary mb-2">
                                    Thời hạn: {pkg.duration_days} ngày
                                </div>
                            )}
                            {pkg.description && (
                                <div className="text-sm text-muted mt-2">{pkg.description}</div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {selectedPackage && (
                <div className="flex justify-end">
                    <button
                        onClick={handleCreateOrder}
                        disabled={creatingOrder}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-card"
                    >
                        {creatingOrder ? 'Đang tạo...' : 'Tiếp tục thanh toán'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default WebManagerSubscriptionTab;

import React, { useState } from 'react';
import axios from '../config/axios';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const defaultEmail = searchParams.get('email') || '';

    const [formData, setFormData] = useState({
        email: defaultEmail,
        password: '',
        password_confirmation: '',
    });

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);

        try {
            await axios.post('/reset-password', {
                ...formData,
                token,
            });
            setInfo('Đã đặt lại mật khẩu. Bạn sẽ được chuyển tới trang đăng nhập.');
            setTimeout(() => navigate('/login?reset=1'), 1500);
        } catch (err) {
            setError(err.response?.data?.message || 'Không thể đặt lại mật khẩu.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="max-w-md w-full space-y-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Liên kết không hợp lệ</h2>
                    <p className="text-gray-600">Token đặt lại mật khẩu thiếu hoặc đã hết hạn.</p>
                    <Link to="/login" className="text-indigo-600 hover:text-indigo-500 text-sm font-medium">
                        Quay lại đăng nhập
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full space-y-6">
                <h2 className="text-center text-3xl font-extrabold text-gray-900">Tạo mật khẩu mới</h2>
                {error && (
                    <div className="rounded-md bg-red-50 p-4">
                        <div className="text-sm text-red-800">{error}</div>
                    </div>
                )}
                {info && (
                    <div className="rounded-md bg-emerald-50 p-4">
                        <div className="text-sm text-emerald-800">{info}</div>
                    </div>
                )}
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="reset-email" className="sr-only">
                            Email
                        </label>
                        <input
                            id="reset-email"
                            type="email"
                            required
                            placeholder="Email"
                            className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="reset-password" className="sr-only">
                            Password
                        </label>
                        <input
                            id="reset-password"
                            type="password"
                            required
                            placeholder="Mật khẩu mới"
                            className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="reset-password-confirmation" className="sr-only">
                            Confirm password
                        </label>
                        <input
                            id="reset-password-confirmation"
                            type="password"
                            required
                            placeholder="Xác nhận mật khẩu"
                            className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                            value={formData.password_confirmation}
                            onChange={(e) =>
                                setFormData({ ...formData, password_confirmation: e.target.value })
                            }
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
                    </button>
                    <div className="text-center">
                        <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">
                            Quay lại đăng nhập
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;


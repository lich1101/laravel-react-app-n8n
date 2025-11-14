import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import { useNavigate, useSearchParams } from 'react-router-dom';

const Login = ({ onLoginSuccess }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [mode, setMode] = useState('login'); // login | register | forgot
    const [requiresRegistration, setRequiresRegistration] = useState(false);

    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    const [registerData, setRegisterData] = useState({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const [forgotEmail, setForgotEmail] = useState('');

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const verified = searchParams.get('verified');
        const reset = searchParams.get('reset');

        if (verified) {
            setInfo('Email đã được xác thực. Bạn có thể đăng nhập.');
        } else if (reset) {
            setInfo('Đã cập nhật mật khẩu. Vui lòng đăng nhập.');
        }
    }, [searchParams]);

    useEffect(() => {
        const fetchRegistrationStatus = async () => {
            try {
                const response = await axios.get('/registration-status');
                if (response.data.requires_registration) {
                    setRequiresRegistration(true);
                    setMode('register');
                }
            } catch (err) {
                console.error('Unable to check registration status', err);
            }
        };

        fetchRegistrationStatus();
    }, []);

    useEffect(() => {
        setError('');
        setInfo((prev) => prev);
    }, [mode]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await axios.post('/login', {
                email: loginEmail,
                password: loginPassword,
            });
            const { user, access_token } = response.data;

            localStorage.setItem('token', access_token);
            localStorage.setItem('user', JSON.stringify(user));

            if (onLoginSuccess) {
                onLoginSuccess(user);
            }

            if (user.role === 'administrator') {
                navigate('/administrator');
            } else if (user.role === 'admin') {
                navigate('/admin');
            } else {
                navigate('/dashboard/automations/manage');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Đăng nhập thất bại');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);

        try {
            const response = await axios.post('/register', registerData);
            setInfo(response.data.message || 'Đăng ký thành công. Vui lòng kiểm tra email.');
            setRequiresRegistration(false);
            setMode('login');
        } catch (err) {
            setError(err.response?.data?.message || 'Đăng ký thất bại');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);

        try {
            const response = await axios.post('/forgot-password', { email: forgotEmail });
            setInfo(response.data.message || 'Đã gửi email đặt lại mật khẩu.');
            setMode('login');
        } catch (err) {
            setError(err.response?.data?.message || 'Không thể gửi email.');
        } finally {
            setLoading(false);
        }
    };

    const renderLoginForm = () => (
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="rounded-md shadow-sm -space-y-px">
                <div>
                    <label htmlFor="login-email" className="sr-only">
                        Email address
                    </label>
                    <input
                        id="login-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        placeholder="Email address"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                    />
                </div>
                <div>
                    <label htmlFor="login-password" className="sr-only">
                        Password
                    </label>
                    <input
                        id="login-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        placeholder="Password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between text-sm">
                <button
                    type="button"
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                    onClick={() => setMode('forgot')}
                >
                    Quên mật khẩu?
                </button>
                {requiresRegistration && (
                    <button
                        type="button"
                        className="font-medium text-indigo-600 hover:text-indigo-500"
                        onClick={() => setMode('register')}
                    >
                        Đăng ký tài khoản
                    </button>
                )}
            </div>

            <div>
                <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Signing in...' : 'Sign in'}
                </button>
            </div>

            <div className="text-center">
                <p className="text-sm text-gray-600 font-medium">
                    Demo admin: admin@admin.com / password
                </p>
            </div>
        </form>
    );

    const renderRegisterForm = () => (
        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
            <div className="space-y-4">
                <div>
                    <label htmlFor="register-name" className="sr-only">
                        Name
                    </label>
                    <input
                        id="register-name"
                        type="text"
                        required
                        placeholder="Họ và tên"
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        value={registerData.name}
                        onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="register-email" className="sr-only">
                        Email
                    </label>
                    <input
                        id="register-email"
                        type="email"
                        required
                        placeholder="Email"
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        value={registerData.email}
                        onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="register-password" className="sr-only">
                        Password
                    </label>
                    <input
                        id="register-password"
                        type="password"
                        required
                        placeholder="Mật khẩu"
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        value={registerData.password}
                        onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="register-password-confirmation" className="sr-only">
                        Confirm password
                    </label>
                    <input
                        id="register-password-confirmation"
                        type="password"
                        required
                        placeholder="Xác nhận mật khẩu"
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        value={registerData.password_confirmation}
                        onChange={(e) =>
                            setRegisterData({ ...registerData, password_confirmation: e.target.value })
                        }
                    />
                </div>
            </div>

            <p className="text-xs text-gray-500">
                * Hệ thống chỉ cho phép một tài khoản role "user". Sau khi đăng ký thành công, tính năng đăng ký sẽ bị khóa.
            </p>

            <div>
                <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Đang xử lý...' : 'Đăng ký'}
                </button>
            </div>

            <div className="text-center">
                <button
                    type="button"
                    className="text-sm text-gray-600 hover:text-gray-900"
                    onClick={() => setMode('login')}
                >
                    Đã có tài khoản? Đăng nhập
                </button>
            </div>
        </form>
    );

    const renderForgotForm = () => (
        <form className="mt-8 space-y-6" onSubmit={handleForgotPassword}>
            <div>
                <label htmlFor="forgot-email" className="sr-only">
                    Email
                </label>
                <input
                    id="forgot-email"
                    type="email"
                    required
                    placeholder="Email"
                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                />
            </div>

            <div>
                <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại mật khẩu'}
                </button>
            </div>

            <div className="text-center">
                <button
                    type="button"
                    className="text-sm text-gray-600 hover:text-gray-900"
                    onClick={() => setMode('login')}
                >
                    Quay lại đăng nhập
                </button>
            </div>
        </form>
    );

    const renderForm = () => {
        if (mode === 'register') return renderRegisterForm();
        if (mode === 'forgot') return renderForgotForm();
        return renderLoginForm();
    };

    const getTitle = () => {
        if (mode === 'register') return 'Tạo tài khoản người dùng';
        if (mode === 'forgot') return 'Quên mật khẩu';
        return 'Sign in to your account';
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full space-y-6">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        {getTitle()}
                    </h2>
                </div>
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
                {renderForm()}
            </div>
        </div>
    );
};

export default Login;

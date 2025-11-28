import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import { useNavigate, useSearchParams } from 'react-router-dom';

const Login = ({ onLoginSuccess }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [mode, setMode] = useState('login'); // login | register | forgot
    const [requiresRegistration, setRequiresRegistration] = useState(false);
    const [isWebManagerDomain, setIsWebManagerDomain] = useState(false);

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
        const googleAuth = searchParams.get('google_auth');
        const token = searchParams.get('token');
        const userParam = searchParams.get('user');

        if (verified) {
            setInfo('Email đã được xác thực. Bạn có thể đăng nhập.');
        } else if (reset) {
            setInfo('Đã cập nhật mật khẩu. Vui lòng đăng nhập.');
        } else if (googleAuth === 'success' && token && userParam) {
            // Handle Google OAuth success
            try {
                const user = JSON.parse(decodeURIComponent(userParam));
                localStorage.setItem('token', decodeURIComponent(token));
                localStorage.setItem('user', JSON.stringify(user));
                
                // Redirect based on role
                if (user.role === 'administrator') {
                    navigate('/administrator');
                } else if (user.role === 'admin') {
                    navigate('/admin');
                } else {
                    navigate('/dashboard');
                }
            } catch (err) {
                console.error('Error parsing Google auth data:', err);
                setError('Đăng nhập Google thất bại. Vui lòng thử lại.');
            }
        } else if (googleAuth === 'error') {
            const message = searchParams.get('message');
            setError(message || 'Đăng nhập Google thất bại. Vui lòng thử lại.');
        }
    }, [searchParams, navigate]);

    useEffect(() => {
        const fetchRegistrationStatus = async () => {
            try {
                // Check if this is WEB_MANAGER_USER domain
                let isWebManager = false;
                try {
                    const domainCheck = await axios.get('/web-manager/domain-check');
                    isWebManager = domainCheck.data?.is_web_manager_domain || false;
                    setIsWebManagerDomain(isWebManager);
                } catch (err) {
                    console.error('Unable to check domain', err);
                    setIsWebManagerDomain(false);
                }

                // For WEB_MANAGER_USER domain, always allow registration (unlimited users)
                if (isWebManager) {
                    setRequiresRegistration(true); // Show register button
                    return;
                }

                // For other domains, check registration status
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
                {(requiresRegistration || isWebManagerDomain) && (
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

            {isWebManagerDomain && (
                <div className="mt-4">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-gray-50 text-gray-500">Hoặc</span>
                        </div>
                    </div>
                    <div className="mt-4">
                        <button
                            type="button"
                            onClick={() => {
                                window.location.href = '/api/auth/google/redirect';
                            }}
                            className="w-full flex items-center justify-center gap-3 py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    fill="#4285F4"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                />
                                <path
                                    fill="#EA4335"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                            Đăng nhập với Google
                        </button>
                    </div>
                </div>
            )}
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

            {!isWebManagerDomain && (
                <p className="text-xs text-gray-500">
                    * Hệ thống chỉ cho phép một tài khoản role "user". Sau khi đăng ký thành công, tính năng đăng ký sẽ bị khóa.
                </p>
            )}
            {isWebManagerDomain && (
                <p className="text-xs text-gray-500">
                    * Bạn có thể đăng ký tài khoản không giới hạn.
                </p>
            )}

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

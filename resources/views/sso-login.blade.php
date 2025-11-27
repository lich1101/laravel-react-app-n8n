<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đang đăng nhập...</title>
</head>
<body>
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
        <div style="text-align: center;">
            <h2>Đang đăng nhập tự động...</h2>
            <p>Vui lòng đợi trong giây lát.</p>
        </div>
    </div>

    <script>
        (function() {
            console.log('SSO login script started');
            try {
                const token = @json($token);
                const user = @json($user);
                
                console.log('Token received:', token ? token.substring(0, 10) + '...' : 'null');
                console.log('User received:', user);
                
                if (!token) {
                    throw new Error('Token is missing');
                }
                
                // Save token and user to localStorage
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                
                console.log('Token and user saved to localStorage');
                console.log('localStorage.token:', localStorage.getItem('token') ? 'exists' : 'missing');
                console.log('localStorage.user:', localStorage.getItem('user') ? 'exists' : 'missing');

                // Small delay to ensure localStorage is saved
                setTimeout(function() {
                    console.log('Redirecting to dashboard...');
                    window.location.href = '/dashboard';
                }, 100);
            } catch (error) {
                console.error('SSO login error:', error);
                alert('Có lỗi xảy ra khi đăng nhập: ' + error.message);
                window.location.href = '/login';
            }
        })();
    </script>
</body>
</html>


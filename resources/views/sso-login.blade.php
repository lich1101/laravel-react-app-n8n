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
            try {
                const token = @json($token);
                const user = @json($user);
                
                if (!token) {
                    throw new Error('Token is missing');
                }
                
                // Save token and user to localStorage
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));

                // Small delay to ensure localStorage is saved
                setTimeout(function() {
                    window.location.href = '/dashboard';
                }, 100);
            } catch (error) {
                alert('Có lỗi xảy ra khi đăng nhập: ' + error.message);
                window.location.href = '/login';
            }
        })();
    </script>
</body>
</html>


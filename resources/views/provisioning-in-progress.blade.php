<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Website đang được tạo - {{ $project->name ?? 'ChatPlus' }}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 60px 40px;
            max-width: 600px;
            width: 100%;
            text-align: center;
        }
        
        .icon {
            width: 120px;
            height: 120px;
            margin: 0 auto 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse 2s ease-in-out infinite;
        }
        
        .icon svg {
            width: 60px;
            height: 60px;
            color: white;
        }
        
        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
                opacity: 1;
            }
            50% {
                transform: scale(1.05);
                opacity: 0.9;
            }
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        h1 {
            color: #333;
            font-size: 28px;
            margin-bottom: 15px;
            font-weight: 600;
        }
        
        .subtitle {
            color: #666;
            font-size: 16px;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        
        .status-badge {
            display: inline-block;
            padding: 8px 20px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            margin-top: 20px;
        }
        
        .status-pending {
            background: #fff3cd;
            color: #856404;
        }
        
        .status-provisioning {
            background: #d1ecf1;
            color: #0c5460;
        }
        
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-top: 30px;
            border-radius: 8px;
            text-align: left;
        }
        
        .info-box h3 {
            color: #333;
            font-size: 16px;
            margin-bottom: 10px;
        }
        
        .info-box p {
            color: #666;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .info-box ul {
            color: #666;
            font-size: 14px;
            line-height: 1.8;
            margin-left: 20px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
        </div>
        
        <h1>Website đang được tạo</h1>
        <p class="subtitle">
            Trang web <strong>{{ $project->name ?? 'của bạn' }}</strong> đang được thiết lập và sẽ sẵn sàng trong vài phút.
        </p>
        
        <div class="spinner"></div>
        
        @if($project->provisioning_status === 'pending')
            <div class="status-badge status-pending">
                ⏳ Chờ duyệt từ quản trị viên
            </div>
        @elseif($project->provisioning_status === 'provisioning')
            <div class="status-badge status-provisioning">
                🔄 Đang tạo website...
            </div>
        @endif
        
        <div class="info-box">
            <h3>Quá trình đang diễn ra:</h3>
            <ul>
                @if($project->provisioning_status === 'pending')
                    <li>Đang chờ quản trị viên duyệt đơn hàng thanh toán</li>
                @else
                    <li>Đang clone repository và tạo cơ sở dữ liệu</li>
                    <li>Đang cài đặt dependencies và build ứng dụng</li>
                    <li>Đang cấu hình Apache và SSL certificate</li>
                    <li>Đang áp dụng gói cước đã đăng ký</li>
                @endif
            </ul>
            <p style="margin-top: 15px; font-size: 13px; color: #999;">
                Vui lòng đợi trong giây lát. Trang này sẽ tự động cập nhật khi website sẵn sàng.
            </p>
        </div>
    </div>
    
    <script>
        // Auto-refresh every 10 seconds to check if provisioning is complete
        setTimeout(function() {
            location.reload();
        }, 10000);
    </script>
</body>
</html>


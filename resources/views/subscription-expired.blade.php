<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gói cước đã hết hạn</title>
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
            color: #ffffff;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
            text-align: center;
        }
        
        .icon {
            font-size: 80px;
            margin-bottom: 20px;
        }
        
        h1 {
            font-size: 32px;
            margin-bottom: 20px;
            font-weight: 700;
        }
        
        p {
            font-size: 18px;
            line-height: 1.6;
            margin-bottom: 30px;
            opacity: 0.9;
        }
        
        .info-box {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
            text-align: left;
        }
        
        .info-box h2 {
            font-size: 20px;
            margin-bottom: 15px;
            font-weight: 600;
        }
        
        .info-item {
            margin-bottom: 10px;
            font-size: 16px;
        }
        
        .info-item strong {
            display: inline-block;
            min-width: 150px;
        }
        
        .actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 12px 30px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
        }
        
        .btn-primary {
            background: #ffffff;
            color: #667eea;
        }
        
        .btn-primary:hover {
            background: #f0f0f0;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .btn-secondary {
            background: rgba(255, 255, 255, 0.2);
            color: #ffffff;
            border: 2px solid rgba(255, 255, 255, 0.3);
        }
        
        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
        
        @media (max-width: 600px) {
            .container {
                padding: 30px 20px;
            }
            
            h1 {
                font-size: 24px;
            }
            
            p {
                font-size: 16px;
            }
            
            .actions {
                flex-direction: column;
            }
            
            .btn {
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">⏰</div>
        <h1>Gói cước đã hết hạn</h1>
        <p>Trang web của bạn đã hết thời hạn sử dụng. Vui lòng gia hạn hoặc đổi gói cước để tiếp tục sử dụng dịch vụ.</p>
        
        @if($project)
        <div class="info-box">
            <h2>Thông tin dự án</h2>
            <div class="info-item">
                <strong>Tên dự án:</strong> {{ $project->name }}
            </div>
            @if($project->expires_at)
            <div class="info-item">
                <strong>Hết hạn vào:</strong> {{ $project->expires_at->format('d/m/Y H:i') }}
            </div>
            @endif
            @if($project->subscriptionPackage)
            <div class="info-item">
                <strong>Gói cước:</strong> {{ $project->subscriptionPackage->name }}
            </div>
            @endif
        </div>
        @endif
        
        <div class="actions">
            <a href="https://administrator.chatplus.vn" class="btn btn-primary" target="_blank">
                Gia hạn ngay
            </a>
            <a href="https://administrator.chatplus.vn" class="btn btn-secondary" target="_blank">
                Đổi gói cước
            </a>
        </div>
    </div>
</body>
</html>


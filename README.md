<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

You may also try the [Laravel Bootcamp](https://bootcamp.laravel.com), where you will be guided through building a modern Laravel application from scratch.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com)**
- **[Tighten Co.](https://tighten.co)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Redberry](https://redberry.international/laravel-development)**
- **[Active Logic](https://activelogic.com)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).

# Laravel + React Workflow Automation System

Một hệ thống automation workflow tương tự n8n, sử dụng Laravel (backend) và React (frontend).

## Tính năng chính

### 1. **Authentication & User Management**
- Đăng nhập/đăng ký với Laravel Sanctum
- Quản lý người dùng (Admin role)
- Protected routes

### 2. **Workflow Management**
- Tạo và quản lý workflows
- Visual canvas editor với ReactFlow
- Lưu workflow structure (nodes, edges) dạng JSON
- Nút bật/tắt workflow (chỉ bật được khi có webhook node)

### 3. **Node Types**
- **Webhook Node**: Điểm bắt đầu workflow, nhận incoming webhook
- **HTTP Request Node**: Gửi HTTP request với config (method, URL, headers, body)
- **Code Node**: (Placeholder) Cho custom code execution

### 4. **Workflow Execution**
- **Backend tự động chạy** khi webhook được trigger
- **Tuần tự thực thi** các node theo mũi tên kết nối
- **Truyền dữ liệu** giữa các node (input/output)
- **Resolve variables** `{{variable.path}}` từ node trước

## Cách sử dụng

### 1. Khởi động project

```bash
# Backend (Laravel)
composer install
php artisan key:generate
php artisan migrate
php artisan serve

# Frontend (React)
npm install
npm run dev
```

### 2. Tạo Workflow

1. Đăng nhập → `/workflows`
2. Tạo workflow mới
3. Click vào workflow để edit
4. Thêm nodes:
   - **Webhook Node**: Điểm bắt đầu
   - **HTTP Request Node**: Gửi HTTP requests
5. Connect nodes bằng cách kéo từ output handle → input handle
6. Click **Save** để lưu workflow structure
7. **Activate** workflow để kích hoạt

### 3. Cấu hình Webhook

1. Right-click vào Webhook node → Configure
2. Điền:
   - **Path**: `/my-webhook` (URL sẽ là `http://your-domain/api/webhook/my-webhook`)
   - **Method**: GET/POST/PUT/DELETE
   - **Auth**: None/Basic/Bearer
   - **Credential**: Token nếu cần

### 4. Cấu hình HTTP Request Node

1. Right-click vào HTTP Request node → Configure
2. Điền config:
   - **Method**: GET/POST/PUT/PATCH/DELETE
   - **URL**: API endpoint
   - **Authentication**: Bearer Token, Basic Auth, Custom Header
   - **Query Parameters**: Add key-value pairs
   - **Headers**: Custom headers
   - **Body**: For POST/PUT/PATCH (JSON, Form-Data, etc.)
3. **Sử dụng data từ node trước**:
   - Ở INPUT panel, click "Use" để insert `{{variable.path}}`
   - Hoặc kéo "Use" button vào input field
   - Ví dụ: `{{input-0.body.user_id}}`
4. Click **Test step** để test node
5. Đóng modal để auto-save config

### 5. Trigger Webhook từ External Service

```bash
# Ví dụ gọi webhook
curl -X POST http://localhost:8000/api/webhook/my-webhook \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "age": 30}'
```

**Khi này:**
- Backend **tự động nhận request**
- **Execute workflow** tuần tự theo mũi tên
- **HTTP Request nodes** sẽ gửi request với data đã config
- **Variables** `{{variable}}` được resolve từ webhook input
- **Response** được trả về

## Luồng chạy (Flow)

### Ví dụ workflow:

```
Webhook → HTTP Request 1 → HTTP Request 2 → HTTP Request 3
```

1. **External service** gọi `/api/webhook/my-webhook`
2. **Webhook Node** nhận data → output: `{body: {user_id: 123}}`
3. **HTTP Request 1**: Gọi API với `{{input-0.body.user_id}}`
4. **HTTP Request 2**: Nhận output từ HTTP Request 1
5. **HTTP Request 3**: Nhận output từ HTTP Request 2
6. Trả về kết quả

### Luồng xử lý trong Backend:

```php
1. WebhookController::handle()
2. → executeWorkflow()
3. → buildExecutionOrder() // Build tuần tự từ edges
4. → For each node:
     - getNodeInputData() // Lấy output từ node trước
     - executeNode() // Thực thi node
     - Store output
5. → Return results
```

## Database Schema

### `workflows` table
- `id`, `user_id`, `name`, `description`
- `nodes`: JSON (node positions, types)
- `edges`: JSON (connections between nodes)
- `active`: Boolean

### `workflow_nodes` table
- `id`, `workflow_id`, `node_id`, `type`
- `config`: JSON (node configuration)

### `users` table
- `id`, `name`, `email`, `password`
- `role`: 'admin' | 'user'

## API Endpoints

### Public
- `POST /api/register`
- `POST /api/login`
- `ANY /api/webhook/{path}`

### Protected (require auth)
- `GET /api/workflows` - List workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/{id}` - Get workflow
- `PUT /api/workflows/{id}` - Update workflow
- `DELETE /api/workflows/{id}` - Delete workflow
- `POST /api/workflows/{id}/nodes` - Save node config

### Admin only
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/{id}` - Update user
- `DELETE /api/users/{id}` - Delete user

## Features tương tự n8n

✅ Visual workflow editor với ReactFlow  
✅ Node-based programming  
✅ Webhook trigger  
✅ HTTP Request node với variable resolution  
✅ Sequential execution  
✅ Data flow between nodes  
✅ Configuration modals  
✅ Save/Load workflows  
✅ Active/Inactive toggle  

## Production Deployment

### Environment variables (.env)
```
APP_URL=https://your-domain.com
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=your_database
DB_USERNAME=your_username
DB_PASSWORD=your_password
```

### Build frontend
```bash
npm run build
```

### Laravel production
```bash
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### Queue Worker (optional)
```bash
php artisan queue:work
```

## Troubleshooting

### Webhook không chạy
- Kiểm tra workflow đã **Activate** chưa
- Kiểm tra webhook path có đúng không
- Xem logs: `storage/logs/laravel.log`

### HTTP Request fails
- Kiểm tra URL có hợp lệ
- Kiểm tra authentication credentials
- Kiểm tra variables đã được resolve chưa

### Variables không resolve
- Kiểm tra path `{{variable.path}}` có đúng format không
- Kiểm tra node trước có output data không
- Xem INPUT panel có hiển thị data không

## License

MIT

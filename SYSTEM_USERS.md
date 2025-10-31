# HỆ THỐNG TÀI KHOẢN CỐ ĐỊNH

Hệ thống Administrator App được cấu hình với **3 tài khoản cố định** duy nhất.

## 🔐 Thông Tin Đăng Nhập

### 1. Administrator (Quản trị viên cao cấp)
- **Email**: `administrator@chatplus.vn`
- **Password**: `Admin@2024`
- **Quyền**: Toàn quyền trên hệ thống (quản lý Projects, Folders, Workflows, Users)

### 2. Admin (Quản trị viên)
- **Email**: `admin@chatplus.vn`
- **Password**: `Admin@2024`
- **Quyền**: Quản lý Folders, Workflows, Users (không có quyền Projects)

### 3. User (Người dùng thường)
- **Email**: `user@chatplus.vn`
- **Password**: `User@2024`
- **Quyền**: Sử dụng hệ thống với quyền hạn cơ bản

## 🛡️ Bảo Vệ Tài Khoản

### Tài khoản KHÔNG THỂ XÓA:
- ✅ Administrator (`administrator@chatplus.vn`)
- ✅ Admin (`admin@chatplus.vn`)

### Tài khoản CÓ THỂ XÓA:
- ❌ User (`user@chatplus.vn`) - có thể xóa và tạo lại

### Hạn chế:
- **Email của Administrator và Admin KHÔNG THỂ thay đổi**
- **Tên và mật khẩu CÓ THỂ thay đổi**
- **Đăng ký tài khoản mới đã bị vô hiệu hóa**

## 🔄 Khởi Tạo Lại Tài Khoản

Nếu cần khởi tạo lại 3 tài khoản cố định:

```bash
cd /var/www/laravel-react-app-n8n-administrator
php artisan db:seed --class=SystemUsersSeeder --force
```

Lệnh này sẽ:
- Tạo mới 3 tài khoản nếu chưa tồn tại
- Cập nhật thông tin nếu đã tồn tại
- Reset về mật khẩu mặc định

## 📝 Ghi Chú

1. **Bảo mật**: Nên đổi mật khẩu mặc định sau khi đăng nhập lần đầu
2. **Backup**: Luôn backup database trước khi thao tác với users
3. **Production**: Hệ thống đang ở chế độ production, cần `--force` flag cho các lệnh artisan

## 🔧 Kỹ Thuật

### Files đã thay đổi:
- `app/Models/User.php` - Thêm method `isProtectedUser()`
- `app/Http/Controllers/Api/UserController.php` - Ngăn xóa/sửa email protected users
- `app/Http/Controllers/Api/AuthController.php` - Vô hiệu hóa đăng ký
- `database/seeders/SystemUsersSeeder.php` - Seeder tạo 3 tài khoản
- `database/seeders/DatabaseSeeder.php` - Gọi SystemUsersSeeder
- `resources/js/components/AdministratorDashboard/UsersTab.jsx` - UI bảo vệ users

### Protected Emails:
```php
protected $protectedEmails = [
    'administrator@chatplus.vn',
    'admin@chatplus.vn',
];
```


<x-mail::message>
# Thông báo đơn hàng thanh toán gói cước

Xin chào Quản trị viên,

Khách hàng đã xác nhận thanh toán và yêu cầu tạo đơn hàng với thông tin sau:

## Thông tin khách hàng
- **Tên:** {{ $user->name }}
- **Email:** {{ $user->email }}
- **Số điện thoại:** {{ $user->phone ?? 'Chưa cập nhật' }}

## Thông tin gói cước
- **Tên gói:** {{ $package->name }}
- **Mô tả:** {{ $package->description ?? 'Không có mô tả' }}
- **Giá:** {{ number_format($package->price, 0, ',', '.') }} VNĐ
- **Thời hạn:** {{ $package->duration_days ? $package->duration_days . ' ngày' : 'Không giới hạn' }}
- **Số workflows chạy song song:** {{ $package->max_concurrent_workflows ?? 'Không giới hạn' }}
- **Số workflows có thể tạo thêm:** {{ $package->max_user_workflows ?? 'Không giới hạn' }}

## Thông tin đơn hàng
- **Mã đơn hàng:** {{ $order->uuid }}
- **Loại đơn:** {{ $orderType === 'new' ? 'Đăng ký mới' : ($orderType === 'renewal' ? 'Gia hạn' : 'Thay đổi gói') }}
- **Số tiền:** {{ number_format($amount, 0, ',', '.') }} VNĐ

Vui lòng đăng nhập vào hệ thống quản trị để duyệt đơn hàng này.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>

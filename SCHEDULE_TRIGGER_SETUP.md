# Schedule Trigger Setup Guide

## Tổng quan

Schedule Trigger là node khởi đầu tự động kích hoạt workflow theo lịch trình định sẵn, không cần bên ngoài gọi vào như Webhook.

## Cấu hình Cron Job

Để Schedule Trigger hoạt động, bạn cần cron job chạy Laravel Scheduler.

### Tự động (Khuyến nghị ⭐)

**Chỉ cần restart queue workers, cron sẽ tự động được setup:**

```bash
cd /var/www
./restart-queue.sh both
```

Script này sẽ tự động:
- ✅ Check và thêm cron job nếu chưa có
- ✅ Restart queue workers
- ✅ Setup hoàn chỉnh trong 1 lệnh!

### Thủ công

Nếu muốn setup riêng:

```bash
crontab -e
# Thêm dòng:
* * * * * cd /var/www/laravel-react-app-n8n-administrator && php artisan schedule:run >> /dev/null 2>&1
```

### Verify cron đang chạy

```bash
crontab -l | grep schedule
```

## Kiểm tra thủ công

Test command trực tiếp:

```bash
cd /var/www/laravel-react-app-n8n-administrator
php artisan workflows:check-schedules
```

## Cách sử dụng Schedule Trigger

1. **Tạo node Schedule Trigger** trong workflow editor (menu Add Node → ⏰ Schedule Trigger)
2. **Config lịch trình:**
   - **Simple Interval**: Mỗi X phút/giờ/ngày/tuần/tháng
   - **Cron Expression**: Lịch trình phức tạp (ví dụ: `0 9 * * 1` = Thứ 2 hàng tuần lúc 9:00)
3. **Connect với các nodes khác** (HTTP Request, AI, Code, ...)
4. **Activate workflow** (quan trọng!)
5. Workflow sẽ tự động chạy theo lịch

## Ví dụ Intervals

- **Mỗi 15 phút**: interval = minutes, intervalValue = 15
- **Mỗi 2 giờ**: interval = hours, intervalValue = 2  
- **Mỗi ngày lúc 9:00**: interval = days, intervalValue = 1, triggerAt = { hour: 9, minute: 0 }
- **Mỗi tuần lúc Thứ 2 9:00**: interval = weeks, intervalValue = 1, triggerAt = { hour: 9, minute: 0 }

## Ví dụ Cron Expressions

- `0 * * * *`: Mỗi giờ (phút 0)
- `*/15 * * * *`: Mỗi 15 phút
- `0 9 * * *`: Mỗi ngày lúc 9:00
- `0 9 * * 1`: Mỗi thứ 2 lúc 9:00
- `0 9 1 * *`: Ngày đầu tháng lúc 9:00

## Lịch sử chạy (Execution History)

✅ **Schedule Trigger tự động lưu vào lịch sử!**

Mỗi lần workflow được trigger bởi schedule, hệ thống sẽ tạo execution record với:
- `trigger_type` = `'schedule'`
- `status` = `'running'` → `'completed'` hoặc `'error'`
- `input_data` = Thông tin trigger (thời gian, lịch trình...)
- `output_data` = Kết quả từ workflow
- Timestamps: `started_at`, `completed_at`

**Xem lịch sử trong UI:**
1. Vào workflow editor
2. Click tab **"History"** (bên cạnh Editor)
3. Xem tất cả lần chạy, lọc theo trigger type

**Hoặc query database:**
```sql
SELECT * FROM workflow_executions 
WHERE trigger_type = 'schedule' 
ORDER BY created_at DESC;
```

## Monitoring

**Check logs:**

```bash
tail -f /var/www/laravel-react-app-n8n-administrator/storage/logs/laravel.log | grep -i schedule
```

**Check executions:**
```bash
php artisan tinker
>>> App\Models\WorkflowExecution::where('trigger_type', 'schedule')->latest()->take(5)->get();
```

## Troubleshooting

**Workflow không chạy tự động?**
1. Check cron đã setup: `crontab -l`
2. Check workflow có active không
3. Check logs: `tail -f storage/logs/laravel.log`
4. Test thủ công: `php artisan workflows:check-schedules`

**Workflow chạy sai thời gian?**
1. Check timezone trong Schedule Trigger config
2. Check server timezone: `date`
3. Adjust timezone nếu cần

## Architecture

```
Cron (every minute)
   ↓
Laravel Scheduler
   ↓
Command: workflows:check-schedules
   ↓
Check all active workflows
   ↓
Find workflows với Schedule Trigger nodes
   ↓
Check if schedule matches current time
   ↓
Execute workflow via WebhookController
   ↓
Workflow runs like normal automation
```


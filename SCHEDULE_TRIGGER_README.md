# ⏰ Schedule Trigger - Quick Start

## Setup (1 lần duy nhất)

```bash
cd /var/www
./restart-queue.sh both
```

✅ **Xong!** Cron job đã được setup tự động.

## Cách dùng

1. **Tạo node Schedule Trigger** trong workflow editor
2. **Config lịch trình:**
   - Simple: Mỗi X phút/giờ/ngày/tuần/tháng
   - Cron: Lịch phức tạp (ví dụ: `0 9 * * 1` = Thứ 2 lúc 9:00)
3. **Connect nodes** tiếp theo
4. **Activate workflow** ⭐
5. **Done!** Workflow tự chạy theo lịch

## Ví dụ

**Báo cáo hàng ngày lúc 9:00:**
- Interval: Days
- Value: 1
- Hour: 9, Minute: 0

**Crawl mỗi 30 phút:**
- Interval: Minutes  
- Value: 30

## Lịch sử chạy

✅ **Tự động lưu vào History!**

Mỗi lần Schedule Trigger chạy → Tạo execution record:
- Trigger Type: `schedule`
- Status: `running` → `completed`/`error`
- Input/Output data đầy đủ

**Xem trong UI:**
- Tab **History** trong workflow editor
- Lọc theo trigger type = schedule

## Verify

```bash
# Check cron
crontab -l | grep schedule

# Test manual
php artisan workflows:check-schedules

# Monitor logs
tail -f storage/logs/laravel.log | grep -i schedule

# Check executions
php artisan tinker
>>> App\Models\WorkflowExecution::where('trigger_type', 'schedule')->latest()->get();
```

## Quan trọng

- ✅ Workflow phải **Active**
- ✅ Cron đã setup (tự động qua restart-queue.sh)
- ✅ Laravel Scheduler chạy mỗi phút
- ✅ Command check workflows theo lịch

---

**📖 Chi tiết:** Xem `SCHEDULE_TRIGGER_SETUP.md`


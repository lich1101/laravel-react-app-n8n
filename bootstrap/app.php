<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Console\Scheduling\Schedule;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Register admin key authentication middleware
        $middleware->alias([
            'admin.key' => \App\Http\Middleware\AuthenticateWithAdminKey::class,
            'check.subscription' => \App\Http\Middleware\CheckSubscriptionExpiry::class,
        ]);
        
        // Apply subscription expiry check to web routes
        $middleware->appendToGroup('web', [
            \App\Http\Middleware\CheckSubscriptionExpiry::class,
        ]);
        
        // Configure Authenticate middleware to redirect to /login instead of route('login')
        $middleware->redirectGuestsTo(fn () => '/login');
    })
    ->withSchedule(function (Schedule $schedule): void {
        // Check scheduled workflows every minute
        $schedule->command('workflows:check-schedules')
            ->everyMinute()
            ->withoutOverlapping()
            ->runInBackground();
        
        // Cleanup stuck executions every 5 minutes
        $schedule->command('queue:cleanup-stuck --timeout=300')
            ->everyFiveMinutes()
            ->withoutOverlapping()
            ->runInBackground();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();

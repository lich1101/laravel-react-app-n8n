<?php

use App\Http\Controllers\Api\AutomationCallbackController;
use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;

Route::match(['get', 'post'], '/automation-{slug}/{path}/{uuid}', [AutomationCallbackController::class, 'handle'])
    ->withoutMiddleware([VerifyCsrfToken::class])
    ->where([
        'slug' => '[A-Za-z0-9\-]+',
        'path' => '[A-Za-z0-9\-]+',
        'uuid' => '[0-9a-fA-F\-]{36}',
    ]);

// Catch all routes for React Router
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');

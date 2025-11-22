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

// Serve static icons before catch-all route
Route::get('/icons/{path}', function ($path) {
    $filePath = public_path('icons/' . $path);
    if (file_exists($filePath) && is_file($filePath)) {
        $mimeType = mime_content_type($filePath);
        return response()->file($filePath, ['Content-Type' => $mimeType]);
    }
    abort(404);
})->where('path', '.*');

// Catch all routes for React Router
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');

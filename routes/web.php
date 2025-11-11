<?php

use App\Http\Controllers\Api\AutomationCallbackController;
use Illuminate\Support\Facades\Route;

Route::match(['get', 'post'], '/{slug}/{path}/{uuid}', [AutomationCallbackController::class, 'handle'])
    ->where([
        'slug' => 'automation-[A-Za-z0-9\-]+',
        'path' => '[A-Za-z0-9\-]+',
        'uuid' => '[0-9a-fA-F\-]{36}',
    ]);

// Catch all routes for React Router
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');

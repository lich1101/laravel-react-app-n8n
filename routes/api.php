<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\WorkflowController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Api\FolderController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectFolderController;

// Public routes
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::apiResource('users', UserController::class);
    Route::apiResource('workflows', WorkflowController::class);
    Route::post('/workflows/{workflow}/nodes', [WorkflowController::class, 'saveNode']);
    Route::get('/workflows/{workflow}/executions', [WorkflowController::class, 'executions']);
    Route::get('/workflows/{workflow}/executions/{execution}', [WorkflowController::class, 'execution']);

    // Webhook test routes
    Route::post('/workflows/{workflow}/webhook-test-listen', [WebhookController::class, 'startTestListen']);
    Route::get('/workflows/{workflow}/webhook-test-status/{testRunId}', [WebhookController::class, 'getTestStatus']);
    Route::post('/workflows/{workflow}/webhook-test-stop/{testRunId}', [WebhookController::class, 'stopTestListen']);

    // Folder routes (administrator only)
    Route::apiResource('folders', FolderController::class);
    Route::post('/folders/{folder}/add-workflows', [FolderController::class, 'addWorkflows']);
    Route::post('/folders/{folder}/remove-workflows', [FolderController::class, 'removeWorkflows']);
    Route::post('/folders/{folder}/assign-projects', [FolderController::class, 'assignToProjects']);
    Route::post('/folders/{folder}/sync', [FolderController::class, 'syncFolder']);

    // Project routes (administrator only)
    Route::apiResource('projects', ProjectController::class);

    // Project folder routes (for project domains)
    Route::post('/project-folders', [ProjectFolderController::class, 'createFolder']);
    Route::put('/project-folders/{folderId}', [ProjectFolderController::class, 'updateFolder']);
    Route::delete('/project-folders/{folderId}', [ProjectFolderController::class, 'deleteFolder']);
});

// Webhook routes - these should be public and handle dynamic paths
Route::any('/webhook/{path}', [\App\Http\Controllers\Api\WebhookController::class, 'handle'])
    ->where('path', '.*');

// Test webhook route - separate from production webhooks
Route::any('/webhook-test/{path}', [\App\Http\Controllers\Api\WebhookController::class, 'handleTest'])
    ->where('path', '.*');


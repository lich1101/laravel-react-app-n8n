<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\WorkflowController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Api\FolderController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectFolderController;
use App\Http\Controllers\Api\ProjectConfigController;
use App\Http\Controllers\Api\CredentialController;
use App\Http\Controllers\Api\SystemSettingController;
use App\Http\Controllers\Api\AutomationFieldController;
use App\Http\Controllers\Api\AutomationRowController;
use App\Http\Controllers\Api\AutomationStatusController;
use App\Http\Controllers\Api\AutomationTableController;
use App\Http\Controllers\Api\AutomationTopicController;

// Public routes
Route::get('/registration-status', [AuthController::class, 'registrationStatus']);
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::get('/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])
    ->middleware('signed')
    ->name('verification.verify');
Route::post('/forgot-password', [PasswordResetController::class, 'sendResetLinkEmail']);
Route::post('/reset-password', [PasswordResetController::class, 'resetPassword']);

// OAuth2 callback (public - no auth required as Google redirects here)
Route::get('/oauth2/callback', [CredentialController::class, 'handleOAuth2Callback']);

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
    Route::post('/workflows/{workflow}/executions/{execution}/resume', [WorkflowController::class, 'resumeExecution']);
    Route::delete('/workflows/{workflow}/executions', [WorkflowController::class, 'bulkDeleteExecutions']);
    Route::delete('/workflows/{workflow}/executions/{execution}', [WorkflowController::class, 'deleteExecution']);
    
    // Node testing route (avoids CORS for Claude API)
    Route::post('/workflows/test-node', [WorkflowController::class, 'testNode']);

    // Gemini routes
    Route::post('/gemini/get-models', [WebhookController::class, 'getGeminiModels']);
    
    // Google Sheets routes
    Route::post('/google-sheets/get-columns', [WebhookController::class, 'getGoogleSheetsColumns']);

    // Webhook test routes
    Route::post('/workflows/{workflow}/webhook-test-listen', [WebhookController::class, 'startTestListen']);
    Route::get('/workflows/{workflow}/webhook-test-status/{testRunId}', [WebhookController::class, 'getTestStatus']);
    Route::post('/workflows/{workflow}/webhook-test-stop/{testRunId}', [WebhookController::class, 'stopTestListen']);
    
    // Webhook path validation
    Route::post('/webhook/check-path-duplicate', [WebhookController::class, 'checkPathDuplicate']);

    // Folder routes (administrator only)
    Route::apiResource('folders', FolderController::class);
    Route::post('/folders/{folder}/add-workflows', [FolderController::class, 'addWorkflows']);
    Route::post('/folders/{folder}/remove-workflows', [FolderController::class, 'removeWorkflows']);
    Route::post('/folders/{folder}/assign-projects', [FolderController::class, 'assignToProjects']);
    Route::post('/folders/{folder}/sync', [FolderController::class, 'syncFolder']);

    // Project routes (administrator only)
    Route::post('/projects/{project}/sync', [ProjectController::class, 'sync']);
    Route::apiResource('projects', ProjectController::class);

    // Project folder routes (for regular authenticated users)
    Route::get('/project-folders', [ProjectFolderController::class, 'getFolders']);
    Route::post('/project-folders/user-create', [ProjectFolderController::class, 'userCreateFolder']);
    Route::put('/project-folders/{folderId}/user-update', [ProjectFolderController::class, 'userUpdateFolder']);
    Route::delete('/project-folders/{folderId}/user-delete', [ProjectFolderController::class, 'userDeleteFolder']);
    
    // System settings routes (administrator only)
    Route::get('/system-settings', [SystemSettingController::class, 'index']);
    Route::put('/system-settings/{key}', [SystemSettingController::class, 'update']);
    
    // Credential routes
    // IMPORTANT: Specific routes must come BEFORE apiResource
    Route::post('/credentials/test-oauth2', [CredentialController::class, 'testOAuth2']);
    Route::post('/credentials/{credential}/test', [CredentialController::class, 'test']);
    Route::get('/credentials/{credential}/oauth2/authorize', [CredentialController::class, 'startOAuth2Authorization']);
    Route::post('/credentials/oauth2/authorize', [CredentialController::class, 'startOAuth2Authorization']);
    Route::apiResource('credentials', CredentialController::class);

    // Automation module routes
    Route::prefix('automation')->group(function () {
        Route::apiResource('topics', AutomationTopicController::class);

        Route::get('/tables', [AutomationTableController::class, 'index']);
        Route::post('/tables', [AutomationTableController::class, 'store']);
        Route::get('/tables/{automationTable}', [AutomationTableController::class, 'show']);
        Route::put('/tables/{automationTable}', [AutomationTableController::class, 'update']);
        Route::delete('/tables/{automationTable}', [AutomationTableController::class, 'destroy']);

        Route::get('/tables/{automationTable}/fields', [AutomationFieldController::class, 'index']);
        Route::post('/tables/{automationTable}/fields', [AutomationFieldController::class, 'store']);
        Route::put('/tables/{automationTable}/fields/{automationField}', [AutomationFieldController::class, 'update']);
        Route::delete('/tables/{automationTable}/fields/{automationField}', [AutomationFieldController::class, 'destroy']);

        Route::get('/tables/{automationTable}/statuses', [AutomationStatusController::class, 'index']);
        Route::post('/tables/{automationTable}/statuses', [AutomationStatusController::class, 'store']);
        Route::put('/tables/{automationTable}/statuses/{automationStatus}', [AutomationStatusController::class, 'update']);
        Route::delete('/tables/{automationTable}/statuses/{automationStatus}', [AutomationStatusController::class, 'destroy']);

        Route::get('/tables/{automationTable}/rows', [AutomationRowController::class, 'index']);
        Route::post('/tables/{automationTable}/rows', [AutomationRowController::class, 'store']);
        Route::get('/tables/{automationTable}/rows/{automationRow}', [AutomationRowController::class, 'show']);
        Route::put('/tables/{automationTable}/rows/{automationRow}', [AutomationRowController::class, 'update']);
        Route::delete('/tables/{automationTable}/rows/{automationRow}', [AutomationRowController::class, 'destroy']);
        Route::post('/tables/{automationTable}/rows/bulk-delete', [AutomationRowController::class, 'bulkDestroy']);
        Route::post('/tables/{automationTable}/rows/{automationRow}/status', [AutomationRowController::class, 'updateStatus']);
        Route::post('/tables/{automationTable}/rows/{automationRow}/resend', [AutomationRowController::class, 'resendWebhook']);
        Route::get('/tables/{automationTable}/rows/export', [AutomationRowController::class, 'export']);
    });
});

// Project folder management routes (for Administrator app using admin key)
Route::middleware('admin.key')->group(function () {
    Route::post('/project-folders', [ProjectFolderController::class, 'createFolder']);
    Route::put('/project-folders/{folderId}', [ProjectFolderController::class, 'updateFolder']);
    Route::delete('/project-folders/{folderId}', [ProjectFolderController::class, 'deleteFolder']);
    
    // Project config management (called from project domains)
    Route::get('/project-config', [ProjectConfigController::class, 'getConfig']);
    Route::post('/project-config/sync', [ProjectConfigController::class, 'updateLocalConfig']);
});

// Webhook routes - these should be public and handle dynamic paths
Route::any('/webhook/{path}', [\App\Http\Controllers\Api\WebhookController::class, 'handle'])
    ->where('path', '.*');

// Test webhook route - separate from production webhooks
Route::any('/webhook-test/{path}', [\App\Http\Controllers\Api\WebhookController::class, 'handleTest'])
    ->where('path', '.*');


<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Intel\FindingController;
use App\Http\Controllers\Api\Intel\SubjectController;
use App\Http\Controllers\Api\Metis\AiProviderController;
use App\Http\Controllers\Api\Metis\AdminUserController;
use App\Http\Controllers\Api\Metis\AuditLogController;
use App\Http\Controllers\Api\Metis\EntityController;
use App\Http\Controllers\Api\Metis\IntelController;
use App\Http\Controllers\Api\Metis\JobRunController;
use App\Http\Controllers\Api\Metis\ModuleController;
use App\Http\Controllers\Api\Metis\OverrideController;
use App\Http\Controllers\Api\Metis\ProjectController;
use App\Http\Controllers\Api\Metis\ReportController;
use App\Http\Controllers\Api\Metis\ReportTemplateController;
use App\Http\Controllers\Api\Metis\ScriptController;
use App\Http\Controllers\Api\Metis\ScopeController;
use App\Http\Controllers\Api\Metis\ToolsController;
use App\Http\Controllers\Api\Metis\WorkflowController;
use App\Http\Controllers\Api\Response\ActionRunController;
use App\Http\Controllers\Api\Response\PlaybookController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'app' => config('app.name'),
        'timestamp' => now()->toIso8601String(),
    ]);
});

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:auth');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);

    Route::prefix('intel')->group(function () {
        Route::get('/subjects', [SubjectController::class, 'index']);
        Route::post('/subjects', [SubjectController::class, 'store']);
        Route::put('/subjects/{subject}', [SubjectController::class, 'update']);
        Route::delete('/subjects/{subject}', [SubjectController::class, 'destroy']);

        Route::get('/findings', [FindingController::class, 'index']);
        Route::post('/findings/ingest', [FindingController::class, 'ingest']);
        Route::get('/findings/{finding}', [FindingController::class, 'show']);
        Route::post('/findings/{finding}/triage', [FindingController::class, 'triage']);
    });

    Route::prefix('response')->group(function () {
        Route::get('/playbooks', [PlaybookController::class, 'index']);
        Route::post('/playbooks', [PlaybookController::class, 'store']);
        Route::get('/playbooks/{playbook}', [PlaybookController::class, 'show']);
        Route::put('/playbooks/{playbook}', [PlaybookController::class, 'update']);
        Route::delete('/playbooks/{playbook}', [PlaybookController::class, 'destroy']);
        Route::post('/playbooks/{playbook}/test', [PlaybookController::class, 'test']);

        Route::get('/action-runs', [ActionRunController::class, 'index']);
        Route::post('/action-runs/{actionRun}/retry', [ActionRunController::class, 'retry']);
    });

    // =========================================================
    // METIS Command Center
    // =========================================================
    Route::prefix('metis')->group(function () {

        // Projects
        Route::get('/projects',                    [ProjectController::class, 'index']);
        Route::post('/projects',                   [ProjectController::class, 'store']);
        Route::get('/projects/{project}',          [ProjectController::class, 'show']);
        Route::put('/projects/{project}',          [ProjectController::class, 'update']);
        Route::delete('/projects/{project}',       [ProjectController::class, 'destroy']);
        Route::get('/projects/{project}/timeline', [ProjectController::class, 'timeline']);

        // Scope & Verification
        Route::get('/projects/{project}/scope',                                                  [ScopeController::class, 'show']);
        Route::put('/projects/{project}/scope',                                                  [ScopeController::class, 'update']);
        Route::post('/projects/{project}/scope/verify',                                          [ScopeController::class, 'initiateVerification']);
        Route::post('/projects/{project}/scope/verifications/{verification}/check',              [ScopeController::class, 'checkVerification']);
        Route::delete('/projects/{project}/scope/verifications/{verification}',                  [ScopeController::class, 'destroyVerification']);

        // Layers (all-in-one layers response)
        Route::get('/projects/{project}/layers',   [EntityController::class, 'layers']);

        // Domain entities
        Route::get('/projects/{project}/entities/domains',         [EntityController::class, 'domains']);
        Route::get('/projects/{project}/entities/domains/{domain}', [EntityController::class, 'showDomain']);

        // Host entities
        Route::get('/projects/{project}/entities/hosts',       [EntityController::class, 'hosts']);
        Route::get('/projects/{project}/entities/hosts/{host}', [EntityController::class, 'showHost']);

        // URL entities
        Route::get('/projects/{project}/entities/urls', [EntityController::class, 'urls']);
        Route::post('/projects/{project}/entities/dedupe-assistant', [EntityController::class, 'dedupeAssistant']);

        // Findings
        Route::get('/projects/{project}/findings',             [EntityController::class, 'findings']);
        Route::post('/projects/{project}/findings',            [EntityController::class, 'storeFinding']);
        Route::put('/projects/{project}/findings/{finding}',   [EntityController::class, 'updateFinding']);

        // Notes
        Route::post('/projects/{project}/notes', [EntityController::class, 'storeNote']);

        // Job Runs
        Route::get('/projects/{project}/runs',              [JobRunController::class, 'index']);
        Route::post('/projects/{project}/runs',             [JobRunController::class, 'dispatch']);
        Route::get('/projects/{project}/runs/{run}',        [JobRunController::class, 'show']);
        Route::post('/projects/{project}/runs/{run}/cancel', [JobRunController::class, 'cancel']);

        // Workflow Engine
        Route::get('/workflows', [WorkflowController::class, 'index']);
        Route::post('/workflows/sync-defaults', [WorkflowController::class, 'syncDefaults']);
        Route::get('/projects/{project}/workflow-runs', [WorkflowController::class, 'runs']);
        Route::post('/projects/{project}/workflow-runs', [WorkflowController::class, 'dispatch']);
        Route::get('/projects/{project}/workflow-runs/{workflowRun}', [WorkflowController::class, 'show']);

        // Custom Script Engine
        Route::get('/scripts/templates', [ScriptController::class, 'templates']);
        Route::post('/scripts/templates', [ScriptController::class, 'storeTemplate']);
        Route::put('/scripts/templates/{scriptTemplate}', [ScriptController::class, 'updateTemplate']);
        Route::post('/scripts/templates/{scriptTemplate}/duplicate', [ScriptController::class, 'duplicateTemplate']);
        Route::get('/projects/{project}/script-runs', [ScriptController::class, 'runs']);
        Route::post('/projects/{project}/script-runs', [ScriptController::class, 'dispatch']);
        Route::get('/projects/{project}/script-runs/{scriptRun}', [ScriptController::class, 'show']);
        Route::post('/projects/{project}/script-runs/{scriptRun}/interpret', [ScriptController::class, 'interpret']);

        // Emergency Override
        Route::get('/projects/{project}/overrides', [OverrideController::class, 'index']);
        Route::get('/projects/{project}/overrides/options', [OverrideController::class, 'options']);
        Route::post('/projects/{project}/overrides', [OverrideController::class, 'store']);
        Route::get('/projects/{project}/overrides/{override}', [OverrideController::class, 'show']);

        // Report Templates
        Route::get('/report-templates', [ReportTemplateController::class, 'index']);

        // Reports
        Route::get('/projects/{project}/report/json',        [ReportController::class, 'json']);
        Route::get('/projects/{project}/report/html',        [ReportController::class, 'html']);
        Route::get('/projects/{project}/report/pdf',         [ReportController::class, 'pdf']);
        Route::post('/projects/{project}/report/ai-summary', [ReportController::class, 'aiSummary']);
        Route::post('/projects/{project}/report/entity-summary', [ReportController::class, 'entitySummary']);

        // Audit Logs
        Route::get('/projects/{project}/audit-log', [AuditLogController::class, 'forProject']);
        Route::get('/projects/{project}/intel/hits', [IntelController::class, 'hits']);

        // Settings: AI Providers
        Route::get('/ai-providers',            [AiProviderController::class, 'index']);
        Route::post('/ai-providers',           [AiProviderController::class, 'store']);
        Route::put('/ai-providers/{aiProvider}', [AiProviderController::class, 'update']);
        Route::delete('/ai-providers/{aiProvider}', [AiProviderController::class, 'destroy']);

        // Settings: Users
        Route::get('/users', [AdminUserController::class, 'index']);
        Route::post('/users', [AdminUserController::class, 'store']);
        Route::put('/users/{user}', [AdminUserController::class, 'update']);

        // Tooling Catalog
        Route::get('/tools/catalog', [ToolsController::class, 'index']);
        Route::get('/modules', [ModuleController::class, 'index']);
        Route::put('/modules/{slug}', [ModuleController::class, 'update']);
        Route::get('/external-services', [ModuleController::class, 'index']);
        Route::put('/external-services/{slug}', [ModuleController::class, 'update']);
        Route::post('/external-services/{slug}/test', [ModuleController::class, 'testConnection']);
        Route::get('/external-services/docs', [ModuleController::class, 'docs']);

        // Global Audit Log (admin only)
        Route::get('/audit-log', [AuditLogController::class, 'index']);
    });
});

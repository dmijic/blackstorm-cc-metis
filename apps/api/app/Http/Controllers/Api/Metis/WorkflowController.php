<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Jobs\Metis\RunMetisWorkflowJob;
use App\Models\MetisAuditLog;
use App\Models\MetisProject;
use App\Models\MetisWorkflow;
use App\Models\MetisWorkflowRun;
use App\Services\Metis\EmergencyOverrideService;
use App\Services\Metis\WorkflowEngineService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkflowController extends Controller
{
    public function __construct(
        private readonly WorkflowEngineService $engine,
        private readonly EmergencyOverrideService $overrides,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->engine->syncDefaults($request->user()->id);

        $workflows = MetisWorkflow::query()
            ->with('nodes')
            ->where('active', true)
            ->when(
                $request->filled('project_id'),
                fn ($query) => $query->where(function ($nested) use ($request) {
                    $nested->whereNull('project_id')
                        ->orWhere('project_id', $request->integer('project_id'));
                }),
                fn ($query) => $query->whereNull('project_id')
            )
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $workflows]);
    }

    public function syncDefaults(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);

        $workflow = $this->engine->syncDefaults($request->user()->id);

        return response()->json(['data' => $workflow->load('nodes')]);
    }

    public function runs(Request $request, MetisProject $project): JsonResponse
    {
        $runs = $project->workflowRuns()
            ->with(['workflow:id,slug,name', 'creator:id,name', 'override:id,run_type,reason,target_summary,status,used_at'])
            ->orderByDesc('created_at')
            ->paginate(25);

        return response()->json($runs);
    }

    public function dispatch(Request $request, MetisProject $project): JsonResponse
    {
        $this->engine->syncDefaults($request->user()->id);

        $validated = $request->validate([
            'workflow_id' => ['nullable', 'integer'],
            'workflow_slug' => ['nullable', 'string'],
            'input' => ['nullable', 'array'],
            'override_id' => ['nullable', 'integer'],
        ]);

        abort_if(empty($validated['workflow_id']) && empty($validated['workflow_slug']), 422, 'workflow_id or workflow_slug is required.');

        $workflow = MetisWorkflow::query()
            ->when(
                ! empty($validated['workflow_id']),
                fn ($query) => $query->whereKey($validated['workflow_id']),
                fn ($query) => $query->where('slug', $validated['workflow_slug'])
            )
            ->where(function ($query) use ($project) {
                $query->whereNull('project_id')
                    ->orWhere('project_id', $project->id);
            })
            ->where('active', true)
            ->firstOrFail();

        $targets = collect([
            ...($project->scope?->root_domains ?? []),
            ...$project->domainEntities()->pluck('domain')->all(),
            ...$project->hostEntities()->pluck('hostname')->all(),
        ])->filter()->unique()->values()->all();

        $override = null;
        if (! empty($validated['override_id']) && $targets !== []) {
            $override = $this->overrides->resolveForRun(
                project: $project,
                user: $request->user(),
                overrideId: (int) $validated['override_id'],
                runType: 'workflow',
                targets: $targets,
                ip: $request->ip()
            );
        }

        $run = $this->engine->createRun(
            workflow: $workflow,
            project: $project,
            userId: $request->user()->id,
            input: $validated['input'] ?? [],
            override: $override
        );

        RunMetisWorkflowJob::dispatch($run->id);

        MetisAuditLog::record(
            action: 'workflow.queued',
            projectId: $project->id,
            userId: $request->user()->id,
            entityType: 'workflow_run',
            entityId: $run->id,
            meta: [
                'workflow_id' => $workflow->id,
                'workflow_slug' => $workflow->slug,
                'override_id' => $override?->id,
            ],
            ip: $request->ip()
        );

        return response()->json([
            'data' => $run->load(['workflow:id,slug,name', 'creator:id,name', 'override:id,reason,target_summary,status']),
        ], 201);
    }

    public function show(MetisProject $project, MetisWorkflowRun $workflowRun): JsonResponse
    {
        abort_if($workflowRun->project_id !== $project->id, 404);

        return response()->json([
            'data' => $workflowRun->load([
                'workflow.nodes',
                'creator:id,name',
                'override:id,run_type,reason,target_summary,status,used_at',
                'steps.workflowNode',
                'steps.usedJobRun',
                'variables',
            ]),
            'context' => $workflowRun->loadContext(),
            'steps' => $workflowRun->steps->map(fn ($step) => [
                'id' => $step->id,
                'key' => $step->key,
                'type' => $step->type,
                'status' => $step->status,
                'summary' => $step->summary_json,
                'used_override' => $step->used_override,
                'used_job_run_id' => $step->used_job_run_id,
                'output' => $step->loadOutput(),
                'started_at' => $step->started_at?->toIso8601String(),
                'finished_at' => $step->finished_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access required.');
    }
}

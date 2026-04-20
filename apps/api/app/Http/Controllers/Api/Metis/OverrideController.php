<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisEmergencyOverride;
use App\Models\MetisProject;
use App\Services\Metis\EmergencyOverrideService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OverrideController extends Controller
{
    public function __construct(
        private readonly EmergencyOverrideService $service,
    ) {}

    public function index(MetisProject $project): JsonResponse
    {
        $overrides = $project->overrides()
            ->with(['creator:id,name', 'confirmer:id,name'])
            ->orderByDesc('created_at')
            ->paginate(25);

        return response()->json($overrides);
    }

    public function options(Request $request, MetisProject $project): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        return response()->json([
            'data' => $this->service->optionsForProject($project),
        ]);
    }

    public function store(Request $request, MetisProject $project): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $validated = $request->validate([
            'run_type' => ['nullable', 'string', 'max:100'],
            'reason' => ['required', 'string', 'min:8'],
            'target_summary' => ['required', 'string', 'min:3'],
            'targets' => ['required', 'array', 'min:1'],
            'targets.*' => ['required', 'string'],
            'one_time' => ['sometimes', 'boolean'],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'confirmation_text' => ['required', 'string', 'min:4'],
        ]);

        abort_unless(
            strtoupper(trim($validated['confirmation_text'])) === 'OVERRIDE',
            422,
            'confirmation_text must equal OVERRIDE.'
        );

        $override = $this->service->create(
            project: $project,
            user: $request->user(),
            payload: $validated,
            ip: $request->ip()
        );

        return response()->json([
            'data' => $override->load(['creator:id,name', 'confirmer:id,name']),
        ], 201);
    }

    public function show(MetisProject $project, MetisEmergencyOverride $override): JsonResponse
    {
        abort_if($override->project_id !== $project->id, 404);

        return response()->json([
            'data' => $override->load(['creator:id,name', 'confirmer:id,name', 'workflowRuns', 'jobRuns']),
        ]);
    }

    private function ensureSuperAdmin(Request $request): void
    {
        abort_unless($request->user()?->isSuperAdmin(), 403, 'SuperAdmin access required.');
    }
}

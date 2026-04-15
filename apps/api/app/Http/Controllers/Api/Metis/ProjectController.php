<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisAuditLog;
use App\Models\MetisProject;
use App\Models\MetisScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $projects = MetisProject::query()
            ->with(['scope', 'creator'])
            ->withCount(['domainEntities', 'hostEntities', 'findingEntities', 'jobRuns'])
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), fn($q) => $q->whereRaw('LOWER(name) LIKE ?', ['%' . Str::lower($request->search) . '%']))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($projects);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'client'      => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'tags'        => ['nullable', 'array'],
            'tags.*'      => ['string', 'max:50'],
        ]);

        $project = MetisProject::create([
            ...$validated,
            'created_by' => $request->user()->id,
            'status'     => 'active',
        ]);

        // Bootstrap empty scope
        MetisScope::create(['project_id' => $project->id]);

        MetisAuditLog::record(
            action: 'project.created',
            projectId: $project->id,
            userId: $request->user()->id,
            meta: ['name' => $project->name],
            ip: $request->ip()
        );

        return response()->json(['data' => $project->load('scope')], 201);
    }

    public function show(MetisProject $project): JsonResponse
    {
        $project->load(['scope', 'creator', 'domainVerifications']);

        $stats = [
            'domains' => $project->domainEntities()->count(),
            'verified_domains' => $project->domainVerifications()->where('status', 'verified')->count(),
            'new_subdomains_7d' => $project->domainEntities()
                ->where('layer', 'discovery')
                ->where('first_seen', '>=', now()->subDays(7))
                ->count(),
            'live_hosts' => $project->hostEntities()->where('is_live', true)->count(),
            'urls' => $project->urlEntities()->count(),
            'open_findings' => $project->findingEntities()->where('status', 'open')->count(),
            'new_findings_7d' => $project->findingEntities()->where('created_at', '>=', now()->subDays(7))->count(),
            'jobs_failed' => $project->jobRuns()->where('status', 'failed')->count(),
        ];

        return response()->json(['data' => $project, 'stats' => $stats]);
    }

    public function update(Request $request, MetisProject $project): JsonResponse
    {
        $validated = $request->validate([
            'name'        => ['sometimes', 'string', 'max:255'],
            'client'      => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'tags'        => ['nullable', 'array'],
            'status'      => ['sometimes', 'in:active,archived,completed'],
        ]);

        $project->update($validated);

        MetisAuditLog::record(
            action: 'project.updated',
            projectId: $project->id,
            userId: $request->user()->id,
            meta: $validated,
            ip: $request->ip()
        );

        return response()->json(['data' => $project->fresh()]);
    }

    public function destroy(Request $request, MetisProject $project): JsonResponse
    {
        MetisAuditLog::record(
            action: 'project.deleted',
            projectId: $project->id,
            userId: $request->user()->id,
            meta: ['name' => $project->name],
            ip: $request->ip()
        );

        $project->delete();

        return response()->json(null, 204);
    }

    public function timeline(Request $request, MetisProject $project): JsonResponse
    {
        $from = $request->date('from', 'Y-m-d') ?? now()->subDays(30);
        $to   = $request->date('to', 'Y-m-d')   ?? now();

        $events = collect()
            ->merge(
                $project->domainEntities()
                    ->whereBetween('first_seen', [$from, $to])
                    ->select('id', 'domain as label', 'first_seen as occurred_at')
                    ->selectRaw("'domain_discovered' as event_type")
                    ->limit(200)
                    ->get()
            )
            ->merge(
                $project->findingEntities()
                    ->whereBetween('created_at', [$from, $to])
                    ->select('id', 'title as label', 'created_at as occurred_at', 'severity')
                    ->selectRaw("'finding_created' as event_type")
                    ->limit(100)
                    ->get()
            )
            ->merge(
                $project->jobRuns()
                    ->whereBetween('started_at', [$from, $to])
                    ->select('id', 'type as label', 'started_at as occurred_at', 'status')
                    ->selectRaw("'job_run' as event_type")
                    ->limit(100)
                    ->get()
            )
            ->sortByDesc('occurred_at')
            ->values();

        return response()->json(['data' => $events]);
    }
}

<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisAuditLog;
use App\Models\MetisDomainEntity;
use App\Models\MetisFindingEntity;
use App\Models\MetisHostEntity;
use App\Models\MetisNote;
use App\Models\MetisProject;
use App\Models\MetisUrlEntity;
use App\Services\Metis\AiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class EntityController extends Controller
{
    public function layers(Request $request, MetisProject $project): JsonResponse
    {
        $from = $request->date('from', 'Y-m-d');
        $to   = $request->date('to', 'Y-m-d');

        $domainQ = $project->domainEntities()->when($from, fn($q) => $q->where('last_seen', '>=', $from))
                                              ->when($to,   fn($q) => $q->where('last_seen', '<=', $to));
        $hostQ   = $project->hostEntities()->when($from, fn($q) => $q->where('last_seen', '>=', $from))
                                            ->when($to,   fn($q) => $q->where('last_seen', '<=', $to));

        return response()->json([
            'scope' => [
                'count'        => $project->domainEntities()->where('layer', 'scope')->count(),
                'last_updated' => $project->domainEntities()->where('layer', 'scope')->max('updated_at'),
                'items'        => $project->domainEntities()->where('layer', 'scope')->orderBy('domain')->limit(500)->get(),
            ],
            'discovery' => [
                'count'        => $domainQ->clone()->where('layer', 'discovery')->count(),
                'last_updated' => $domainQ->clone()->where('layer', 'discovery')->max('updated_at'),
                'items'        => $domainQ->clone()->where('layer', 'discovery')->orderBy('domain')->limit(500)->get(),
            ],
            'live' => [
                'count'        => $hostQ->clone()->where('is_live', true)->count(),
                'last_updated' => $hostQ->clone()->where('is_live', true)->max('updated_at'),
                'items'        => $hostQ->clone()->where('is_live', true)->orderBy('hostname')->limit(500)->get(),
            ],
            'history' => [
                'count'        => $project->urlEntities()->count(),
                'last_updated' => $project->urlEntities()->max('updated_at'),
                'items'        => $project->urlEntities()->orderByDesc('first_seen')->limit(200)->get(),
            ],
            'findings' => [
                'count'        => $project->findingEntities()->where('status', 'open')->count(),
                'last_updated' => $project->findingEntities()->max('updated_at'),
                'items'        => $project->findingEntities()->orderByDesc('created_at')->limit(200)->get(),
            ],
            'notes' => [
                'count'        => $project->notes()->count(),
                'last_updated' => $project->notes()->max('updated_at'),
                'items'        => $project->notes()->with('creator:id,name')->orderByDesc('created_at')->limit(100)->get(),
            ],
        ]);
    }

    // --- Domains ---
    public function domains(Request $request, MetisProject $project): JsonResponse
    {
        $q = $project->domainEntities()
            ->when($request->filled('layer'),   fn($q) => $q->where('layer', $request->layer))
            ->when($request->filled('search'),  fn($q) => $q->whereRaw('LOWER(domain) LIKE ?', ['%' . Str::lower($request->search) . '%']))
            ->when($request->boolean('verified_only'), fn($q) => $q->where('verified', true))
            ->orderBy('domain');

        return response()->json($q->paginate(100));
    }

    public function showDomain(MetisProject $project, MetisDomainEntity $domain): JsonResponse
    {
        abort_if($domain->project_id !== $project->id, 404);

        $related = MetisHostEntity::where('project_id', $project->id)
            ->where('hostname', 'like', "%{$domain->domain}")
            ->limit(20)
            ->get();

        $notes = MetisNote::where('project_id', $project->id)
            ->where('entity_type', 'domain_entity')
            ->where('entity_id', $domain->id)
            ->with('creator:id,name')
            ->get();

        return response()->json([
            'data'    => $domain,
            'related' => $related,
            'notes'   => $notes,
        ]);
    }

    // --- Hosts ---
    public function hosts(Request $request, MetisProject $project): JsonResponse
    {
        $q = $project->hostEntities()
            ->when($request->filled('search'),     fn($q) => $q->whereRaw('LOWER(hostname) LIKE ?', ['%' . Str::lower($request->search) . '%']))
            ->when($request->boolean('live_only'), fn($q) => $q->where('is_live', true))
            ->orderBy('hostname');

        return response()->json($q->paginate(100));
    }

    public function showHost(MetisProject $project, MetisHostEntity $host): JsonResponse
    {
        abort_if($host->project_id !== $project->id, 404);

        $notes = MetisNote::where('project_id', $project->id)
            ->where('entity_type', 'host_entity')
            ->where('entity_id', $host->id)
            ->with('creator:id,name')
            ->get();

        $findings = MetisFindingEntity::where('project_id', $project->id)
            ->where('affected_entity_type', 'host_entity')
            ->where('affected_entity_id', $host->id)
            ->get();

        return response()->json([
            'data'     => $host,
            'notes'    => $notes,
            'findings' => $findings,
        ]);
    }

    // --- URLs ---
    public function urls(Request $request, MetisProject $project): JsonResponse
    {
        $q = $project->urlEntities()
            ->when($request->filled('source'), fn($q) => $q->where('source', $request->source))
            ->when($request->filled('search'), fn($q) => $q->whereRaw('LOWER(url) LIKE ?', ['%' . Str::lower($request->search) . '%']))
            ->orderByDesc('first_seen');

        return response()->json($q->paginate(200));
    }

    public function dedupeAssistant(Request $request, MetisProject $project, AiService $aiService): JsonResponse
    {
        $entities = $project->domainEntities()
            ->get(['id', 'domain', 'layer', 'verified'])
            ->map(fn ($entity) => [
                'id' => "domain-{$entity->id}",
                'entity_type' => 'domain',
                'value' => $entity->domain,
                'layer' => $entity->layer,
                'verified' => $entity->verified,
            ])
            ->merge(
                $project->hostEntities()
                    ->get(['id', 'hostname', 'ip', 'http_status'])
                    ->map(fn ($entity) => [
                        'id' => "host-{$entity->id}",
                        'entity_type' => 'host',
                        'value' => $entity->hostname,
                        'ip' => $entity->ip,
                        'http_status' => $entity->http_status,
                    ])
            )
            ->values()
            ->all();

        $suggestions = $aiService->dedupeAssistant($entities);

        return response()->json(['data' => $suggestions]);
    }

    // --- Findings ---
    public function findings(Request $request, MetisProject $project): JsonResponse
    {
        $q = $project->findingEntities()
            ->when($request->filled('severity'), fn($q) => $q->where('severity', $request->severity))
            ->when($request->filled('status'),   fn($q) => $q->where('status', $request->status))
            ->when($request->filled('search'),   fn($q) => $q->whereRaw('LOWER(title) LIKE ?', ['%' . Str::lower($request->search) . '%']))
            ->orderByDesc('created_at');

        return response()->json($q->paginate(100));
    }

    public function storeFinding(Request $request, MetisProject $project): JsonResponse
    {
        $validated = $request->validate([
            'type'                => ['required', 'string'],
            'severity'            => ['required', 'in:info,low,medium,high,critical'],
            'title'               => ['required', 'string', 'max:500'],
            'summary'             => ['nullable', 'string'],
            'confidence'          => ['required', 'in:low,medium,high'],
            'evidence_json'       => ['nullable', 'array'],
            'affected_entity_type'=> ['nullable', 'string'],
            'affected_entity_id'  => ['nullable', 'integer'],
        ]);

        $finding = MetisFindingEntity::create([
            ...$validated,
            'project_id' => $project->id,
            'status'     => 'open',
        ]);

        MetisAuditLog::record(
            action: 'finding.created',
            projectId: $project->id,
            userId: $request->user()->id,
            entityType: 'finding_entity',
            entityId: $finding->id,
            meta: ['severity' => $finding->severity, 'type' => $finding->type],
            ip: $request->ip()
        );

        return response()->json(['data' => $finding], 201);
    }

    public function updateFinding(Request $request, MetisProject $project, MetisFindingEntity $finding): JsonResponse
    {
        abort_if($finding->project_id !== $project->id, 404);

        $validated = $request->validate([
            'status'    => ['sometimes', 'in:open,in_review,resolved,accepted_risk'],
            'severity'  => ['sometimes', 'in:info,low,medium,high,critical'],
            'title'     => ['sometimes', 'string', 'max:500'],
            'summary'   => ['nullable', 'string'],
        ]);

        $finding->update($validated);

        MetisAuditLog::record(
            action: 'finding.updated',
            projectId: $project->id,
            userId: $request->user()->id,
            entityType: 'finding_entity',
            entityId: $finding->id,
            meta: $validated,
            ip: $request->ip()
        );

        return response()->json(['data' => $finding->fresh()]);
    }

    // --- Notes ---
    public function storeNote(Request $request, MetisProject $project): JsonResponse
    {
        $validated = $request->validate([
            'text'        => ['required', 'string'],
            'entity_type' => ['nullable', 'string'],
            'entity_id'   => ['nullable', 'integer'],
        ]);

        $note = MetisNote::create([
            ...$validated,
            'project_id' => $project->id,
            'created_by' => $request->user()->id,
        ]);

        MetisAuditLog::record(
            action: 'note.created',
            projectId: $project->id,
            userId: $request->user()->id,
            entityType: $note->entity_type,
            entityId: $note->entity_id,
            meta: ['text_length' => mb_strlen($note->text)],
            ip: $request->ip()
        );

        return response()->json(['data' => $note->load('creator:id,name')], 201);
    }
}

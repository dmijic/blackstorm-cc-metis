<?php

namespace App\Http\Controllers\Api\Intel;

use App\Enums\FindingSeverity;
use App\Enums\FindingStatus;
use App\Http\Controllers\Controller;
use App\Models\Finding;
use App\Models\TriageNote;
use App\Services\Intel\IntelFindingIngestor;
use App\Services\Response\ResponseOrchestrator;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Enum;

class FindingController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'status' => ['nullable', new Enum(FindingStatus::class)],
            'type' => ['nullable', 'string', 'max:255'],
            'severity' => ['nullable', new Enum(FindingSeverity::class)],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $findings = Finding::query()
            ->withCount(['evidences', 'matches', 'notes'])
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($validated['type'] ?? null, fn ($query, $type) => $query->where('type', $type))
            ->when($validated['severity'] ?? null, fn ($query, $severity) => $query->where('severity', $severity))
            ->when($validated['from'] ?? null, fn ($query, $from) => $query->where('observed_at', '>=', $from))
            ->when($validated['to'] ?? null, fn ($query, $to) => $query->where('observed_at', '<=', $to))
            ->orderByDesc('observed_at')
            ->get();

        return response()->json([
            'data' => $findings,
        ]);
    }

    public function show(Finding $finding)
    {
        $finding->load([
            'evidences',
            'matches.subject',
            'notes.actor:id,name,email',
            'actionRuns.playbook:id,name',
        ]);

        return response()->json([
            'data' => $finding,
        ]);
    }

    public function ingest(Request $request, IntelFindingIngestor $ingestor)
    {
        $payloads = $request->input('findings', $request->all());

        if (! is_array($payloads) || ! array_is_list($payloads)) {
            return response()->json([
                'message' => 'Ingest payload must be a JSON array of findings.',
            ], 422);
        }

        return response()->json([
            'data' => $ingestor->ingest($payloads),
        ]);
    }

    public function triage(Request $request, Finding $finding, ResponseOrchestrator $orchestrator)
    {
        $validated = $request->validate([
            'status' => ['required', new Enum(FindingStatus::class)],
            'note' => ['required', 'string'],
        ]);
        $previousStatus = $finding->status?->value ?? $finding->status;

        $finding->update([
            'status' => $validated['status'],
        ]);

        TriageNote::create([
            'finding_id' => $finding->id,
            'actor_id' => $request->user()->id,
            'note' => $validated['note'],
        ]);

        if (
            $previousStatus !== $validated['status']
            && in_array($validated['status'], [FindingStatus::CONFIRMED->value, FindingStatus::ESCALATED->value], true)
        ) {
            $orchestrator->triggerForFinding($finding->fresh(['matches.subject']));
        }

        return response()->json([
            'data' => $finding->fresh([
                'evidences',
                'matches.subject',
                'notes.actor:id,name,email',
                'actionRuns.playbook:id,name',
            ]),
        ]);
    }
}

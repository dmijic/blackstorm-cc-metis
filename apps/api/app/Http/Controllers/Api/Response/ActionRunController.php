<?php

namespace App\Http\Controllers\Api\Response;

use App\Enums\ActionRunStatus;
use App\Http\Controllers\Controller;
use App\Jobs\ProcessActionRun;
use App\Models\ActionRun;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Enum;

class ActionRunController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'status' => ['nullable', new Enum(ActionRunStatus::class)],
            'finding' => ['nullable', 'integer', 'exists:findings,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $runs = ActionRun::query()
            ->with(['playbook:id,name', 'finding:id,title,type,severity'])
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($validated['finding'] ?? null, fn ($query, $findingId) => $query->where('finding_id', $findingId))
            ->when($validated['from'] ?? null, fn ($query, $from) => $query->where('created_at', '>=', $from))
            ->when($validated['to'] ?? null, fn ($query, $to) => $query->where('created_at', '<=', $to))
            ->latest('created_at')
            ->get();

        return response()->json([
            'data' => $runs,
        ]);
    }

    public function retry(ActionRun $actionRun)
    {
        $actionRun->update([
            'status' => ActionRunStatus::QUEUED,
            'error' => null,
            'sent_at' => null,
        ]);

        ProcessActionRun::dispatch($actionRun->id);

        return response()->json([
            'data' => $actionRun->fresh(['playbook:id,name', 'finding:id,title,type,severity']),
        ]);
    }
}

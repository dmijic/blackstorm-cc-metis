<?php

namespace App\Http\Controllers\Api\Response;

use App\Enums\PlaybookActionType;
use App\Http\Controllers\Controller;
use App\Models\Finding;
use App\Models\Playbook;
use App\Services\Response\ResponseOrchestrator;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Enum;

class PlaybookController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => Playbook::query()->with('actions')->orderBy('name')->get(),
        ]);
    }

    public function show(Playbook $playbook)
    {
        return response()->json([
            'data' => $playbook->load('actions'),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validatePayload($request);

        $playbook = Playbook::create([
            'org_id' => $validated['org_id'] ?? null,
            'name' => $validated['name'],
            'enabled' => $validated['enabled'] ?? true,
            'rules_json' => $validated['rules_json'] ?? null,
        ]);

        $playbook->actions()->createMany($validated['actions'] ?? []);

        return response()->json([
            'data' => $playbook->load('actions'),
        ], 201);
    }

    public function update(Request $request, Playbook $playbook)
    {
        $validated = $this->validatePayload($request);

        $playbook->update([
            'org_id' => $validated['org_id'] ?? null,
            'name' => $validated['name'],
            'enabled' => $validated['enabled'],
            'rules_json' => $validated['rules_json'] ?? null,
        ]);

        $playbook->actions()->delete();
        $playbook->actions()->createMany($validated['actions'] ?? []);

        return response()->json([
            'data' => $playbook->fresh()->load('actions'),
        ]);
    }

    public function destroy(Playbook $playbook)
    {
        $playbook->delete();

        return response()->noContent();
    }

    public function test(Request $request, Playbook $playbook, ResponseOrchestrator $orchestrator)
    {
        $validated = $request->validate([
            'finding_id' => ['required', 'exists:findings,id'],
        ]);

        $finding = Finding::query()
            ->with('matches.subject')
            ->findOrFail($validated['finding_id']);

        $runs = $orchestrator->queuePlaybookActions($playbook->load('actions'), $finding);

        return response()->json([
            'data' => [
                'queued_runs' => collect($runs)->map(fn ($run) => $run->fresh())->values(),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'org_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'enabled' => [$request->isMethod('post') ? 'sometimes' : 'required', 'boolean'],
            'rules_json' => ['nullable', 'array'],
            'actions' => ['nullable', 'array'],
            'actions.*.action_type' => ['required_with:actions', new Enum(PlaybookActionType::class)],
            'actions.*.config_json' => ['required_with:actions', 'array'],
        ]);
    }
}

<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Jobs\Metis\ExecuteMetisScriptRunJob;
use App\Models\MetisAuditLog;
use App\Models\MetisProject;
use App\Models\MetisScriptRun;
use App\Models\MetisScriptTemplate;
use App\Services\Metis\AiService;
use App\Services\Metis\ScriptExecutionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ScriptController extends Controller
{
    public function __construct(
        private readonly ScriptExecutionService $scripts,
        private readonly AiService $ai,
    ) {}

    public function templates(Request $request): JsonResponse
    {
        $templates = MetisScriptTemplate::query()
            ->where(function ($query) use ($request) {
                $query->whereNull('project_id');

                if ($request->filled('project_id')) {
                    $query->orWhere('project_id', $request->integer('project_id'));
                }
            })
            ->orderByDesc('is_system')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $templates]);
    }

    public function storeTemplate(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);

        $validated = $request->validate([
            'project_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'runtime' => ['required', 'in:shell,python'],
            'script_body' => ['required', 'string'],
            'input_schema_json' => ['nullable', 'array'],
            'output_schema_json' => ['nullable', 'array'],
            'allowed_target_types_json' => ['nullable', 'array'],
            'execution_policy_json' => ['nullable', 'array'],
            'timeout_seconds' => ['nullable', 'integer', 'min:5', 'max:600'],
            'environment_policy_json' => ['nullable', 'array'],
            'network_policy_json' => ['nullable', 'array'],
            'ai_prompt_template' => ['nullable', 'string'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        $template = MetisScriptTemplate::query()->create([
            ...$validated,
            'slug' => $this->uniqueSlug($validated['name']),
            'created_by' => $request->user()->id,
            'enabled' => $validated['enabled'] ?? true,
            'is_system' => false,
        ]);

        return response()->json(['data' => $template], 201);
    }

    public function updateTemplate(Request $request, MetisScriptTemplate $template): JsonResponse
    {
        $this->ensureAdmin($request);
        abort_if($template->is_system, 422, 'System templates cannot be edited directly.');

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'runtime' => ['sometimes', 'in:shell,python'],
            'script_body' => ['sometimes', 'string'],
            'input_schema_json' => ['nullable', 'array'],
            'output_schema_json' => ['nullable', 'array'],
            'allowed_target_types_json' => ['nullable', 'array'],
            'execution_policy_json' => ['nullable', 'array'],
            'timeout_seconds' => ['nullable', 'integer', 'min:5', 'max:600'],
            'environment_policy_json' => ['nullable', 'array'],
            'network_policy_json' => ['nullable', 'array'],
            'ai_prompt_template' => ['nullable', 'string'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        $template->update($validated);

        return response()->json(['data' => $template->fresh()]);
    }

    public function duplicateTemplate(Request $request, MetisScriptTemplate $template): JsonResponse
    {
        $this->ensureAdmin($request);

        $copy = MetisScriptTemplate::query()->create([
            'project_id' => $template->project_id,
            'created_by' => $request->user()->id,
            'slug' => $this->uniqueSlug($template->name.' Copy'),
            'name' => $template->name.' Copy',
            'description' => $template->description,
            'runtime' => $template->runtime,
            'script_body' => $template->script_body,
            'input_schema_json' => $template->input_schema_json,
            'output_schema_json' => $template->output_schema_json,
            'allowed_target_types_json' => $template->allowed_target_types_json,
            'execution_policy_json' => $template->execution_policy_json,
            'timeout_seconds' => $template->timeout_seconds,
            'environment_policy_json' => $template->environment_policy_json,
            'network_policy_json' => $template->network_policy_json,
            'ai_prompt_template' => $template->ai_prompt_template,
            'enabled' => $template->enabled,
            'is_system' => false,
        ]);

        return response()->json(['data' => $copy], 201);
    }

    public function runs(MetisProject $project): JsonResponse
    {
        $runs = MetisScriptRun::query()
            ->with(['template:id,slug,name,runtime', 'creator:id,name'])
            ->where('project_id', $project->id)
            ->orderByDesc('created_at')
            ->paginate(25);

        return response()->json($runs);
    }

    public function dispatch(Request $request, MetisProject $project): JsonResponse
    {
        $validated = $request->validate([
            'template_id' => ['required', 'integer', 'exists:metis_script_templates,id'],
            'input' => ['nullable', 'array'],
        ]);

        $template = MetisScriptTemplate::query()
            ->whereKey($validated['template_id'])
            ->where(function ($query) use ($project) {
                $query->whereNull('project_id')
                    ->orWhere('project_id', $project->id);
            })
            ->where('enabled', true)
            ->firstOrFail();

        $run = $this->scripts->createRun(
            template: $template,
            input: $validated['input'] ?? [],
            projectId: $project->id,
            userId: $request->user()->id
        );

        ExecuteMetisScriptRunJob::dispatch($run->id);

        MetisAuditLog::record(
            action: 'script.queued',
            projectId: $project->id,
            userId: $request->user()->id,
            entityType: 'script_run',
            entityId: $run->id,
            meta: ['template_id' => $template->id, 'template_slug' => $template->slug],
            ip: $request->ip()
        );

        return response()->json(['data' => $run->load('template:id,slug,name,runtime')], 201);
    }

    public function show(MetisProject $project, MetisScriptRun $scriptRun): JsonResponse
    {
        abort_if($scriptRun->project_id !== $project->id, 404);

        return response()->json([
            'data' => $scriptRun->load(['template', 'creator:id,name']),
            'stdout' => $scriptRun->loadArtifact('stdout'),
            'stderr' => $scriptRun->loadArtifact('stderr'),
        ]);
    }

    public function interpret(Request $request, MetisProject $project, MetisScriptRun $scriptRun): JsonResponse
    {
        abort_if($scriptRun->project_id !== $project->id, 404);

        $payload = $this->ai->groundedInterpretation(
            title: 'Custom Script Result Interpretation',
            observed: [
                'template' => [
                    'id' => $scriptRun->template_id,
                    'name' => $scriptRun->template?->name,
                    'runtime' => $scriptRun->template?->runtime,
                ],
                'input' => $scriptRun->input_json ?? [],
                'parsed_output' => $scriptRun->parsed_output_json ?? [],
            ],
            inferred: [
                'stdout_ref' => $scriptRun->stdout_ref,
                'stderr_ref' => $scriptRun->stderr_ref,
            ],
            recommended: [
                'next_step' => 'Review parsed output and, if relevant, bind the saved variables into a follow-on workflow node.',
            ],
            options: ['mode' => 'script_interpretation']
        );

        $scriptRun->update(['ai_summary_json' => $payload]);

        return response()->json(['data' => $payload]);
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access required.');
    }

    private function uniqueSlug(string $value): string
    {
        $slug = Str::slug($value);
        $candidate = $slug;
        $suffix = 2;

        while (MetisScriptTemplate::query()->where('slug', $candidate)->exists()) {
            $candidate = "{$slug}-{$suffix}";
            $suffix++;
        }

        return $candidate;
    }
}

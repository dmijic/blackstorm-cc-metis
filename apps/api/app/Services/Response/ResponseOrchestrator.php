<?php

namespace App\Services\Response;

use App\Enums\ActionRunStatus;
use App\Enums\FindingStatus;
use App\Jobs\ProcessActionRun;
use App\Models\ActionRun;
use App\Models\Finding;
use App\Models\Playbook;
use App\Models\PlaybookAction;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class ResponseOrchestrator
{
    /**
     * @return array<int, \App\Models\ActionRun>
     */
    public function triggerForFinding(Finding $finding, bool $dispatchJobs = true): array
    {
        $status = $finding->status?->value ?? $finding->status;

        if (! in_array($status, [FindingStatus::CONFIRMED->value, FindingStatus::ESCALATED->value], true)) {
            return [];
        }

        $finding->loadMissing('matches.subject');

        $playbooks = Playbook::query()
            ->where('enabled', true)
            ->with('actions')
            ->get();

        $runs = [];

        foreach ($playbooks as $playbook) {
            if (! $this->matchesRules($playbook, $finding)) {
                continue;
            }

            $runs = [
                ...$runs,
                ...$this->queuePlaybookActions($playbook, $finding, $dispatchJobs),
            ];
        }

        return $runs;
    }

    /**
     * @return array<int, \App\Models\ActionRun>
     */
    public function queuePlaybookActions(Playbook $playbook, Finding $finding, bool $dispatchJobs = true): array
    {
        $playbook->loadMissing('actions');
        $finding->loadMissing('matches.subject');

        $runs = [];

        foreach ($playbook->actions as $action) {
            $actionRun = ActionRun::create([
                'org_id' => $finding->org_id,
                'playbook_id' => $playbook->id,
                'finding_id' => $finding->id,
                'status' => ActionRunStatus::QUEUED,
                'payload_json' => $this->buildMaskedPayload($playbook, $action, $finding),
                'created_at' => now(),
            ]);

            if ($dispatchJobs) {
                ProcessActionRun::dispatch($actionRun->id);
            }

            $runs[] = $actionRun;
        }

        return $runs;
    }

    public function matchesRules(Playbook $playbook, Finding $finding): bool
    {
        $rules = $playbook->rules_json ?? [];
        $findingTypeRule = $rules['finding_type'] ?? $rules['type'] ?? null;

        if ($findingTypeRule && ! $this->matchesValue($findingTypeRule, $finding->type)) {
            return false;
        }

        $findingSeverity = $finding->severity?->value ?? $finding->severity;
        $severityRule = $rules['severity'] ?? null;

        if ($severityRule && ! $this->matchesValue($severityRule, $findingSeverity)) {
            return false;
        }

        $minConfidence = (float) ($rules['min_confidence'] ?? 0);

        if ((float) $finding->confidence < $minConfidence) {
            return false;
        }

        $subjectTypeRule = $rules['subject_type'] ?? null;

        if ($subjectTypeRule) {
            $subjectTypes = $finding->matches
                ->map(fn ($match) => $match->subject?->type?->value ?? $match->subject?->type)
                ->filter()
                ->values()
                ->all();

            if (! $this->matchesAny($subjectTypeRule, $subjectTypes)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildMaskedPayload(Playbook $playbook, PlaybookAction $action, Finding $finding): array
    {
        return [
            'action_id' => $action->id,
            'action_type' => $action->action_type->value,
            'playbook' => [
                'id' => $playbook->id,
                'name' => $playbook->name,
            ],
            'finding' => [
                'id' => $finding->id,
                'source' => $finding->source,
                'type' => $finding->type,
                'severity' => $finding->severity?->value ?? $finding->severity,
                'title' => $finding->title,
                'summary' => $finding->summary,
                'confidence' => $finding->confidence,
                'status' => $finding->status?->value ?? $finding->status,
            ],
            'subjects' => $finding->matches
                ->map(fn ($match) => [
                    'name' => $match->subject?->name,
                    'type' => $match->subject?->type?->value ?? $match->subject?->type,
                    'confidence' => $match->confidence,
                ])
                ->values()
                ->all(),
            'delivery' => $this->maskSensitiveData($action->config_json ?? []),
        ];
    }

    /**
     * @param  string|array<int, string>  $expected
     */
    private function matchesValue(string|array $expected, string $actual): bool
    {
        $values = is_array($expected) ? $expected : [$expected];

        return in_array($actual, $values, true);
    }

    /**
     * @param  string|array<int, string>  $expected
     * @param  array<int, string>  $actualValues
     */
    private function matchesAny(string|array $expected, array $actualValues): bool
    {
        $values = is_array($expected) ? $expected : [$expected];

        return Collection::make($actualValues)->intersect($values)->isNotEmpty();
    }

    /**
     * @param  mixed  $value
     * @return mixed
     */
    private function maskSensitiveData(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        $masked = [];

        foreach ($value as $key => $nestedValue) {
            if (is_string($key) && $this->isSensitiveKey($key)) {
                $masked[$key] = '***masked***';
                continue;
            }

            $masked[$key] = $this->maskSensitiveData($nestedValue);
        }

        return $masked;
    }

    private function isSensitiveKey(string $key): bool
    {
        $normalized = Str::lower($key);

        return Str::contains($normalized, ['secret', 'token', 'password', 'signature', 'api_key']);
    }
}

<?php

namespace App\Services\Intel;

use App\Enums\EvidenceKind;
use App\Enums\FindingSeverity;
use App\Enums\FindingStatus;
use App\Enums\SubjectType;
use App\Models\Evidence;
use App\Models\Finding;
use App\Models\FindingMatch;
use App\Models\Subject;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Enum;
use Illuminate\Validation\ValidationException;

class IntelFindingIngestor
{
    /**
     * @param  array<int, array<string, mixed>>  $payloads
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public function ingest(array $payloads): array
    {
        $summary = [
            'created' => 0,
            'deduplicated' => 0,
            'discarded_password' => 0,
            'records' => [],
        ];

        foreach ($payloads as $index => $payload) {
            if (! is_array($payload)) {
                throw ValidationException::withMessages([
                    "findings.$index" => ['Each finding entry must be an object.'],
                ]);
            }

            if ($this->containsPasswordField($payload)) {
                $summary['discarded_password']++;
                continue;
            }

            $validated = $this->validatePayload($payload, $index);

            $result = DB::transaction(function () use ($validated) {
                $existingFinding = $this->findExisting($validated['org_id'], $validated['dedupe_key']);

                if ($existingFinding) {
                    $incomingObservedAt = Carbon::parse($validated['observed_at']);

                    if ($incomingObservedAt->greaterThan($existingFinding->observed_at)) {
                        $existingFinding->update([
                            'observed_at' => $incomingObservedAt,
                            'confidence' => max($existingFinding->confidence, $validated['confidence']),
                        ]);
                    }

                    return [
                        'action' => 'deduplicated',
                        'finding' => $existingFinding->fresh(),
                    ];
                }

                $finding = Finding::create([
                    'org_id' => $validated['org_id'],
                    'source' => $validated['source'],
                    'type' => $validated['type'],
                    'severity' => $validated['severity'],
                    'title' => $validated['title'],
                    'summary' => $validated['summary'],
                    'observed_at' => $validated['observed_at'],
                    'confidence' => $validated['confidence'],
                    'dedupe_key' => $validated['dedupe_key'],
                    'status' => $validated['status'],
                ]);

                foreach ($validated['evidences'] as $evidencePayload) {
                    $finding->evidences()->create([
                        'kind' => $evidencePayload['kind'],
                        'data_json' => $evidencePayload['data_json'],
                    ]);
                }

                $this->createMatches($finding);

                return [
                    'action' => 'created',
                    'finding' => $finding->fresh(['matches', 'evidences']),
                ];
            });

            if ($result['action'] === 'created') {
                $summary['created']++;
            } else {
                $summary['deduplicated']++;
            }

            $summary['records'][] = [
                'id' => $result['finding']->id,
                'dedupe_key' => $result['finding']->dedupe_key,
                'action' => $result['action'],
            ];
        }

        return $summary;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    private function validatePayload(array $payload, int $index): array
    {
        $validator = Validator::make($payload, [
            'org_id' => ['nullable', 'integer'],
            'source' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'max:255'],
            'severity' => ['required', new Enum(FindingSeverity::class)],
            'title' => ['required', 'string', 'max:255'],
            'summary' => ['nullable', 'string'],
            'observed_at' => ['required', 'date'],
            'confidence' => ['nullable', 'numeric', 'between:0,1'],
            'dedupe_key' => ['required', 'string', 'max:255'],
            'status' => ['nullable', new Enum(FindingStatus::class)],
            'evidences' => ['nullable', 'array'],
            'evidences.*.kind' => ['required_with:evidences', new Enum(EvidenceKind::class)],
            'evidences.*.data_json' => ['nullable', 'array'],
        ]);

        if ($validator->fails()) {
            throw ValidationException::withMessages([
                "findings.$index" => $validator->errors()->all(),
            ]);
        }

        $validated = $validator->validated();

        $validated['summary'] = $validated['summary'] ?? '';
        $validated['confidence'] = round((float) ($validated['confidence'] ?? 0.50), 2);
        $validated['status'] = $validated['status'] ?? FindingStatus::NEW->value;
        $validated['evidences'] = array_map(function (array $evidence): array {
            return [
                'kind' => $evidence['kind'],
                'data_json' => $evidence['data_json'] ?? [],
            ];
        }, $validated['evidences'] ?? []);
        $validated['org_id'] = $validated['org_id'] ?? null;

        return $validated;
    }

    private function findExisting(?int $orgId, string $dedupeKey): ?Finding
    {
        return Finding::query()
            ->where('dedupe_key', $dedupeKey)
            ->when(
                $orgId === null,
                fn ($query) => $query->whereNull('org_id'),
                fn ($query) => $query->where('org_id', $orgId)
            )
            ->first();
    }

    private function createMatches(Finding $finding): void
    {
        $subjects = Subject::query()
            ->where('enabled', true)
            ->when(
                $finding->org_id === null,
                fn ($query) => $query->whereNull('org_id'),
                fn ($query) => $query->where(function ($subQuery) use ($finding) {
                    $subQuery
                        ->whereNull('org_id')
                        ->orWhere('org_id', $finding->org_id);
                })
            )
            ->get();

        $content = $this->buildContentMap($finding);

        foreach ($subjects as $subject) {
            $match = match ($subject->type) {
                SubjectType::DOMAIN => $this->matchDomain($subject, $content),
                SubjectType::EMAIL_DOMAIN => $this->matchEmailDomain($subject, $content),
                SubjectType::KEYWORD => $this->matchKeyword($subject, $content),
            };

            if (! $match) {
                continue;
            }

            FindingMatch::create([
                'finding_id' => $finding->id,
                'subject_id' => $subject->id,
                'confidence' => $match['confidence'],
                'why_json' => $match['why_json'],
            ]);
        }
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function buildContentMap(Finding $finding): array
    {
        $titleAndSummary = [
            'title' => $finding->title,
            'summary' => $finding->summary,
        ];
        $urlSources = [];
        $textSources = [];

        foreach ($finding->evidences as $evidence) {
            $strings = array_values(array_filter($this->flattenStrings($evidence->data_json)));

            if ($strings === []) {
                continue;
            }

            $label = sprintf('evidence:%s:%d', $evidence->kind->value, $evidence->id);
            $compiled = implode(' ', $strings);

            if ($evidence->kind === EvidenceKind::URL) {
                $urlSources[$label] = $compiled;
                continue;
            }

            $textSources[$label] = $compiled;
        }

        return [
            'title_summary' => $titleAndSummary,
            'urls' => $urlSources,
            'text' => $textSources,
        ];
    }

    /**
     * @param  array<string, array<string, string>>  $content
     * @return array<string, mixed>|null
     */
    private function matchDomain(Subject $subject, array $content): ?array
    {
        $needle = Str::lower($subject->name);

        foreach ([$content['title_summary'], $content['urls']] as $bucket) {
            foreach ($bucket as $source => $haystack) {
                if (! Str::contains(Str::lower($haystack), $needle)) {
                    continue;
                }

                return [
                    'confidence' => Str::startsWith($source, 'evidence:url') ? 0.96 : 0.88,
                    'why_json' => [
                        'matched_on' => $source,
                        'subject_type' => $subject->type->value,
                        'subject_value' => $subject->name,
                        'snippet' => $this->snippet($haystack, $subject->name),
                    ],
                ];
            }
        }

        return null;
    }

    /**
     * @param  array<string, array<string, string>>  $content
     * @return array<string, mixed>|null
     */
    private function matchEmailDomain(Subject $subject, array $content): ?array
    {
        $domain = preg_quote(Str::lower($subject->name), '/');
        $pattern = '/[A-Z0-9._%+\-]+@'.$domain.'\b/i';

        foreach ([$content['title_summary'], $content['text']] as $bucket) {
            foreach ($bucket as $source => $haystack) {
                if (! preg_match($pattern, $haystack, $matches)) {
                    continue;
                }

                return [
                    'confidence' => Str::startsWith($source, 'evidence:') ? 0.97 : 0.90,
                    'why_json' => [
                        'matched_on' => $source,
                        'subject_type' => $subject->type->value,
                        'subject_value' => $subject->name,
                        'snippet' => $matches[0],
                    ],
                ];
            }
        }

        return null;
    }

    /**
     * @param  array<string, array<string, string>>  $content
     * @return array<string, mixed>|null
     */
    private function matchKeyword(Subject $subject, array $content): ?array
    {
        $needle = Str::lower($subject->name);

        foreach ([$content['title_summary'], $content['text'], $content['urls']] as $bucket) {
            foreach ($bucket as $source => $haystack) {
                if (! Str::contains(Str::lower($haystack), $needle)) {
                    continue;
                }

                return [
                    'confidence' => 0.74,
                    'why_json' => [
                        'matched_on' => $source,
                        'subject_type' => $subject->type->value,
                        'subject_value' => $subject->name,
                        'snippet' => $this->snippet($haystack, $subject->name),
                    ],
                ];
            }
        }

        return null;
    }

    /**
     * @param  mixed  $value
     * @return array<int, string>
     */
    private function flattenStrings(mixed $value): array
    {
        if (is_string($value)) {
            return [$value];
        }

        if (is_numeric($value)) {
            return [(string) $value];
        }

        if (! is_array($value)) {
            return [];
        }

        $strings = [];

        foreach ($value as $nestedValue) {
            $strings = [...$strings, ...$this->flattenStrings($nestedValue)];
        }

        return $strings;
    }

    /**
     * @param  mixed  $payload
     */
    private function containsPasswordField(mixed $payload): bool
    {
        if (! is_array($payload)) {
            return false;
        }

        foreach ($payload as $key => $value) {
            if (is_string($key) && Str::lower($key) === 'password') {
                return true;
            }

            if ($this->containsPasswordField($value)) {
                return true;
            }
        }

        return false;
    }

    private function snippet(string $haystack, string $needle): string
    {
        $position = stripos($haystack, $needle);

        if ($position === false) {
            return Str::limit($haystack, 120);
        }

        $start = max($position - 30, 0);

        return trim(substr($haystack, $start, strlen($needle) + 60));
    }
}

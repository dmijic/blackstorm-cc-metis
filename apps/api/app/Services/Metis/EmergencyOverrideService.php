<?php

namespace App\Services\Metis;

use App\Models\MetisAuditLog;
use App\Models\MetisDomainEntity;
use App\Models\MetisEmergencyOverride;
use App\Models\MetisHostEntity;
use App\Models\MetisProject;
use App\Models\User;
use Illuminate\Support\Str;

class EmergencyOverrideService
{
    public function create(MetisProject $project, User $user, array $payload, ?string $ip = null): MetisEmergencyOverride
    {
        abort_unless($user->isSuperAdmin(), 403, 'SuperAdmin access required.');

        $allowedTargets = $this->allowedTargetsForProject($project);
        $allowedLookup = collect($allowedTargets['all'])
            ->mapWithKeys(fn (array $item) => [strtolower($item['value']) => true])
            ->all();

        $requestedTargets = collect($payload['targets'] ?? [])
            ->map(fn ($value) => strtolower(trim((string) $value)))
            ->filter()
            ->unique()
            ->values();

        abort_if($requestedTargets->isEmpty(), 422, 'At least one allowed target is required.');

        $invalidTargets = $requestedTargets
            ->reject(fn ($value) => array_key_exists($value, $allowedLookup))
            ->values()
            ->all();

        abort_if(
            $invalidTargets !== [],
            422,
            'Override targets must be selected from already discovered or scoped project inventory.'
        );

        $override = MetisEmergencyOverride::query()->create([
            'project_id' => $project->id,
            'created_by' => $user->id,
            'confirmed_by' => $user->id,
            'status' => 'confirmed',
            'run_type' => $payload['run_type'] ?? null,
            'reason' => trim((string) ($payload['reason'] ?? '')),
            'target_summary' => trim((string) ($payload['target_summary'] ?? '')),
            'targets_json' => $requestedTargets->all(),
            'confirmation_meta' => [
                'confirmed' => true,
                'confirmation_text' => $payload['confirmation_text'] ?? null,
                'requested_at' => now()->toIso8601String(),
                'inventory_bound' => true,
            ],
            'one_time' => array_key_exists('one_time', $payload) ? (bool) $payload['one_time'] : true,
            'expires_at' => $payload['expires_at'] ?? null,
        ]);

        MetisAuditLog::record(
            action: 'override.created',
            projectId: $project->id,
            userId: $user->id,
            entityType: 'emergency_override',
            entityId: $override->id,
            meta: [
                'run_type' => $override->run_type,
                'target_summary' => $override->target_summary,
                'one_time' => $override->one_time,
                'expires_at' => $override->expires_at?->toIso8601String(),
            ],
            ip: $ip
        );

        return $override;
    }

    public function resolveForRun(MetisProject $project, User $user, ?int $overrideId, string $runType, array $targets, ?string $ip = null): ?MetisEmergencyOverride
    {
        if (! $overrideId) {
            return null;
        }

        abort_unless($user->isSuperAdmin(), 403, 'Emergency override is available only to SuperAdmin.');

        $override = MetisEmergencyOverride::query()
            ->where('project_id', $project->id)
            ->findOrFail($overrideId);

        foreach ($targets as $target) {
            abort_unless(
                $override->isUsableFor($runType, strtolower(trim((string) $target))),
                403,
                'Emergency override is invalid, expired, or does not cover all requested targets.'
            );
        }

        $override->consume();

        MetisAuditLog::record(
            action: 'override.used',
            projectId: $project->id,
            userId: $user->id,
            entityType: 'emergency_override',
            entityId: $override->id,
            meta: [
                'run_type' => $runType,
                'targets' => array_values($targets),
            ],
            ip: $ip
        );

        return $override;
    }

    public function optionsForProject(MetisProject $project): array
    {
        $targets = $this->allowedTargetsForProject($project);

        return [
            'run_types' => [
                ['value' => 'http_probe', 'label' => 'HTTP Probe'],
                ['value' => 'ping_check', 'label' => 'Ping Check'],
                ['value' => 'tls_fingerprint', 'label' => 'TLS Fingerprint'],
                ['value' => 'port_scan', 'label' => 'Port Scan'],
                ['value' => 'banner_grab', 'label' => 'Banner Grab'],
                ['value' => 'directory_enum', 'label' => 'Directory Discovery'],
                ['value' => 'vuln_assessment', 'label' => 'Vulnerability Assessment'],
                ['value' => 'remediation_validation', 'label' => 'Remediation Validation'],
                ['value' => 'iam_audit', 'label' => 'IAM Audit'],
                ['value' => 'workflow', 'label' => 'Workflow Run'],
            ],
            'targets' => $targets,
        ];
    }

    private function allowedTargetsForProject(MetisProject $project): array
    {
        $scope = $project->scope;

        $domains = collect([
            ...($scope?->root_domains ?? []),
            ...($scope?->known_subdomains ?? []),
            ...MetisDomainEntity::query()
                ->where('project_id', $project->id)
                ->pluck('domain')
                ->all(),
        ])
            ->map(fn ($value) => strtolower(trim((string) $value)))
            ->filter()
            ->unique()
            ->sort()
            ->values()
            ->map(fn ($value) => [
                'value' => $value,
                'label' => $value,
                'type' => Str::contains($value, '.') ? 'domain_or_host' : 'domain',
            ]);

        $hosts = MetisHostEntity::query()
            ->where('project_id', $project->id)
            ->get()
            ->flatMap(function (MetisHostEntity $host) {
                $items = [];

                if ($host->hostname) {
                    $items[] = strtolower($host->hostname);
                }

                foreach (($host->ip_addresses_json ?? array_values(array_filter([$host->ip]))) as $ip) {
                    if ($ip) {
                        $items[] = strtolower((string) $ip);
                    }
                }

                return $items;
            })
            ->map(fn ($value) => strtolower(trim((string) $value)))
            ->filter()
            ->unique()
            ->sort()
            ->values();

        $hostOptions = $hosts->map(fn ($value) => [
            'value' => $value,
            'label' => $value,
            'type' => filter_var($value, FILTER_VALIDATE_IP) ? 'ip' : 'host',
        ]);

        $all = $domains
            ->concat($hostOptions)
            ->unique('value')
            ->values();

        return [
            'all' => $all->all(),
            'domains' => $domains->values()->all(),
            'hosts' => $hostOptions->where('type', 'host')->values()->all(),
            'ips' => $hostOptions->where('type', 'ip')->values()->all(),
        ];
    }
}

<?php

namespace App\Services\Metis;

use App\Models\MetisFindingEntity;
use App\Models\MetisHostEntity;
use App\Models\MetisJobRun;
use App\Models\MetisProject;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class AssessmentService
{
    public function directoryDiscovery(MetisJobRun $run, ScopeVerifierService $scopeVerifier): array
    {
        $project = MetisProject::query()->with('hostEntities')->findOrFail($run->project_id);
        $targets = $this->resolveTargets($run, $project, onlyLive: true);
        $paths = collect($run->params_json['paths'] ?? $this->defaultDiscoveryPaths())
            ->map(fn ($path) => '/'.ltrim((string) $path, '/'))
            ->unique()
            ->values()
            ->all();

        if ($targets === []) {
            throw new \InvalidArgumentException('No live hosts available for directory discovery.');
        }

        $run->markStarted();

        $results = [];
        $findingCount = 0;
        $blocked = 0;

        foreach ($targets as $target) {
            if (! $scopeVerifier->isTargetInAuthorizedScope($project->id, $target)) {
                $blocked++;
                continue;
            }

            foreach ($paths as $path) {
                $response = $this->requestTarget($target, $path);

                if (! $response) {
                    continue;
                }

                if (! $this->shouldReportDiscoveryPath($path, $response['status'])) {
                    continue;
                }

                $results[$target][] = [
                    'path' => $path,
                    'status' => $response['status'],
                    'url' => $response['url'],
                ];

                $findingCount++;
                $host = $project->hostEntities->first(fn (MetisHostEntity $entity) => $entity->hostname === $target);

                $this->upsertFinding(
                    projectId: $project->id,
                    type: 'directory_exposure',
                    title: sprintf('Sensitive path exposed on %s (%s)', $target, $path),
                    severity: $this->severityForDiscoveryPath($path, $response['status']),
                    summary: sprintf('Directory discovery observed %s returning HTTP %d on %s.', $path, $response['status'], $target),
                    confidence: 'high',
                    evidence: ['target' => $target, 'path' => $path, 'status' => $response['status'], 'url' => $response['url']],
                    affectedEntityId: $host?->id
                );
            }
        }

        $payload = [
            'targets' => $results,
            'finding_count' => $findingCount,
            'blocked' => $blocked,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'targets' => count($targets),
            'findings' => $findingCount,
            'blocked' => $blocked,
        ]);

        return $payload;
    }

    public function vulnAssessment(MetisJobRun $run, ScopeVerifierService $scopeVerifier): array
    {
        $project = MetisProject::query()->with('hostEntities')->findOrFail($run->project_id);
        $targets = $this->resolveTargets($run, $project, onlyLive: true);

        if ($targets === []) {
            throw new \InvalidArgumentException('No live hosts available for vulnerability assessment.');
        }

        $run->markStarted();

        $results = [];
        $findingCount = 0;
        $blocked = 0;

        foreach ($targets as $target) {
            if (! $scopeVerifier->isTargetInAuthorizedScope($project->id, $target)) {
                $blocked++;
                continue;
            }

            $response = $this->requestTarget($target, '/');
            $host = $project->hostEntities->first(fn (MetisHostEntity $entity) => $entity->hostname === $target);

            if (! $response) {
                continue;
            }

            $hostFindings = $this->evaluateHttpControls($project->id, $target, $response, $host);
            $portFindings = $this->evaluatePortExposure($project->id, $target, $host);

            $results[$target] = [
                'http' => $response['status'],
                'issues' => [...$hostFindings, ...$portFindings],
            ];

            $findingCount += count($hostFindings) + count($portFindings);
        }

        $payload = [
            'targets' => $results,
            'findings' => $findingCount,
            'blocked' => $blocked,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'targets' => count($targets),
            'findings' => $findingCount,
            'blocked' => $blocked,
        ]);

        return $payload;
    }

    public function remediationValidation(MetisJobRun $run, ScopeVerifierService $scopeVerifier): array
    {
        $project = MetisProject::query()->with('hostEntities')->findOrFail($run->project_id);
        $findings = MetisFindingEntity::query()
            ->where('project_id', $project->id)
            ->whereIn('type', [
                'directory_exposure',
                'missing_hsts',
                'missing_csp',
                'missing_x_frame_options',
                'insecure_session_cookie',
                'exposed_management_port',
                'database_port_exposed',
                'iam_session_policy',
            ])
            ->whereIn('status', ['open', 'in_review'])
            ->get();

        $run->markStarted();

        $resolved = [];
        $persisting = [];

        foreach ($findings as $finding) {
            $evidence = $finding->evidence_json ?? [];
            $target = $evidence['target'] ?? null;

            if (! $target || ! $scopeVerifier->isTargetInAuthorizedScope($project->id, $target)) {
                continue;
            }

            $stillPresent = match ($finding->type) {
                'directory_exposure' => $this->validateDirectoryFinding($evidence),
                'missing_hsts', 'missing_csp', 'missing_x_frame_options', 'insecure_session_cookie', 'iam_session_policy'
                    => $this->validateHttpFinding($finding->type, $evidence),
                'exposed_management_port', 'database_port_exposed'
                    => $this->validatePortFinding($project->hostEntities, $finding->type, $evidence),
                default => true,
            };

            if ($stillPresent) {
                $persisting[] = $finding->title;
                continue;
            }

            $finding->update([
                'status' => 'resolved',
                'evidence_json' => array_merge($evidence, [
                    'validated_at' => now()->toIso8601String(),
                    'validation_result' => 'resolved',
                ]),
            ]);
            $resolved[] = $finding->title;
        }

        $payload = [
            'resolved' => $resolved,
            'persisting' => $persisting,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'resolved' => count($resolved),
            'persisting' => count($persisting),
        ]);

        return $payload;
    }

    public function iamAudit(MetisJobRun $run, ScopeVerifierService $scopeVerifier): array
    {
        $project = MetisProject::query()->with('hostEntities')->findOrFail($run->project_id);
        $targets = $this->resolveTargets($run, $project, onlyLive: true, authOnly: true);

        if ($targets === []) {
            $targets = $this->resolveTargets($run, $project, onlyLive: true);
        }

        if ($targets === []) {
            throw new \InvalidArgumentException('No live hosts available for IAM audit.');
        }

        $run->markStarted();

        $results = [];
        $findingCount = 0;
        $blocked = 0;

        foreach ($targets as $target) {
            if (! $scopeVerifier->isTargetInAuthorizedScope($project->id, $target)) {
                $blocked++;
                continue;
            }

            $response = $this->requestTarget($target, '/login') ?? $this->requestTarget($target, '/');

            if (! $response) {
                continue;
            }

            $issues = $this->evaluateIamControls($project->id, $target, $response);
            $results[$target] = $issues;
            $findingCount += count($issues);
        }

        $payload = [
            'targets' => $results,
            'findings' => $findingCount,
            'blocked' => $blocked,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'targets' => count($targets),
            'findings' => $findingCount,
            'blocked' => $blocked,
        ]);

        return $payload;
    }

    private function resolveTargets(MetisJobRun $run, MetisProject $project, bool $onlyLive = false, bool $authOnly = false): array
    {
        $targets = collect($run->params_json['hosts'] ?? [])
            ->filter(fn ($host) => is_string($host) && trim($host) !== '')
            ->map(fn ($host) => Str::lower(trim($host)))
            ->unique()
            ->values();

        if ($targets->isEmpty()) {
            $targets = $project->hostEntities
                ->filter(fn (MetisHostEntity $host) => ! $onlyLive || $host->is_live)
                ->map(fn (MetisHostEntity $host) => Str::lower($host->hostname))
                ->filter();
        }

        if ($authOnly) {
            $targets = $targets->filter(fn ($host) => preg_match('/auth|login|sso|signin|idp|identity|portal/i', $host));
        }

        return $targets->unique()->values()->all();
    }

    private function defaultDiscoveryPaths(): array
    {
        return [
            '/.git/HEAD',
            '/.git/config',
            '/.env',
            '/.env.example',
            '/backup.zip',
            '/backup.tar.gz',
            '/db.sql',
            '/server-status',
            '/actuator/health',
            '/swagger.json',
            '/openapi.json',
        ];
    }

    private function requestTarget(string $target, string $path): ?array
    {
        foreach (['https', 'http'] as $scheme) {
            try {
                $response = Http::timeout(10)
                    ->withOptions([
                        'verify' => false,
                        'allow_redirects' => ['max' => 3, 'track_redirects' => true],
                    ])
                    ->withHeaders(['User-Agent' => 'Metis-Assessment/1.0'])
                    ->get("{$scheme}://{$target}{$path}");

                return [
                    'scheme' => $scheme,
                    'status' => $response->status(),
                    'url' => $response->effectiveUri()?->__toString() ?? "{$scheme}://{$target}{$path}",
                    'headers' => $response->headers(),
                    'body' => $response->body(),
                ];
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }

    private function shouldReportDiscoveryPath(string $path, int $status): bool
    {
        $protectedEndpoints = ['/server-status', '/actuator/health', '/swagger.json', '/openapi.json'];

        if (in_array($path, $protectedEndpoints, true)) {
            return in_array($status, [200, 401, 403], true);
        }

        return $status === 200;
    }

    private function severityForDiscoveryPath(string $path, int $status): string
    {
        if (in_array($path, ['/.env', '/backup.zip', '/backup.tar.gz', '/db.sql', '/.git/config'], true) && $status === 200) {
            return 'high';
        }

        return 'medium';
    }

    private function evaluateHttpControls(int $projectId, string $target, array $response, ?MetisHostEntity $host): array
    {
        $headers = $this->normalizeHeaders($response['headers'] ?? []);
        $issues = [];

        if (($response['scheme'] ?? null) === 'https' && empty($headers['strict-transport-security'])) {
            $issues[] = $this->upsertFinding(
                projectId: $projectId,
                type: 'missing_hsts',
                title: 'Missing HSTS on '.$target,
                severity: 'low',
                summary: 'HTTPS response is missing a Strict-Transport-Security header.',
                confidence: 'high',
                evidence: ['target' => $target, 'url' => $response['url']],
                affectedEntityId: $host?->id
            );
        }

        if ($this->isHtmlResponse($headers) && empty($headers['content-security-policy'])) {
            $issues[] = $this->upsertFinding(
                projectId: $projectId,
                type: 'missing_csp',
                title: 'Missing CSP on '.$target,
                severity: 'low',
                summary: 'HTML response is missing a Content-Security-Policy header.',
                confidence: 'medium',
                evidence: ['target' => $target, 'url' => $response['url']],
                affectedEntityId: $host?->id
            );
        }

        if ($this->isHtmlResponse($headers) && empty($headers['x-frame-options'])) {
            $issues[] = $this->upsertFinding(
                projectId: $projectId,
                type: 'missing_x_frame_options',
                title: 'Missing X-Frame-Options on '.$target,
                severity: 'info',
                summary: 'HTML response is missing an X-Frame-Options header.',
                confidence: 'medium',
                evidence: ['target' => $target, 'url' => $response['url']],
                affectedEntityId: $host?->id
            );
        }

        $setCookies = $headers['set-cookie'] ?? [];
        $cookieIssues = [];

        foreach ($setCookies as $cookie) {
            $missingFlags = [];
            if (! Str::contains(Str::lower($cookie), 'secure')) {
                $missingFlags[] = 'Secure';
            }
            if (! Str::contains(Str::lower($cookie), 'httponly')) {
                $missingFlags[] = 'HttpOnly';
            }
            if (! Str::contains(Str::lower($cookie), 'samesite=')) {
                $missingFlags[] = 'SameSite';
            }

            if ($missingFlags !== []) {
                $cookieIssues[] = ['cookie' => $cookie, 'missing' => $missingFlags];
            }
        }

        if ($cookieIssues !== []) {
            $issues[] = $this->upsertFinding(
                projectId: $projectId,
                type: 'insecure_session_cookie',
                title: 'Session cookie hardening issue on '.$target,
                severity: 'medium',
                summary: 'Observed session cookies without Secure, HttpOnly, or SameSite flags.',
                confidence: 'high',
                evidence: ['target' => $target, 'url' => $response['url'], 'cookies' => $cookieIssues],
                affectedEntityId: $host?->id
            );
        }

        return array_values(array_filter($issues));
    }

    private function evaluatePortExposure(int $projectId, string $target, ?MetisHostEntity $host): array
    {
        if (! $host) {
            return [];
        }

        $ports = collect($host->open_ports ?? [])
            ->map(fn ($port) => (int) $port)
            ->filter()
            ->values()
            ->all();

        $issues = [];
        $managementPorts = array_values(array_intersect($ports, [21, 23, 2375, 5985, 6379, 9200]));
        $databasePorts = array_values(array_intersect($ports, [3306, 5432, 27017, 11211]));

        if ($managementPorts !== []) {
            $issues[] = $this->upsertFinding(
                projectId: $projectId,
                type: 'exposed_management_port',
                title: 'Management ports exposed on '.$target,
                severity: 'high',
                summary: 'Potentially sensitive management or admin ports were observed on the host.',
                confidence: 'medium',
                evidence: ['target' => $target, 'ports' => $managementPorts],
                affectedEntityId: $host->id
            );
        }

        if ($databasePorts !== []) {
            $issues[] = $this->upsertFinding(
                projectId: $projectId,
                type: 'database_port_exposed',
                title: 'Database ports exposed on '.$target,
                severity: 'medium',
                summary: 'Database-related ports were observed on the host. Validate network exposure and ACLs.',
                confidence: 'medium',
                evidence: ['target' => $target, 'ports' => $databasePorts],
                affectedEntityId: $host->id
            );
        }

        return array_values(array_filter($issues));
    }

    private function evaluateIamControls(int $projectId, string $target, array $response): array
    {
        $headers = $this->normalizeHeaders($response['headers'] ?? []);
        $issues = [];
        $findings = [];

        if (! Str::contains(Str::lower((string) ($headers['cache-control'][0] ?? $headers['cache-control'] ?? '')), 'no-store')) {
            $issues[] = 'Auth response should include Cache-Control: no-store.';
        }

        if (empty($headers['referrer-policy'])) {
            $issues[] = 'Missing Referrer-Policy on authentication surface.';
        }

        if (empty($headers['permissions-policy'])) {
            $issues[] = 'Missing Permissions-Policy on authentication surface.';
        }

        $setCookies = $headers['set-cookie'] ?? [];
        foreach ($setCookies as $cookie) {
            if (! Str::contains(Str::lower($cookie), 'secure') || ! Str::contains(Str::lower($cookie), 'httponly') || ! Str::contains(Str::lower($cookie), 'samesite=')) {
                $issues[] = 'One or more auth cookies are missing Secure/HttpOnly/SameSite flags.';
                break;
            }
        }

        if ($issues !== []) {
            $findings[] = $this->upsertFinding(
                projectId: $projectId,
                type: 'iam_session_policy',
                title: 'IAM/session policy gap on '.$target,
                severity: 'medium',
                summary: 'Authentication-related headers or cookie controls are weaker than expected.',
                confidence: 'medium',
                evidence: ['target' => $target, 'url' => $response['url'], 'issues' => $issues]
            );
        }

        return $findings;
    }

    private function validateDirectoryFinding(array $evidence): bool
    {
        $response = $this->requestTarget((string) ($evidence['target'] ?? ''), (string) ($evidence['path'] ?? '/'));

        return $response ? $this->shouldReportDiscoveryPath((string) ($evidence['path'] ?? '/'), (int) $response['status']) : false;
    }

    private function validateHttpFinding(string $type, array $evidence): bool
    {
        $response = $this->requestTarget((string) ($evidence['target'] ?? ''), '/');

        if (! $response) {
            return false;
        }

        $headers = $this->normalizeHeaders($response['headers'] ?? []);

        return match ($type) {
            'missing_hsts' => empty($headers['strict-transport-security']),
            'missing_csp' => empty($headers['content-security-policy']),
            'missing_x_frame_options' => empty($headers['x-frame-options']),
            'insecure_session_cookie', 'iam_session_policy' => $this->hasInsecureCookies($headers),
            default => true,
        };
    }

    private function validatePortFinding($hosts, string $type, array $evidence): bool
    {
        $target = $evidence['target'] ?? null;
        $ports = collect($evidence['ports'] ?? [])->map(fn ($port) => (int) $port)->all();
        $host = $hosts->first(fn (MetisHostEntity $entity) => $entity->hostname === $target);

        if (! $host) {
            return false;
        }

        $openPorts = collect($host->open_ports ?? [])->map(fn ($port) => (int) $port)->all();

        return match ($type) {
            'exposed_management_port', 'database_port_exposed' => array_intersect($ports, $openPorts) !== [],
            default => true,
        };
    }

    private function hasInsecureCookies(array $headers): bool
    {
        foreach ($headers['set-cookie'] ?? [] as $cookie) {
            if (! Str::contains(Str::lower($cookie), 'secure')
                || ! Str::contains(Str::lower($cookie), 'httponly')
                || ! Str::contains(Str::lower($cookie), 'samesite=')) {
                return true;
            }
        }

        return false;
    }

    private function normalizeHeaders(array $headers): array
    {
        $normalized = [];

        foreach ($headers as $key => $value) {
            $normalized[Str::lower((string) $key)] = is_array($value) ? $value : [$value];
        }

        return $normalized;
    }

    private function isHtmlResponse(array $headers): bool
    {
        $contentType = Str::lower((string) (($headers['content-type'][0] ?? null) ?? ''));

        return Str::contains($contentType, 'text/html');
    }

    private function upsertFinding(
        int $projectId,
        string $type,
        string $title,
        string $severity,
        string $summary,
        string $confidence,
        array $evidence,
        ?int $affectedEntityId = null,
    ): string {
        MetisFindingEntity::query()->updateOrCreate(
            [
                'project_id' => $projectId,
                'type' => $type,
                'title' => $title,
            ],
            [
                'severity' => $severity,
                'summary' => $summary,
                'confidence' => $confidence,
                'status' => 'open',
                'evidence_json' => $evidence,
                'affected_entity_type' => $affectedEntityId ? 'host' : null,
                'affected_entity_id' => $affectedEntityId,
            ]
        );

        return $title;
    }
}

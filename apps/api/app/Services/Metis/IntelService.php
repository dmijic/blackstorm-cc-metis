<?php

namespace App\Services\Metis;

use App\Models\MetisDomainEntity;
use App\Models\MetisFindingEntity;
use App\Models\MetisIntelHit;
use App\Models\MetisJobRun;
use App\Models\MetisModule;
use App\Models\MetisProject;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class IntelService
{
    public function githubHints(MetisJobRun $run): array
    {
        $project = MetisProject::query()->with(['scope', 'domainEntities'])->findOrFail($run->project_id);
        $orgs = collect($project->scope?->github_orgs ?? [])
            ->filter()
            ->map(fn ($org) => trim((string) $org))
            ->values()
            ->all();

        if ($orgs === []) {
            throw new \InvalidArgumentException('No GitHub organizations defined in scope.');
        }

        $run->markStarted();

        $config = MetisModule::enabledConfig('github_public');
        $headers = [
            'Accept' => 'application/vnd.github+json',
            'User-Agent' => $config['user_agent'] ?? 'Metis-CommandCenter/1.0',
            'X-GitHub-Api-Version' => '2022-11-28',
        ];

        if (! empty($config['api_token'])) {
            $headers['Authorization'] = 'Bearer '.$config['api_token'];
        }

        $keywords = collect([
            ...($project->scope?->brand_keywords ?? []),
            ...($project->scope?->root_domains ?? []),
            ...($project->scope?->email_domains ?? []),
        ])
            ->map(fn ($value) => Str::lower(trim((string) $value)))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $domains = collect($project->scope?->root_domains ?? [])
            ->map(fn ($domain) => Str::lower(trim((string) $domain)))
            ->filter()
            ->values()
            ->all();

        $results = [];
        $repoCount = 0;
        $hintCount = 0;

        foreach ($orgs as $org) {
            $repos = $this->fetchGithubRepos($org, $headers);
            $repoCount += count($repos);

            $matchedRepos = [];

            foreach ($repos as $repo) {
                $analysis = $this->analyzeGithubRepo($repo, $keywords, $domains);

                if ($analysis['matched_terms'] === [] && $analysis['matched_domains'] === []) {
                    continue;
                }

                $matchedRepos[] = $analysis;
                $hintCount++;
                $this->recordGithubFinding($project, $analysis);
            }

            $results[] = [
                'org' => $org,
                'repo_count' => count($repos),
                'matches' => $matchedRepos,
            ];
        }

        $payload = [
            'orgs' => $results,
            'repo_count' => $repoCount,
            'hint_count' => $hintCount,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'orgs' => count($orgs),
            'repos' => $repoCount,
            'hints' => $hintCount,
        ]);

        return $payload;
    }

    public function hibpScan(MetisJobRun $run): array
    {
        $config = MetisModule::enabledConfig('hibp');

        if (empty($config['api_key'])) {
            throw new \RuntimeException('HIBP module is not configured.');
        }

        $project = MetisProject::query()->with('scope')->findOrFail($run->project_id);
        $run->markStarted();

        $service = new HibpService($config['api_key']);
        $hits = $service->scanProjectDomains($project);
        $accountCount = 0;

        foreach ($hits as $hit) {
            $accountCount += (int) ($hit['total'] ?? 0);

            MetisIntelHit::query()->updateOrCreate(
                [
                    'project_id' => $project->id,
                    'provider_type' => 'hibp',
                    'hit_type' => 'breach_data',
                    'title' => 'HIBP breach exposure for '.$hit['domain'],
                ],
                [
                    'severity' => $this->severityFromAccountCount((int) ($hit['total'] ?? 0)),
                    'summary' => sprintf(
                        'HIBP reported %d breached account aliases for %s.',
                        (int) ($hit['total'] ?? 0),
                        $hit['domain']
                    ),
                    'raw_data' => $hit,
                    'source_url' => 'https://haveibeenpwned.com/API/v3',
                    'matched_keyword' => $hit['domain'],
                    'acknowledged' => false,
                    'discovered_at' => now(),
                ]
            );

            $this->recordFinding(
                projectId: $project->id,
                type: 'credential_leak_surface',
                severity: $this->severityFromAccountCount((int) ($hit['total'] ?? 0)),
                title: 'Credential leak signal for '.$hit['domain'],
                summary: sprintf(
                    'Public breach metadata indicates %d account aliases for %s. Review impacted users and enforce credential resets if required.',
                    (int) ($hit['total'] ?? 0),
                    $hit['domain']
                ),
                confidence: 'high',
                evidence: $hit
            );
        }

        $payload = [
            'domains' => $hits,
            'domains_with_hits' => count($hits),
            'accounts' => $accountCount,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'domains' => count($hits),
            'accounts' => $accountCount,
        ]);

        return $payload;
    }

    public function ctiExposure(MetisJobRun $run): array
    {
        $config = MetisModule::enabledConfig('shodan');

        if (empty($config['api_key'])) {
            throw new \RuntimeException('Shodan module is not configured.');
        }

        $project = MetisProject::query()->with(['scope', 'hostEntities'])->findOrFail($run->project_id);
        $targets = $project->hostEntities
            ->pluck('ip')
            ->filter(fn ($ip) => filter_var($ip, FILTER_VALIDATE_IP))
            ->unique()
            ->values()
            ->all();

        if ($targets === []) {
            throw new \InvalidArgumentException('No host IPs available. Run HTTP probe first to populate host entities.');
        }

        $run->markStarted();

        $service = new ShodanService($config['api_key']);
        $results = [];
        $hitCount = 0;

        foreach ($targets as $ip) {
            $data = $service->hostMinify($ip);

            if ($data === []) {
                continue;
            }

            $ports = collect($data['ports'] ?? [])
                ->map(fn ($port) => (int) $port)
                ->filter()
                ->values()
                ->all();

            $results[] = [
                'ip' => $ip,
                'ports' => $ports,
                'country' => $data['country_name'] ?? null,
                'org' => $data['org'] ?? null,
                'hostnames' => $data['hostnames'] ?? [],
            ];

            $hitCount++;

            MetisIntelHit::query()->updateOrCreate(
                [
                    'project_id' => $project->id,
                    'provider_type' => 'shodan',
                    'hit_type' => 'shodan_exposure',
                    'title' => 'Shodan exposure for '.$ip,
                ],
                [
                    'severity' => $this->severityFromPorts($ports),
                    'summary' => sprintf(
                        'Passive Shodan exposure shows %d open ports for %s.',
                        count($ports),
                        $ip
                    ),
                    'raw_data' => $data,
                    'source_url' => 'https://developer.shodan.io/api',
                    'matched_keyword' => $ip,
                    'acknowledged' => false,
                    'discovered_at' => now(),
                ]
            );

            $this->recordFinding(
                projectId: $project->id,
                type: 'external_exposure',
                severity: $this->severityFromPorts($ports),
                title: 'External exposure signal for '.$ip,
                summary: sprintf(
                    'Shodan currently indexes %d exposed ports for %s. Validate whether each service is expected.',
                    count($ports),
                    $ip
                ),
                confidence: 'medium',
                evidence: ['ip' => $ip, 'ports' => $ports, 'source' => 'shodan']
            );
        }

        $payload = [
            'targets' => $results,
            'hits' => $hitCount,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'targets' => count($targets),
            'hits' => $hitCount,
        ]);

        return $payload;
    }

    private function fetchGithubRepos(string $org, array $headers): array
    {
        $repos = [];

        for ($page = 1; $page <= 2; $page++) {
            $response = Http::timeout(20)
                ->withHeaders($headers)
                ->get("https://api.github.com/orgs/{$org}/repos", [
                    'type' => 'public',
                    'sort' => 'updated',
                    'per_page' => 100,
                    'page' => $page,
                ]);

            if (! $response->ok()) {
                break;
            }

            $pageRepos = $response->json() ?? [];
            $repos = [...$repos, ...$pageRepos];

            if (count($pageRepos) < 100) {
                break;
            }
        }

        return $repos;
    }

    private function analyzeGithubRepo(array $repo, array $keywords, array $domains): array
    {
        $description = Str::lower((string) ($repo['description'] ?? ''));
        $homepage = Str::lower((string) ($repo['homepage'] ?? ''));
        $name = Str::lower((string) ($repo['full_name'] ?? $repo['name'] ?? ''));
        $topics = collect($repo['topics'] ?? [])->map(fn ($topic) => Str::lower((string) $topic))->all();

        $matchedTerms = [];
        foreach ($keywords as $keyword) {
            if ($keyword === '') {
                continue;
            }

            if (Str::contains($description, $keyword) || Str::contains($homepage, $keyword) || Str::contains($name, $keyword) || in_array($keyword, $topics, true)) {
                $matchedTerms[] = $keyword;
            }
        }

        $matchedDomains = [];
        foreach ($domains as $domain) {
            if ($domain === '') {
                continue;
            }

            if (Str::contains($homepage, $domain) || Str::contains($description, $domain)) {
                $matchedDomains[] = $domain;
            }
        }

        return [
            'full_name' => $repo['full_name'] ?? $repo['name'] ?? 'unknown',
            'html_url' => $repo['html_url'] ?? null,
            'description' => $repo['description'] ?? null,
            'homepage' => $repo['homepage'] ?? null,
            'language' => $repo['language'] ?? null,
            'archived' => (bool) ($repo['archived'] ?? false),
            'topics' => $repo['topics'] ?? [],
            'matched_terms' => array_values(array_unique($matchedTerms)),
            'matched_domains' => array_values(array_unique($matchedDomains)),
        ];
    }

    private function recordGithubFinding(MetisProject $project, array $analysis): void
    {
        $matchedDomain = $analysis['matched_domains'][0] ?? null;
        $affectedDomain = $matchedDomain
            ? $project->domainEntities->first(fn (MetisDomainEntity $entity) => $entity->domain === $matchedDomain)
            : null;

        MetisFindingEntity::query()->updateOrCreate(
            [
                'project_id' => $project->id,
                'type' => 'public_code_hint',
                'title' => 'Public GitHub hint: '.$analysis['full_name'],
            ],
            [
                'severity' => $matchedDomain ? 'low' : 'info',
                'summary' => $matchedDomain
                    ? "Public repository {$analysis['full_name']} references {$matchedDomain}."
                    : "Public repository {$analysis['full_name']} matched configured brand keywords.",
                'confidence' => $matchedDomain ? 'high' : 'medium',
                'status' => 'open',
                'evidence_json' => $analysis,
                'affected_entity_type' => $affectedDomain ? 'domain' : null,
                'affected_entity_id' => $affectedDomain?->id,
            ]
        );
    }

    private function recordFinding(
        int $projectId,
        string $type,
        string $severity,
        string $title,
        string $summary,
        string $confidence,
        array $evidence,
        ?string $affectedEntityType = null,
        ?int $affectedEntityId = null,
    ): void {
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
                'affected_entity_type' => $affectedEntityType,
                'affected_entity_id' => $affectedEntityId,
            ]
        );
    }

    private function severityFromAccountCount(int $count): string
    {
        return match (true) {
            $count >= 25 => 'high',
            $count >= 5 => 'medium',
            default => 'low',
        };
    }

    private function severityFromPorts(array $ports): string
    {
        $highRiskPorts = [21, 23, 2375, 5985, 6379, 9200, 11211, 27017];

        if (array_intersect($ports, $highRiskPorts) !== []) {
            return 'high';
        }

        return count($ports) >= 5 ? 'medium' : 'low';
    }
}

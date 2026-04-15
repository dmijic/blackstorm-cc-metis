<?php

namespace App\Services\Metis;

use App\Models\MetisDomainEntity;
use App\Models\MetisDomainVerification;
use App\Models\MetisHostEntity;
use App\Models\MetisJobRun;
use App\Models\MetisUrlEntity;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ReconService
{
    /**
     * Passive DNS lookup: A, AAAA, CNAME, MX, NS, TXT records + RDAP.
     */
    public function dnsLookup(MetisJobRun $run): array
    {
        $domain = $this->normalizeDomain($run->params_json['domain'] ?? null);
        $projectId = $run->project_id;

        if (! $domain) {
            throw new \InvalidArgumentException('domain param required');
        }

        $run->markStarted();

        $types = [DNS_A, DNS_AAAA, DNS_CNAME, DNS_MX, DNS_NS, DNS_TXT];
        $records = [];

        foreach ($types as $type) {
            try {
                $resolved = dns_get_record($domain, $type);
                if ($resolved) {
                    $records = array_merge($records, $resolved);
                }
            } catch (\Throwable $e) {
                Log::warning("DNS lookup failed for {$domain}: " . $e->getMessage());
            }
        }

        $rdap = $this->lookupRdap($domain);

        $this->upsertDomainEntity($projectId, $domain, [
            'dns_json' => $records,
            'rdap_json' => $rdap,
            'layer' => 'scope',
            'verified' => $this->isVerifiedDomain($projectId, $domain),
        ]);

        $discovered = [];

        foreach ($records as $record) {
            $candidate = $this->normalizeDomain($record['host'] ?? $record['target'] ?? null);

            if (! $candidate || $candidate === $domain) {
                continue;
            }

            $discovered[] = $candidate;

            $this->upsertDomainEntity($projectId, $candidate, [
                'layer' => 'discovery',
                'verified' => $this->isVerifiedDomain($projectId, $candidate),
            ]);
        }

        $payload = [
            'domain' => $domain,
            'dns_records' => $records,
            'rdap' => $rdap,
            'discovered_subdomains' => array_values(array_unique($discovered)),
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'dns_records' => count($records),
            'discovered_hosts' => count($payload['discovered_subdomains']),
            'rdap' => empty($rdap) ? 'missing' : 'ok',
        ]);

        return $payload;
    }

    /**
     * Certificate Transparency lookup via crt.sh API.
     */
    public function ctLookup(MetisJobRun $run): array
    {
        $domain = $this->normalizeDomain($run->params_json['domain'] ?? null);
        $projectId = $run->project_id;

        if (! $domain) {
            throw new \InvalidArgumentException('domain param required');
        }

        $run->markStarted();

        $response = Http::timeout(30)->get('https://crt.sh/', [
            'q' => "%.$domain",
            'output' => 'json',
        ]);

        if (! $response->successful()) {
            $run->markFailed('crt.sh returned: ' . $response->status());

            return [];
        }

        $entries = $response->json() ?? [];
        $subdomains = [];

        foreach ($entries as $entry) {
            $names = explode("\n", (string) ($entry['name_value'] ?? ''));

            foreach ($names as $name) {
                $name = $this->normalizeDomain($name);

                if (! $name) {
                    continue;
                }

                if ($name === $domain || str_ends_with($name, '.' . $domain)) {
                    $subdomains[] = $name;
                }
            }
        }

        $subdomains = array_values(array_unique($subdomains));

        foreach ($subdomains as $subdomain) {
            $this->upsertDomainEntity($projectId, $subdomain, [
                'layer' => 'discovery',
                'verified' => $this->isVerifiedDomain($projectId, $subdomain),
                'ct_sources_json' => [[
                    'source' => 'crt.sh',
                    'domain' => $domain,
                ]],
            ]);
        }

        $payload = [
            'domain' => $domain,
            'entries' => $entries,
            'subdomains' => $subdomains,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'ct_entries' => count($entries),
            'unique_subdomains' => count($subdomains),
        ]);

        return $payload;
    }

    /**
     * Passive subdomain discovery through the internal go-tools sidecar.
     */
    public function subfinder(MetisJobRun $run, ToolsClientService $tools): array
    {
        $domain = $this->normalizeDomain($run->params_json['domain'] ?? null);
        $projectId = $run->project_id;

        if (! $domain) {
            throw new \InvalidArgumentException('domain param required');
        }

        $run->markStarted();

        $subdomains = collect($tools->subfinder($domain))
            ->map(fn ($item) => $this->normalizeDomain(is_array($item) ? ($item['host'] ?? null) : $item))
            ->filter()
            ->filter(fn ($item) => $item === $domain || str_ends_with($item, '.' . $domain))
            ->unique()
            ->values()
            ->all();

        foreach ($subdomains as $subdomain) {
            $this->upsertDomainEntity($projectId, $subdomain, [
                'layer' => 'discovery',
                'verified' => $this->isVerifiedDomain($projectId, $subdomain),
                'ct_sources_json' => [[
                    'source' => 'subfinder',
                    'domain' => $domain,
                ]],
            ]);
        }

        $payload = [
            'domain' => $domain,
            'subdomains' => $subdomains,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'tool' => 'subfinder',
            'unique_subdomains' => count($subdomains),
        ]);

        return $payload;
    }

    /**
     * HTTP probe: capture status, title, server, final URL.
     * Verified scope or approved IP ranges only, unless God Mode is enabled for an admin.
     */
    public function httpProbe(MetisJobRun $run, ScopeVerifierService $scopeVerifier): array
    {
        $hosts = collect($run->params_json['hosts'] ?? [])
            ->filter(fn ($host) => is_string($host) && trim($host) !== '')
            ->map(fn ($host) => strtolower(trim($host)))
            ->unique()
            ->values()
            ->all();

        if ($hosts === []) {
            throw new \InvalidArgumentException('hosts param required');
        }

        $run->markStarted();

        $results = [];
        $live = 0;
        $blocked = 0;
        $bypass = $scopeVerifier->canBypassActiveScope($run->creator);

        foreach ($hosts as $hostname) {
            if (! $bypass && ! $scopeVerifier->isTargetInAuthorizedScope($run->project_id, $hostname)) {
                Log::warning("Metis HTTP probe blocked: {$hostname} not in authorized scope for project {$run->project_id}");
                $results[$hostname] = ['blocked' => true, 'reason' => 'not_in_authorized_scope'];
                $blocked++;
                continue;
            }

            $probeResult = $this->probeHost($hostname);
            $results[$hostname] = $probeResult;

            $this->upsertHostEntity($run->project_id, $hostname, [
                'ip' => $probeResult['ip'] ?? null,
                'http_json' => $probeResult,
                'http_status' => $probeResult['status'] ?? null,
                'is_live' => ! empty($probeResult['status']),
            ]);

            if (! empty($probeResult['status'])) {
                $live++;
            }
        }

        $run->storeOutput([
            'hosts' => $results,
            'god_mode_bypass' => $bypass,
        ]);

        $run->markCompleted([
            'hosts_probed' => count($hosts),
            'live_hosts' => $live,
            'blocked' => $blocked,
        ]);

        return $results;
    }

    /**
     * Wayback Machine CDX API: fetch historical URLs.
     */
    public function waybackFetch(MetisJobRun $run): array
    {
        $domain = $this->normalizeDomain($run->params_json['domain'] ?? null);
        $projectId = $run->project_id;

        if (! $domain) {
            throw new \InvalidArgumentException('domain param required');
        }

        $run->markStarted();

        $response = Http::timeout(30)->get('https://web.archive.org/cdx/search/cdx', [
            'url' => "*.$domain/*",
            'output' => 'json',
            'fl' => 'original,statuscode,timestamp',
            'collapse' => 'urlkey',
            'limit' => 2000,
        ]);

        if (! $response->successful()) {
            $run->markFailed('Wayback CDX returned: ' . $response->status());

            return [];
        }

        $rows = $response->json() ?? [];
        array_shift($rows);

        $added = 0;

        foreach ($rows as $row) {
            [$url, $status, $timestamp] = $row;

            $firstSeen = Carbon::createFromFormat('YmdHis', $timestamp)->toDateTimeString();
            $created = $this->upsertUrlEntity($projectId, $url, [
                'source' => 'wayback',
                'status_code' => $status,
                'first_seen' => $firstSeen,
            ]);

            if ($created->wasRecentlyCreated) {
                $added++;
            }
        }

        $payload = [
            'domain' => $domain,
            'rows' => $rows,
        ];

        $run->storeOutput($payload);
        $run->markCompleted([
            'wayback_urls' => count($rows),
            'new_urls' => $added,
        ]);

        return ['total' => count($rows), 'new' => $added];
    }

    /**
     * Verified-scope-only port scan via the internal naabu sidecar.
     */
    public function portScan(
        MetisJobRun $run,
        ScopeVerifierService $scopeVerifier,
        ToolsClientService $tools
    ): array {
        $targets = collect($run->params_json['hosts'] ?? [$run->params_json['host'] ?? null])
            ->filter(fn ($host) => is_string($host) && trim($host) !== '')
            ->map(fn ($host) => strtolower(trim($host)))
            ->unique()
            ->values()
            ->all();

        if ($targets === []) {
            throw new \InvalidArgumentException('host or hosts param required');
        }

        $ports = trim((string) ($run->params_json['ports'] ?? ''));

        $run->markStarted();

        $results = [];
        $totalPorts = 0;
        $blocked = 0;
        $bypass = $scopeVerifier->canBypassActiveScope($run->creator);

        foreach ($targets as $target) {
            if (! $bypass && ! $scopeVerifier->isTargetInAuthorizedScope($run->project_id, $target)) {
                $results[$target] = ['blocked' => true, 'reason' => 'not_in_authorized_scope'];
                $blocked++;
                continue;
            }

            $scanResults = $tools->naabu($target, $ports);
            $openPorts = collect($scanResults)
                ->pluck('port')
                ->map(fn ($port) => (int) $port)
                ->filter()
                ->unique()
                ->sort()
                ->values()
                ->all();

            $results[$target] = [
                'open_ports' => $openPorts,
                'raw' => $scanResults,
            ];

            $this->upsertHostEntity($run->project_id, $target, [
                'ip' => filter_var($target, FILTER_VALIDATE_IP) ? $target : null,
                'open_ports' => $openPorts,
            ]);

            $totalPorts += count($openPorts);
        }

        $run->storeOutput([
            'targets' => $results,
            'requested_ports' => $ports,
            'god_mode_bypass' => $bypass,
        ]);

        $run->markCompleted([
            'targets_scanned' => count($targets),
            'open_ports' => $totalPorts,
            'blocked' => $blocked,
        ]);

        return $results;
    }

    private function probeHost(string $hostname): array
    {
        foreach (['https', 'http'] as $scheme) {
            try {
                $response = Http::timeout(10)
                    ->withOptions([
                        'verify' => true,
                        'allow_redirects' => ['max' => 5, 'track_redirects' => true],
                    ])
                    ->withHeaders(['User-Agent' => 'Metis-Recon/1.0 (authorized security assessment)'])
                    ->get("{$scheme}://{$hostname}/");

                $title = '';
                if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $response->body(), $match)) {
                    $title = trim($match[1]);
                }

                return [
                    'scheme' => $scheme,
                    'status' => $response->status(),
                    'final_url' => $response->effectiveUri()?->__toString() ?? "{$scheme}://{$hostname}/",
                    'server' => $response->header('Server') ?: null,
                    'title' => mb_substr($title, 0, 200),
                    'powered_by' => $response->header('X-Powered-By') ?: null,
                    'ip' => @gethostbyname($hostname) ?: null,
                    'probed_at' => now()->toIso8601String(),
                ];
            } catch (\Throwable) {
                // Try the next scheme.
            }
        }

        return [
            'status' => null,
            'error' => 'unreachable',
            'probed_at' => now()->toIso8601String(),
        ];
    }

    private function lookupRdap(string $domain): array
    {
        try {
            $response = Http::timeout(15)->get("https://rdap.org/domain/{$domain}");

            if (! $response->ok()) {
                return [];
            }

            return $response->json() ?? [];
        } catch (\Throwable $e) {
            Log::debug('RDAP lookup failed', ['domain' => $domain, 'error' => $e->getMessage()]);

            return [];
        }
    }

    private function upsertDomainEntity(int $projectId, string $domain, array $attributes = []): MetisDomainEntity
    {
        $entity = MetisDomainEntity::query()->firstOrNew([
            'project_id' => $projectId,
            'domain' => $domain,
        ]);

        $entity->fill($attributes);
        $entity->first_seen = $entity->first_seen ?? now();
        $entity->last_seen = now();
        $entity->save();

        return $entity;
    }

    private function upsertHostEntity(int $projectId, string $hostname, array $attributes = []): MetisHostEntity
    {
        $entity = MetisHostEntity::query()->firstOrNew([
            'project_id' => $projectId,
            'hostname' => $hostname,
        ]);

        $entity->fill($attributes);
        $entity->first_seen = $entity->first_seen ?? now();
        $entity->last_seen = now();
        $entity->save();

        return $entity;
    }

    private function upsertUrlEntity(int $projectId, string $url, array $attributes = []): MetisUrlEntity
    {
        $entity = MetisUrlEntity::query()->firstOrNew([
            'project_id' => $projectId,
            'url' => $url,
        ]);

        $entity->fill($attributes);
        $entity->first_seen = $entity->first_seen ?? now();
        $entity->last_seen = now();
        $entity->save();

        return $entity;
    }

    private function isVerifiedDomain(int $projectId, string $domain): bool
    {
        return MetisDomainVerification::query()
            ->where('project_id', $projectId)
            ->where('status', 'verified')
            ->where('domain', $domain)
            ->exists();
    }

    private function normalizeDomain(?string $domain): ?string
    {
        $normalized = strtolower(trim((string) $domain));
        $normalized = rtrim($normalized, '.');

        return $normalized !== '' ? $normalized : null;
    }
}

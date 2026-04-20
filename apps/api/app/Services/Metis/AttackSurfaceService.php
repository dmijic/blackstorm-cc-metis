<?php

namespace App\Services\Metis;

use App\Models\MetisAuditLog;
use App\Models\MetisDomainEntity;
use App\Models\MetisEmergencyOverride;
use App\Models\MetisHostEntity;
use App\Models\MetisInfraGroup;
use App\Models\MetisInfraGroupAsset;
use App\Models\MetisProject;
use App\Models\MetisWorkflowRun;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

class AttackSurfaceService
{
    public function normalizeDnsMappings(MetisProject $project): array
    {
        $project->loadMissing(['domainEntities', 'hostEntities']);

        $records = [];
        $aRecords = [];
        $aaaaRecords = [];
        $reverseMap = [];

        foreach ($project->domainEntities as $domain) {
            $ips = [];
            $dnsRecords = collect($domain->dns_json ?? []);

            foreach ($dnsRecords as $record) {
                $ip = $record['ip'] ?? $record['ipv6'] ?? null;
                if ($ip && filter_var($ip, FILTER_VALIDATE_IP)) {
                    $ips[] = $ip;
                    $records[] = $record;

                    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                        $aRecords[] = ['domain' => $domain->domain, 'ip' => $ip];
                    } elseif (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
                        $aaaaRecords[] = ['domain' => $domain->domain, 'ip' => $ip];
                    }

                    $reverseMap[$ip] ??= [];
                    $reverseMap[$ip][] = $domain->domain;
                    $reverseMap[$ip] = array_values(array_unique($reverseMap[$ip]));
                }
            }

            $domain->update([
                'related_ips_json' => array_values(array_unique($ips)),
                'dns_summary_json' => $this->summarizeDns($dnsRecords->all()),
                'ownership_summary_json' => $this->summarizeOwnership($domain->rdap_json ?? []),
                'provider_hint' => $this->providerHintFromDns($dnsRecords->all()),
                'classification' => $domain->verified ? 'verified_domain' : 'discovered_domain',
            ]);

            foreach (array_values(array_unique($ips)) as $ip) {
                $host = MetisHostEntity::query()->firstOrNew([
                    'project_id' => $project->id,
                    'hostname' => $domain->domain,
                ]);

                $ipAddresses = collect($host->ip_addresses_json ?? [])
                    ->push($ip)
                    ->filter()
                    ->unique()
                    ->values()
                    ->all();

                $host->fill([
                    'ip' => $host->ip ?: $ip,
                    'ip_addresses_json' => $ipAddresses,
                    'provider_hint' => $host->provider_hint ?: $domain->provider_hint,
                ]);
                $host->first_seen = $host->first_seen ?? now();
                $host->last_seen = now();
                $host->save();
            }
        }

        return [
            'records' => $records,
            'a_records' => $aRecords,
            'aaaa_records' => $aaaaRecords,
            'reverse_map' => $reverseMap,
        ];
    }

    public function fingerprintTls(MetisProject $project, array $targets, ScopeVerifierService $scopeVerifier, ?MetisEmergencyOverride $override = null): array
    {
        $results = [];

        foreach ($targets as $target) {
            if (! $scopeVerifier->isTargetAllowed($project->id, $target, null, $override, 'tls_fingerprint')) {
                $results[$target] = ['blocked' => true, 'reason' => 'not_in_authorized_scope'];
                continue;
            }

            $context = stream_context_create([
                'ssl' => [
                    'capture_peer_cert' => true,
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                    'SNI_enabled' => true,
                    'peer_name' => $target,
                ],
            ]);

            try {
                $client = @stream_socket_client("ssl://{$target}:443", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $context);
                if (! $client) {
                    $results[$target] = ['error' => 'tls_unreachable'];
                    continue;
                }

                $params = stream_context_get_params($client);
                $cert = $params['options']['ssl']['peer_certificate'] ?? null;

                if (! $cert) {
                    $results[$target] = ['error' => 'tls_certificate_missing'];
                    fclose($client);
                    continue;
                }

                $parsed = openssl_x509_parse($cert) ?: [];
                $fingerprint = openssl_x509_fingerprint($cert, 'sha1') ?: null;
                $normalized = [
                    'fingerprint_sha1' => $fingerprint,
                    'subject' => $parsed['subject'] ?? [],
                    'issuer' => $parsed['issuer'] ?? [],
                    'valid_from' => isset($parsed['validFrom_time_t']) ? date(DATE_ATOM, (int) $parsed['validFrom_time_t']) : null,
                    'valid_to' => isset($parsed['validTo_time_t']) ? date(DATE_ATOM, (int) $parsed['validTo_time_t']) : null,
                    'san' => $this->normalizeSan($parsed['extensions']['subjectAltName'] ?? null),
                ];
                fclose($client);

                $host = MetisHostEntity::query()->firstOrNew([
                    'project_id' => $project->id,
                    'hostname' => $target,
                ]);
                $host->fill(['tls_json' => $normalized]);
                $host->first_seen = $host->first_seen ?? now();
                $host->last_seen = now();
                $host->save();

                $results[$target] = $normalized;
            } catch (\Throwable $e) {
                $results[$target] = ['error' => 'tls_capture_failed', 'message' => $e->getMessage()];
            }
        }

        return $results;
    }

    public function pingCheck(MetisProject $project, array $targets, ScopeVerifierService $scopeVerifier, ?MetisEmergencyOverride $override = null): array
    {
        $results = [];
        $hasPing = trim((string) shell_exec('command -v ping 2>/dev/null')) !== '';

        foreach ($targets as $target) {
            if (! $scopeVerifier->isTargetAllowed($project->id, $target, null, $override, 'ping_check')) {
                $results[$target] = ['blocked' => true, 'reason' => 'not_in_authorized_scope'];
                continue;
            }

            if (! $hasPing) {
                $results[$target] = ['status' => 'skipped', 'reason' => 'ping_unavailable'];
                continue;
            }

            $process = new Process(['ping', '-c', '1', '-W', '1', $target]);
            $process->setTimeout(5);
            $process->run();

            $payload = [
                'reachable' => $process->isSuccessful(),
                'stdout' => Str::limit($process->getOutput(), 200),
                'stderr' => Str::limit($process->getErrorOutput(), 200),
            ];

            $host = MetisHostEntity::query()->firstOrNew([
                'project_id' => $project->id,
                'hostname' => $target,
            ]);
            $network = $host->network_json ?? [];
            $network['ping'] = $payload;
            $host->fill(['network_json' => $network]);
            $host->first_seen = $host->first_seen ?? now();
            $host->last_seen = now();
            $host->save();

            $results[$target] = $payload;
        }

        return $results;
    }

    public function bannerGrab(MetisProject $project, array $targets, ScopeVerifierService $scopeVerifier, ?MetisEmergencyOverride $override = null): array
    {
        $results = [];

        foreach ($targets as $target) {
            if (! $scopeVerifier->isTargetAllowed($project->id, $target, null, $override, 'banner_grab')) {
                $results[$target] = ['blocked' => true, 'reason' => 'not_in_authorized_scope'];
                continue;
            }

            $host = MetisHostEntity::query()
                ->where('project_id', $project->id)
                ->where('hostname', $target)
                ->first();
            $ports = collect($host?->open_ports ?? [80, 443])->map(fn ($port) => (int) $port)->filter()->take(5);

            $banners = [];
            foreach ($ports as $port) {
                $banners[] = [
                    'port' => $port,
                    'banner' => $this->captureBanner($target, $port),
                ];
            }

            if ($host) {
                $host->update(['banner_json' => $banners]);
            }

            $results[$target] = $banners;
        }

        return $results;
    }

    public function fingerprintServices(MetisProject $project): array
    {
        $results = [];

        foreach ($project->hostEntities as $host) {
            $http = $host->http_json ?? [];
            $ports = collect($host->open_ports ?? [])->map(fn ($port) => (int) $port)->all();
            $banners = collect($host->banner_json ?? []);
            $serviceFamily = $this->serviceFamily($ports, $http, $banners->all());
            $classification = $this->classifyHttpSurface($http, $host->hostname);
            $providerHint = $host->provider_hint ?: $this->providerHintFromHost($host);

            $serviceJson = [
                'service_family' => $serviceFamily,
                'classification' => $classification,
                'observed' => [
                    'ports' => $ports,
                    'server' => $http['server'] ?? null,
                    'title' => $http['title'] ?? null,
                ],
                'inferred' => [
                    'provider_hint' => $providerHint,
                ],
            ];

            $host->update([
                'service_json' => $serviceJson,
                'classification' => $classification,
                'provider_hint' => $providerHint,
            ]);

            $results[$host->hostname] = $serviceJson;
        }

        return $results;
    }

    public function buildInfrastructureGroups(MetisProject $project, ?MetisWorkflowRun $workflowRun = null): array
    {
        $project->loadMissing(['domainEntities', 'hostEntities', 'urlEntities', 'findingEntities', 'intelHits']);

        MetisInfraGroupAsset::query()->whereIn('infra_group_id', $project->infraGroups()->pluck('id'))->delete();
        MetisInfraGroup::query()->where('project_id', $project->id)->delete();

        $groups = [];
        $groupedByIp = [];
        foreach ($project->hostEntities as $host) {
            foreach (($host->ip_addresses_json ?? array_filter([$host->ip])) as $ip) {
                $groupedByIp[$ip][] = $host;
            }
        }

        foreach ($groupedByIp as $ip => $hosts) {
            if (count($hosts) < 2) {
                continue;
            }

            $group = MetisInfraGroup::query()->create([
                'project_id' => $project->id,
                'workflow_run_id' => $workflowRun?->id,
                'type' => 'shared_ip',
                'name' => 'Shared IP: '.$ip,
                'fingerprint' => $ip,
                'summary' => sprintf('%d assets resolve to %s.', count($hosts), $ip),
                'metadata_json' => ['ip' => $ip],
                'asset_count' => count($hosts),
                'first_seen' => now(),
                'last_seen' => now(),
            ]);

            foreach ($hosts as $host) {
                $group->assets()->create([
                    'entity_type' => 'host',
                    'entity_id' => $host->id,
                    'asset_key' => $host->hostname,
                    'label' => $host->hostname,
                    'metadata_json' => ['ip' => $ip, 'classification' => $host->classification],
                ]);
            }

            $groups[] = [
                'id' => $group->id,
                'type' => $group->type,
                'name' => $group->name,
                'assets' => collect($hosts)->pluck('hostname')->values()->all(),
            ];
        }

        $groupedByCert = [];
        foreach ($project->hostEntities as $host) {
            $fingerprint = $host->tls_json['fingerprint_sha1'] ?? null;
            if ($fingerprint) {
                $groupedByCert[$fingerprint][] = $host;
            }
        }

        foreach ($groupedByCert as $fingerprint => $hosts) {
            if (count($hosts) < 2) {
                continue;
            }

            $group = MetisInfraGroup::query()->create([
                'project_id' => $project->id,
                'workflow_run_id' => $workflowRun?->id,
                'type' => 'shared_certificate',
                'name' => 'Shared Certificate',
                'fingerprint' => $fingerprint,
                'summary' => sprintf('%d assets reuse the same TLS certificate.', count($hosts)),
                'metadata_json' => ['fingerprint_sha1' => $fingerprint],
                'asset_count' => count($hosts),
                'first_seen' => now(),
                'last_seen' => now(),
            ]);

            foreach ($hosts as $host) {
                $group->assets()->create([
                    'entity_type' => 'host',
                    'entity_id' => $host->id,
                    'asset_key' => $host->hostname,
                    'label' => $host->hostname,
                    'metadata_json' => ['issuer' => $host->tls_json['issuer'] ?? []],
                ]);
            }

            $groups[] = [
                'id' => $group->id,
                'type' => $group->type,
                'name' => $group->name,
                'assets' => collect($hosts)->pluck('hostname')->values()->all(),
            ];
        }

        $groupedByProvider = [];
        foreach ($project->hostEntities as $host) {
            $providerKey = $host->provider_hint ?: ($host->service_json['observed']['server'] ?? null);
            if ($providerKey) {
                $groupedByProvider[$providerKey][] = $host;
            }
        }

        foreach ($groupedByProvider as $providerKey => $hosts) {
            if (count($hosts) < 2) {
                continue;
            }

            $group = MetisInfraGroup::query()->create([
                'project_id' => $project->id,
                'workflow_run_id' => $workflowRun?->id,
                'type' => 'provider_cluster',
                'name' => 'Provider / Service Cluster: '.$providerKey,
                'fingerprint' => $providerKey,
                'summary' => sprintf('%d assets share the same provider or server hint.', count($hosts)),
                'metadata_json' => ['provider_hint' => $providerKey],
                'asset_count' => count($hosts),
                'first_seen' => now(),
                'last_seen' => now(),
            ]);

            foreach ($hosts as $host) {
                $group->assets()->create([
                    'entity_type' => 'host',
                    'entity_id' => $host->id,
                    'asset_key' => $host->hostname,
                    'label' => $host->hostname,
                    'metadata_json' => ['provider_hint' => $host->provider_hint, 'server' => $host->http_json['server'] ?? null],
                ]);
            }

            $groups[] = [
                'id' => $group->id,
                'type' => $group->type,
                'name' => $group->name,
                'assets' => collect($hosts)->pluck('hostname')->values()->all(),
            ];
        }

        return [
            'groups' => $groups,
            'group_count' => count($groups),
        ];
    }

    public function recommendationSet(MetisProject $project): array
    {
        $recommendations = [];

        if ($project->hostEntities()->where('classification', 'admin/login')->exists()) {
            $recommendations[] = [
                'id' => 'review-admin-panels',
                'title' => 'Review admin/login panels',
                'category' => 'validation',
                'reason' => 'Multiple admin or login surfaces were observed during HTTP classification.',
            ];
        }

        if ($project->hostEntities()->whereNotNull('tls_json')->count() > 1) {
            $recommendations[] = [
                'id' => 'review-cert-reuse',
                'title' => 'Review certificate reuse',
                'category' => 'infra_grouping',
                'reason' => 'TLS fingerprints indicate repeated cert use across multiple assets.',
            ];
        }

        if ($project->scope?->email_domains) {
            $recommendations[] = [
                'id' => 'offer-hibp',
                'title' => 'Offer HIBP scan',
                'category' => 'intel',
                'reason' => 'Email domains exist in scope, so breach metadata enrichment is available.',
            ];
        }

        if ($project->hostEntities()->whereNotNull('open_ports')->exists()) {
            $recommendations[] = [
                'id' => 'offer-vuln-assessment',
                'title' => 'Offer vuln assessment',
                'category' => 'validation',
                'reason' => 'Observed services and open ports can be checked with safe validation heuristics.',
            ];
        }

        return $recommendations;
    }

    private function summarizeDns(array $records): array
    {
        $txt = collect($records)->whereNotNull('txt')->pluck('txt')->values()->all();
        $spfs = collect($txt)->filter(fn ($value) => Str::startsWith(Str::lower((string) $value), 'v=spf1'))->values()->all();
        $dmarc = collect($txt)->filter(fn ($value) => Str::startsWith(Str::lower((string) $value), 'v=dmarc1'))->values()->all();

        return [
            'record_count' => count($records),
            'spf' => $spfs,
            'dmarc' => $dmarc,
            'mx_hosts' => collect($records)->whereNotNull('target')->pluck('target')->values()->all(),
            'ns_hosts' => collect($records)->where('type', 'NS')->pluck('target')->values()->all(),
        ];
    }

    private function summarizeOwnership(array $rdap): array
    {
        return [
            'registrar' => $rdap['registrarName'] ?? $rdap['port43'] ?? null,
            'events' => collect($rdap['events'] ?? [])->take(10)->values()->all(),
            'entities' => collect($rdap['entities'] ?? [])->take(5)->values()->all(),
        ];
    }

    private function providerHintFromDns(array $records): ?string
    {
        $haystack = Str::lower(json_encode($records));

        return match (true) {
            str_contains($haystack, 'cloudflare') => 'cloudflare',
            str_contains($haystack, 'cloudfront') => 'cloudfront',
            str_contains($haystack, 'fastly') => 'fastly',
            str_contains($haystack, 'akamai') => 'akamai',
            default => null,
        };
    }

    private function providerHintFromHost(MetisHostEntity $host): ?string
    {
        $http = Str::lower(json_encode($host->http_json ?? []));
        $tls = Str::lower(json_encode($host->tls_json ?? []));

        return match (true) {
            str_contains($http.$tls, 'cloudflare') => 'cloudflare',
            str_contains($http.$tls, 'cloudfront') => 'cloudfront',
            str_contains($http.$tls, 'fastly') => 'fastly',
            str_contains($http.$tls, 'akamai') => 'akamai',
            default => null,
        };
    }

    private function normalizeSan(?string $subjectAltName): array
    {
        if (! $subjectAltName) {
            return [];
        }

        return collect(explode(',', $subjectAltName))
            ->map(fn ($item) => trim(Str::after($item, ':')))
            ->filter()
            ->values()
            ->all();
    }

    private function captureBanner(string $target, int $port): array
    {
        try {
            $socket = @fsockopen($target, $port, $errno, $errstr, 5);
            if (! $socket) {
                return ['error' => 'connect_failed'];
            }

            stream_set_timeout($socket, 3);

            if (in_array($port, [80, 8080, 8000, 443, 8443], true)) {
                fwrite($socket, "HEAD / HTTP/1.0\r\nHost: {$target}\r\nUser-Agent: Metis-Banner/1.0\r\n\r\n");
            }

            $chunk = fread($socket, 256) ?: '';
            fclose($socket);

            return [
                'observed' => trim($chunk),
                'port' => $port,
            ];
        } catch (\Throwable $e) {
            return ['error' => 'banner_failed', 'message' => $e->getMessage()];
        }
    }

    private function serviceFamily(array $ports, array $http, array $banners): string
    {
        if ($http !== [] && ($http['status'] ?? null)) {
            return 'web';
        }

        return match (true) {
            collect($ports)->contains(22) => 'ssh',
            collect($ports)->contains(fn ($port) => in_array($port, [25, 465, 587, 993, 995], true)) => 'mail',
            collect($ports)->contains(fn ($port) => in_array($port, [3306, 5432, 1433, 27017], true)) => 'database',
            collect($ports)->contains(fn ($port) => in_array($port, [500, 4500, 1194], true)) => 'vpn_remote_access',
            str_contains(Str::lower(json_encode($banners)), 'nginx') || str_contains(Str::lower(json_encode($banners)), 'haproxy') => 'reverse_proxy',
            default => 'unknown',
        };
    }

    private function classifyHttpSurface(array $http, string $hostname): string
    {
        $title = Str::lower((string) ($http['title'] ?? ''));
        $url = Str::lower((string) ($http['final_url'] ?? ''));
        $server = Str::lower((string) ($http['server'] ?? ''));

        return match (true) {
            ($http['status'] ?? null) === null => 'unknown',
            str_contains($title.$url, 'login') || str_contains($title.$url, 'admin') => 'admin/login',
            str_contains($url, '/api') || str_contains((string) ($http['content_type'] ?? ''), 'json') => 'api',
            str_contains($title.$url, 'docs') || str_contains($title, 'swagger') => 'docs',
            in_array((int) ($http['status'] ?? 0), [301, 302, 307, 308], true) => 'redirect-only',
            str_contains($title.$server, 'default') || str_contains($title, 'welcome') => 'placeholder/default page',
            default => 'website',
        };
    }
}

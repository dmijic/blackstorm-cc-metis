<?php

namespace App\Services\Metis;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * CensysService — Censys Search v2 API integration.
 * API docs: https://search.censys.io/api
 *
 * Authentication: Basic auth with api_id:api_secret.
 * Config expected: ['api_id' => '...', 'api_secret' => '...']
 */
class CensysService
{
    private const BASE = 'https://search.censys.io/api/v2';

    public function __construct(
        private readonly string $apiId,
        private readonly string $apiSecret,
    ) {}

    // ── Host search ───────────────────────────────────────────────────────────

    /**
     * Search hosts by query (Censys query language).
     * POST /hosts/search
     */
    public function searchHosts(string $query, int $perPage = 25, ?string $cursor = null): array
    {
        $body = ['q' => $query, 'per_page' => $perPage];
        if ($cursor) {
            $body['cursor'] = $cursor;
        }

        return $this->post('/hosts/search', $body);
    }

    /**
     * Get full host record for an IP.
     * GET /hosts/{ip}
     */
    public function hostView(string $ip): array
    {
        return $this->get("/hosts/{$ip}");
    }

    /**
     * Search hosts by org name.
     */
    public function searchOrg(string $org): array
    {
        return $this->searchHosts("autonomous_system.organization: \"{$org}\"");
    }

    /**
     * Search hosts by domain name (certificate SAN or reverse DNS).
     */
    public function searchDomain(string $domain): array
    {
        return $this->searchHosts("dns.reverse_dns.reverse_dns: \"{$domain}\" or services.tls.certificates.leaf_data.subject.common_name: \"{$domain}\"");
    }

    // ── Certificate search ────────────────────────────────────────────────────

    /**
     * Search certificates by domain.
     * POST /certificates/search
     */
    public function searchCerts(string $domain): array
    {
        return $this->post('/certificates/search', [
            'q'        => "parsed.names: {$domain}",
            'per_page' => 50,
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function get(string $path): array
    {
        try {
            $resp = Http::timeout(15)
                ->withBasicAuth($this->apiId, $this->apiSecret)
                ->get(self::BASE . $path);

            if (! $resp->ok()) {
                Log::debug('CensysService GET error', ['path' => $path, 'status' => $resp->status()]);
                return [];
            }

            return $resp->json()['result'] ?? $resp->json() ?? [];
        } catch (\Throwable $e) {
            Log::warning('CensysService GET failed', ['path' => $path, 'error' => $e->getMessage()]);
            return [];
        }
    }

    private function post(string $path, array $body): array
    {
        try {
            $resp = Http::timeout(15)
                ->withBasicAuth($this->apiId, $this->apiSecret)
                ->post(self::BASE . $path, $body);

            if (! $resp->ok()) {
                Log::debug('CensysService POST error', ['path' => $path, 'status' => $resp->status()]);
                return [];
            }

            return $resp->json()['result'] ?? $resp->json() ?? [];
        } catch (\Throwable $e) {
            Log::warning('CensysService POST failed', ['path' => $path, 'error' => $e->getMessage()]);
            return [];
        }
    }
}

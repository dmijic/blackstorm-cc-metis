<?php

namespace App\Services\Metis;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * ShodanService — Shodan REST API integration.
 * API docs: https://developer.shodan.io/api
 *
 * All methods return raw decoded arrays or throw on critical failures.
 * Non-critical failures (rate limit, 404) return empty arrays.
 */
class ShodanService
{
    private const BASE = 'https://api.shodan.io';

    public function __construct(private readonly string $apiKey) {}

    // ── Host lookup ───────────────────────────────────────────────────────────

    /**
     * Full host info: services, banners, ports, geo, OS, hostnames.
     * GET /shodan/host/{ip}
     */
    public function hostInfo(string $ip): array
    {
        return $this->get("/shodan/host/{$ip}");
    }

    /**
     * Minimal host info — just open ports & geo (faster, fewer credits).
     * GET /shodan/host/{ip}?minify=true
     */
    public function hostMinify(string $ip): array
    {
        return $this->get("/shodan/host/{$ip}", ['minify' => 'true']);
    }

    // ── Search ────────────────────────────────────────────────────────────────

    /**
     * Search Shodan with any query string.
     * GET /shodan/host/search
     */
    public function search(string $query, int $page = 1): array
    {
        return $this->get('/shodan/host/search', [
            'query' => $query,
            'page'  => $page,
        ]);
    }

    /**
     * Search by organisation name (org:"Example Corp").
     */
    public function searchOrg(string $org): array
    {
        return $this->search("org:\"{$org}\"");
    }

    /**
     * Search by hostname pattern (hostname:example.com).
     */
    public function searchHostname(string $domain): array
    {
        return $this->search("hostname:{$domain}");
    }

    /**
     * Search by network CIDR (net:1.2.3.0/24).
     */
    public function searchNet(string $cidr): array
    {
        return $this->search("net:{$cidr}");
    }

    // ── Domain DNS ────────────────────────────────────────────────────────────

    /**
     * All IPs Shodan has seen for a domain's DNS history.
     * GET /dns/domain/{domain}
     */
    public function domainDns(string $domain): array
    {
        return $this->get("/dns/domain/{$domain}");
    }

    // ── Exploit search ────────────────────────────────────────────────────────

    /**
     * Search exploit DB — requires API key with exploit access.
     * GET /exploits/search
     */
    public function exploitSearch(string $query): array
    {
        return $this->get('/exploits/search', ['query' => $query]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Enrich a MetisHostEntity with Shodan data + geo.
     * Updates the model in-place (caller must save()).
     */
    public function enrichHost(\App\Models\MetisHostEntity $host): void
    {
        $ip = $host->ip;
        if (! $ip) {
            return;
        }

        $data = $this->hostMinify($ip);
        if (empty($data)) {
            return;
        }

        $host->shodan_data = $data;

        if (! empty($data['latitude'])) {
            $host->geo_lat = $data['latitude'];
            $host->geo_lon = $data['longitude'];
        }
        if (! empty($data['country_name'])) {
            $host->geo_country = $data['country_name'];
        }
        if (! empty($data['city'])) {
            $host->geo_city = $data['city'];
        }
        if (! empty($data['isp'])) {
            $host->geo_isp = $data['isp'];
        }
        if (! empty($data['org'])) {
            $host->geo_org = $data['org'];
        }

        $host->geo_enriched_at = now();
    }

    private function get(string $path, array $params = []): array
    {
        try {
            $resp = Http::timeout(15)->get(self::BASE . $path, array_merge(
                ['key' => $this->apiKey],
                $params,
            ));

            if ($resp->status() === 404) {
                return [];
            }

            if (! $resp->ok()) {
                Log::debug('ShodanService HTTP error', [
                    'path'   => $path,
                    'status' => $resp->status(),
                ]);
                return [];
            }

            return $resp->json() ?? [];
        } catch (\Throwable $e) {
            Log::warning('ShodanService request failed', ['path' => $path, 'error' => $e->getMessage()]);
            return [];
        }
    }
}

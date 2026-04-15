<?php

namespace App\Services\Metis;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * GeoService — IP geolocation using ip-api.com
 * Free tier: 45 requests/minute (no key required).
 * Fields: lat, lon, country, city, isp, org, status, query
 */
class GeoService
{
    private const BASE = 'http://ip-api.com/json';
    private const FIELDS = 'status,message,country,regionName,city,isp,org,lat,lon,query';

    public function lookup(string $ip): array
    {
        // Skip private / loopback ranges
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return [];
        }

        try {
            $resp = Http::timeout(5)->get(self::BASE . "/{$ip}", ['fields' => self::FIELDS]);

            if (! $resp->ok()) {
                return [];
            }

            $data = $resp->json();

            if (($data['status'] ?? '') !== 'success') {
                return [];
            }

            return [
                'lat'     => $data['lat']        ?? null,
                'lon'     => $data['lon']        ?? null,
                'country' => $data['country']    ?? null,
                'city'    => $data['city']       ?? null,
                'isp'     => $data['isp']        ?? null,
                'org'     => $data['org']        ?? null,
            ];
        } catch (\Throwable $e) {
            Log::debug('GeoService lookup failed', ['ip' => $ip, 'error' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * Batch lookup — ip-api.com supports up to 100 IPs per batch POST.
     * Returns keyed by IP address.
     */
    public function batchLookup(array $ips): array
    {
        // Filter to public IPs only
        $publicIps = array_filter($ips, fn ($ip) =>
            filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false
        );

        if (empty($publicIps)) {
            return [];
        }

        $chunks  = array_chunk(array_values($publicIps), 100);
        $results = [];

        foreach ($chunks as $chunk) {
            try {
                $resp = Http::timeout(10)
                    ->post('http://ip-api.com/batch', array_map(
                        fn ($ip) => ['query' => $ip, 'fields' => self::FIELDS],
                        $chunk,
                    ));

                if (! $resp->ok()) {
                    continue;
                }

                foreach ($resp->json() as $item) {
                    if (($item['status'] ?? '') === 'success') {
                        $results[$item['query']] = [
                            'lat'     => $item['lat']     ?? null,
                            'lon'     => $item['lon']     ?? null,
                            'country' => $item['country'] ?? null,
                            'city'    => $item['city']    ?? null,
                            'isp'     => $item['isp']     ?? null,
                            'org'     => $item['org']     ?? null,
                        ];
                    }
                }
            } catch (\Throwable $e) {
                Log::debug('GeoService batchLookup failed', ['error' => $e->getMessage()]);
            }
        }

        return $results;
    }
}

<?php

namespace App\Services\Metis;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ToolsClientService
{
    public function catalog(): array
    {
        try {
            $response = Http::timeout(10)->get($this->baseUrl() . '/health');

            if (! $response->ok()) {
                return [
                    'reachable' => false,
                    'tools' => [],
                ];
            }

            return [
                'reachable' => true,
                'tools' => $response->json('data') ?? [],
            ];
        } catch (\Throwable $e) {
            Log::debug('Metis tools catalog unavailable', ['error' => $e->getMessage()]);

            return [
                'reachable' => false,
                'tools' => [],
            ];
        }
    }

    public function subfinder(string $domain): array
    {
        $payload = $this->post('/subfinder', ['domain' => $domain]);

        return $payload['data']['subdomains'] ?? [];
    }

    public function naabu(string $host, string $ports = ''): array
    {
        $payload = $this->post('/naabu', [
            'host' => $host,
            'ports' => $ports,
        ]);

        return $payload['data'] ?? [];
    }

    private function post(string $path, array $payload): array
    {
        try {
            $response = Http::timeout(120)->post($this->baseUrl() . $path, $payload);

            if (! $response->ok()) {
                Log::warning('Metis tool call failed', [
                    'path' => $path,
                    'status' => $response->status(),
                ]);

                return [];
            }

            return $response->json() ?? [];
        } catch (\Throwable $e) {
            Log::warning('Metis tool call exception', [
                'path' => $path,
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    private function baseUrl(): string
    {
        return rtrim((string) env('METIS_TOOLS_URL', 'http://go-tools:9090'), '/');
    }
}

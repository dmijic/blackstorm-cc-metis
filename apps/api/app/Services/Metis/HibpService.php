<?php

namespace App\Services\Metis;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * HibpService — HaveIBeenPwned API v3 integration.
 * API docs: https://haveibeenpwned.com/API/v3
 *
 * Requires a paid API key (€3.50/month as of 2026).
 * The breached domain endpoint lists all accounts for a given domain.
 */
class HibpService
{
    private const BASE = 'https://haveibeenpwned.com/api/v3';

    public function __construct(private readonly string $apiKey) {}

    /**
     * Get all breached accounts for an email domain.
     * Returns array of {email, breaches[]} grouped by account.
     * GET /breacheddomain/{domain}
     */
    public function domainBreaches(string $domain): array
    {
        $resp = $this->get("/breacheddomain/{$domain}");

        if (empty($resp)) {
            return [];
        }

        // HIBP returns: {"alias@domain": ["BreachName1", "BreachName2"], ...}
        $accounts = [];
        foreach ($resp as $alias => $breachNames) {
            $accounts[] = [
                'email'    => "{$alias}@{$domain}",
                'breaches' => $breachNames,
                'count'    => count($breachNames),
            ];
        }

        return $accounts;
    }

    /**
     * Get details of a specific breach by name.
     * GET /breach/{name}
     */
    public function breachDetail(string $name): array
    {
        return $this->get("/breach/{$name}");
    }

    /**
     * Get all known breaches (useful for enriching breach names with metadata).
     * GET /breaches
     */
    public function allBreaches(): array
    {
        return $this->get('/breaches');
    }

    /**
     * Check pastes associated with an email address.
     * GET /pasteaccount/{email}
     */
    public function emailPastes(string $email): array
    {
        return $this->get('/pasteaccount/' . urlencode($email));
    }

    // ── Summary helper ────────────────────────────────────────────────────────

    /**
     * Scan all email domains in a project scope and return structured hits.
     */
    public function scanProjectDomains(\App\Models\MetisProject $project): array
    {
        $scope = $project->scope;
        if (! $scope) {
            return [];
        }

        $emailDomains = $scope->email_domains ?? [];
        if (empty($emailDomains)) {
            // Fall back to root domains
            $emailDomains = $scope->root_domains ?? [];
        }

        $hits = [];
        foreach ($emailDomains as $domain) {
            $accounts = $this->domainBreaches($domain);
            if (! empty($accounts)) {
                $hits[] = [
                    'domain'   => $domain,
                    'accounts' => $accounts,
                    'total'    => count($accounts),
                ];
            }
            // Rate limit: 1 request per 1500ms recommended
            usleep(1500000);
        }

        return $hits;
    }

    private function get(string $path): array
    {
        try {
            $resp = Http::timeout(10)
                ->withHeaders(['hibp-api-key' => $this->apiKey, 'user-agent' => 'Metis-CommandCenter/1.0'])
                ->get(self::BASE . $path);

            if ($resp->status() === 404) {
                return [];   // No breach data for this account
            }

            if ($resp->status() === 429) {
                Log::warning('HIBP rate limited — back off and retry');
                return [];
            }

            if (! $resp->ok()) {
                Log::debug('HibpService error', ['path' => $path, 'status' => $resp->status()]);
                return [];
            }

            return $resp->json() ?? [];
        } catch (\Throwable $e) {
            Log::warning('HibpService request failed', ['path' => $path, 'error' => $e->getMessage()]);
            return [];
        }
    }
}

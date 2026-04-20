<?php

namespace App\Services\Metis;

use App\Models\MetisModule;
use App\Models\MetisProject;
use App\Models\MetisUrlEntity;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SearchReconService
{
    public function runProjectQueries(MetisProject $project): array
    {
        $scope = $project->scope;
        $domains = collect($scope?->root_domains ?? [])->filter()->values();
        $keywords = collect($scope?->brand_keywords ?? [])->filter()->values();

        $queries = collect();

        foreach ($domains as $domain) {
            $queries->push(['category' => 'site', 'query' => "site:{$domain}"]);
            $queries->push(['category' => 'subdomain', 'query' => "site:*.{$domain}"]);
            $queries->push(['category' => 'admin', 'query' => "site:{$domain} inurl:admin"]);
            $queries->push(['category' => 'login', 'query' => "site:{$domain} intitle:login"]);
            $queries->push(['category' => 'docs', 'query' => "site:{$domain} inurl:docs"]);
            $queries->push(['category' => 'files', 'query' => "site:{$domain} filetype:pdf OR filetype:txt OR filetype:json"]);
            $queries->push(['category' => 'staging', 'query' => "\"{$domain}\" AND (staging OR preview OR test OR qa)"]);
        }

        foreach ($keywords as $keyword) {
            $queries->push(['category' => 'brand', 'query' => "\"{$keyword}\" (admin OR login OR docs OR contact OR support)"]);
        }

        $queries = $queries->unique('query')->values();
        $config = MetisModule::enabledConfig('search_provider');
        $results = [];
        $mode = 'query_templates_only';

        if (($config['provider'] ?? null) === 'google_cse' && ! empty($config['api_key']) && ! empty($config['engine_id'])) {
            $mode = 'google_cse';

            foreach ($queries->take(8) as $query) {
                $response = Http::timeout(15)->get('https://www.googleapis.com/customsearch/v1', [
                    'key' => $config['api_key'],
                    'cx' => $config['engine_id'],
                    'q' => $query['query'],
                    'num' => 5,
                ]);

                if (! $response->ok()) {
                    $results[] = [
                        ...$query,
                        'items' => [],
                        'error' => 'provider_request_failed',
                    ];
                    continue;
                }

                $items = collect($response->json('items') ?? [])
                    ->map(fn ($item) => [
                        'title' => $item['title'] ?? '',
                        'url' => $item['link'] ?? '',
                        'snippet' => $item['snippet'] ?? '',
                        'classification' => $this->classifySearchHit($item['link'] ?? '', $item['title'] ?? '', $item['snippet'] ?? ''),
                    ])
                    ->filter(fn ($item) => $item['url'] !== '')
                    ->values()
                    ->all();

                foreach ($items as $item) {
                    MetisUrlEntity::query()->firstOrCreate(
                        ['project_id' => $project->id, 'url' => $item['url']],
                        [
                            'source' => 'search_recon',
                            'classification' => $item['classification'],
                            'metadata_json' => ['title' => $item['title'], 'snippet' => $item['snippet']],
                            'historical_only' => false,
                            'first_seen' => now(),
                            'last_seen' => now(),
                        ]
                    );
                }

                $results[] = [
                    ...$query,
                    'items' => $items,
                ];
            }
        }

        return [
            'mode' => $mode,
            'queries' => $queries->all(),
            'results' => $results,
            'safe_mode' => true,
            'manual_import_supported' => true,
        ];
    }

    private function classifySearchHit(string $url, string $title, string $snippet): string
    {
        $haystack = Str::lower($url.' '.$title.' '.$snippet);

        return match (true) {
            str_contains($haystack, 'login') || str_contains($haystack, 'admin') => 'exposure_hint',
            str_contains($haystack, 'docs') || str_contains($haystack, 'developer') => 'url_candidate',
            preg_match('/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i', $haystack) === 1 => 'public_contact_email',
            str_contains($haystack, 'github.com/') || str_contains($haystack, 'gitlab.com/') => 'public_org_handle',
            default => 'likely_false_positive',
        };
    }
}

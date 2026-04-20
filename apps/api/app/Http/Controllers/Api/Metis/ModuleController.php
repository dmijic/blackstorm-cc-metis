<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisAiProvider;
use App\Models\MetisModule;
use App\Services\Metis\ModuleCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ModuleController extends Controller
{
    public function __construct(
        private readonly ModuleCatalogService $catalog,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $definitions = $this->catalog->definitions();
        $stored = MetisModule::query()->get()->keyBy('slug');

        $data = collect($definitions)->map(function (array $definition, string $slug) use ($stored, $request) {
            $module = $stored->get($slug);
            $config = $module?->getDecryptedConfig() ?? [];

            return [
                ...$definition,
                'enabled' => $module?->enabled ?? false,
                'configured' => $config !== [],
                'last_synced_at' => $module?->last_synced_at?->toIso8601String(),
                'notes' => $module?->notes,
                'config' => $request->user()?->isAdmin()
                    ? $this->maskConfig($definition['fields'] ?? [], $config)
                    : [],
            ];
        })->values();

        return response()->json(['data' => $data]);
    }

    public function update(Request $request, string $slug): JsonResponse
    {
        $this->ensureAdmin($request);

        $definition = $this->catalog->definition($slug);
        abort_unless($definition, 404, 'Unknown module.');

        abort_if(($definition['locked'] ?? false) === true, 422, 'This module is intentionally disabled in this build.');

        $validated = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string'],
            'config' => ['nullable', 'array'],
        ]);

        $module = MetisModule::query()->firstOrNew(['slug' => $slug]);
        $existingConfig = $module->exists ? $module->getDecryptedConfig() : [];
        $nextConfig = $existingConfig;
        $configInput = $validated['config'] ?? [];

        foreach ($definition['fields'] ?? [] as $field) {
            $key = $field['key'];

            if (! array_key_exists($key, $configInput)) {
                continue;
            }

            $value = $configInput[$key];

            if ($field['type'] === 'secret' && in_array($value, [null, '', '***configured***'], true)) {
                continue;
            }

            if ($field['type'] === 'boolean') {
                $nextConfig[$key] = (bool) $value;
                continue;
            }

            $normalized = is_string($value) ? trim($value) : $value;

            if ($normalized === null || $normalized === '') {
                unset($nextConfig[$key]);
                continue;
            }

            $nextConfig[$key] = $normalized;
        }

        $module->fill([
            'name' => $definition['name'],
            'category' => $definition['category'],
            'enabled' => $validated['enabled'] ?? $module->enabled ?? false,
            'notes' => $validated['notes'] ?? $module->notes,
            'last_synced_at' => now(),
            'created_by' => $module->created_by ?? $request->user()->id,
        ]);
        $module->setConfig($nextConfig);
        $module->save();

        return response()->json([
            'data' => [
                ...$definition,
                'enabled' => $module->enabled,
                'configured' => $nextConfig !== [],
                'last_synced_at' => $module->last_synced_at?->toIso8601String(),
                'notes' => $module->notes,
                'config' => $this->maskConfig($definition['fields'] ?? [], $nextConfig),
            ],
        ]);
    }

    public function docs(Request $request): JsonResponse
    {
        $definitions = $this->catalog->definitions();
        $stored = MetisModule::query()->get()->keyBy('slug');

        $services = collect($definitions)->map(function (array $definition, string $slug) use ($stored) {
            $module = $stored->get($slug);
            $config = $module?->getDecryptedConfig() ?? [];

            return [
                'slug' => $slug,
                'name' => $definition['name'],
                'category' => $definition['category'],
                'description' => $definition['description'],
                'guardrail' => $definition['guardrail'] ?? null,
                'docs_url' => $definition['docs_url'] ?? null,
                'instructions' => $definition['instructions'] ?? [],
                'fields' => $definition['fields'] ?? [],
                'enabled' => $module?->enabled ?? false,
                'configured' => $config !== [],
                'locked' => $definition['locked'] ?? false,
                'used_for' => $definition['used_for'] ?? [],
                'optional' => $definition['optional'] ?? true,
            ];
        })->values();

        return response()->json([
            'data' => [
                'services' => $services,
                'summary' => [
                    'configured' => $services->where('configured', true)->count(),
                    'enabled' => $services->where('enabled', true)->count(),
                    'ai_providers' => MetisAiProvider::query()->where('enabled', true)->count(),
                ],
                'ai_provider_types' => [
                    'openai',
                    'anthropic',
                    'gemini',
                    'openai_compatible',
                ],
            ],
        ]);
    }

    public function testConnection(Request $request, string $slug): JsonResponse
    {
        $this->ensureAdmin($request);

        $definition = $this->catalog->definition($slug);
        abort_unless($definition, 404, 'Unknown module.');

        $module = MetisModule::query()->where('slug', $slug)->first();
        $config = $module?->getDecryptedConfig() ?? [];
        abort_if($config === [], 422, 'This external service is not configured yet.');

        $result = match ($slug) {
            'github_public' => $this->testGithub($config),
            'shodan' => $this->testShodan($config),
            'jira' => $this->testJira($config),
            'search_provider' => $this->testSearchProvider($config),
            default => [
                'ok' => true,
                'mode' => 'configuration_validation',
                'message' => 'Configuration is present. This connector uses passive or webhook-only validation in this build.',
            ],
        };

        return response()->json(['data' => $result]);
    }

    private function maskConfig(array $fields, array $config): array
    {
        $masked = $config;

        foreach ($fields as $field) {
            if (($field['type'] ?? null) === 'secret' && ! empty($masked[$field['key']])) {
                $masked[$field['key']] = '***configured***';
            }
        }

        return $masked;
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access required.');
    }

    private function testGithub(array $config): array
    {
        $headers = [
            'Accept' => 'application/vnd.github+json',
            'User-Agent' => $config['user_agent'] ?? 'Metis-CommandCenter/1.0',
            'X-GitHub-Api-Version' => '2022-11-28',
        ];

        if (! empty($config['api_token'])) {
            $headers['Authorization'] = 'Bearer '.$config['api_token'];
        }

        $response = Http::timeout(10)->withHeaders($headers)->get('https://api.github.com/rate_limit');

        return [
            'ok' => $response->successful(),
            'mode' => 'live_api',
            'status' => $response->status(),
            'message' => $response->successful() ? 'GitHub API reachable.' : 'GitHub API request failed.',
        ];
    }

    private function testShodan(array $config): array
    {
        $response = Http::timeout(10)->get('https://api.shodan.io/api-info', [
            'key' => $config['api_key'] ?? '',
        ]);

        return [
            'ok' => $response->successful(),
            'mode' => 'live_api',
            'status' => $response->status(),
            'message' => $response->successful() ? 'Shodan API reachable.' : 'Shodan API request failed.',
        ];
    }

    private function testJira(array $config): array
    {
        $response = Http::timeout(10)
            ->withBasicAuth((string) ($config['email'] ?? ''), (string) ($config['api_token'] ?? ''))
            ->get(rtrim((string) ($config['base_url'] ?? ''), '/').'/rest/api/3/myself');

        return [
            'ok' => $response->successful(),
            'mode' => 'live_api',
            'status' => $response->status(),
            'message' => $response->successful() ? 'Jira API reachable.' : 'Jira API request failed.',
        ];
    }

    private function testSearchProvider(array $config): array
    {
        if (($config['provider'] ?? null) !== 'google_cse') {
            return [
                'ok' => true,
                'mode' => 'query_templates_only',
                'message' => 'Search recon will use safe query templates and manual import mode.',
            ];
        }

        $response = Http::timeout(10)->get('https://www.googleapis.com/customsearch/v1', [
            'key' => $config['api_key'] ?? '',
            'cx' => $config['engine_id'] ?? '',
            'q' => 'metis authorized recon',
            'num' => 1,
        ]);

        return [
            'ok' => $response->successful(),
            'mode' => 'live_api',
            'status' => $response->status(),
            'message' => $response->successful() ? 'Programmable search API reachable.' : 'Programmable search API request failed.',
        ];
    }
}

<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisModule;
use App\Services\Metis\ModuleCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}

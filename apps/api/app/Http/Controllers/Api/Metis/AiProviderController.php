<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisAiProvider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AiProviderController extends Controller
{
    public function index(): JsonResponse
    {
        $providers = MetisAiProvider::query()
            ->select(['id', 'name', 'provider', 'model', 'base_url', 'is_default', 'enabled', 'created_at'])
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $providers]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'       => ['required', 'string', 'max:100'],
            'provider'   => ['required', 'in:openai,anthropic,gemini,openai_compatible'],
            'model'      => ['nullable', 'string', 'max:100'],
            'api_key'    => ['required', 'string', 'min:10'],
            'base_url'   => ['nullable', 'url'],
            'is_default' => ['sometimes', 'boolean'],
        ]);

        $provider = DB::transaction(function () use ($validated, $request) {
            if ($validated['is_default'] ?? false) {
                MetisAiProvider::query()->update(['is_default' => false]);
            }

            $p = new MetisAiProvider([
                'created_by' => $request->user()->id,
                'name'       => $validated['name'],
                'provider'   => $validated['provider'],
                'model'      => $validated['model'] ?? null,
                'base_url'   => $validated['base_url'] ?? null,
                'is_default' => $validated['is_default'] ?? false,
                'enabled'    => true,
            ]);
            $p->api_key = $validated['api_key']; // uses setApiKeyAttribute to encrypt
            $p->save();

            return $p;
        });

        return response()->json([
            'data' => $provider->only(['id', 'name', 'provider', 'model', 'base_url', 'is_default', 'enabled']),
        ], 201);
    }

    public function update(Request $request, MetisAiProvider $aiProvider): JsonResponse
    {
        $validated = $request->validate([
            'name'       => ['sometimes', 'string', 'max:100'],
            'model'      => ['nullable', 'string', 'max:100'],
            'api_key'    => ['nullable', 'string', 'min:10'],
            'base_url'   => ['nullable', 'url'],
            'is_default' => ['sometimes', 'boolean'],
            'enabled'    => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($validated, $aiProvider) {
            if ($validated['is_default'] ?? false) {
                MetisAiProvider::query()->where('id', '!=', $aiProvider->id)->update(['is_default' => false]);
            }

            if (!empty($validated['api_key'])) {
                $aiProvider->api_key = $validated['api_key'];
                unset($validated['api_key']);
            }

            $aiProvider->fill(collect($validated)->except('api_key')->toArray())->save();
        });

        return response()->json([
            'data' => $aiProvider->fresh()->only(['id', 'name', 'provider', 'model', 'base_url', 'is_default', 'enabled']),
        ]);
    }

    public function destroy(MetisAiProvider $aiProvider): JsonResponse
    {
        $aiProvider->delete();
        return response()->json(null, 204);
    }
}

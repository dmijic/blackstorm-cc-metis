<?php

namespace App\Services\Metis;

use App\Models\MetisAiProvider;
use App\Models\MetisProject;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiService
{
    public function summarizeProject(MetisProject $project): string
    {
        $provider = $this->getDefaultProvider();
        if (!$provider) {
            return 'No AI provider configured. Please add one in Settings > AI Providers.';
        }

        $scope   = $project->scope;
        $domains = $project->domainEntities()->count();
        $hosts   = $project->hostEntities()->where('is_live', true)->count();
        $urls    = $project->urlEntities()->count();
        $findings = $project->findingEntities()->where('status', 'open')->count();

        $prompt = <<<PROMPT
You are a security analyst assistant. Summarize the following reconnaissance data for project "{$project->name}".

Scope: root domains = {$this->jsonSafe($scope?->root_domains ?? [])}
Discovered domains: {$domains}
Live hosts: {$hosts}
Historical URLs: {$urls}
Open findings: {$findings}

Provide:
1. Executive summary (2-3 sentences)
2. Top risks observed
3. Recommended next steps

Keep it concise and professional. Do not include any sensitive data.
PROMPT;

        return $this->chat($provider, $prompt);
    }

    public function entitySummary(string $entityType, array $entityData): string
    {
        $provider = $this->getDefaultProvider();
        if (!$provider) {
            return 'No AI provider configured.';
        }

        // Mask any accidental secrets before sending
        $safe = $this->maskSecrets($entityData);

        $prompt = "Analyze this {$entityType} entity data and provide a brief security assessment:\n\n"
            . json_encode($safe, JSON_PRETTY_PRINT)
            . "\n\nProvide: what this entity is, any security concerns, and recommended actions. Be concise.";

        return $this->chat($provider, $prompt);
    }

    public function dedupeAssistant(array $entities): array
    {
        $provider = $this->getDefaultProvider();
        if (!$provider) {
            return [];
        }

        $prompt = "Given these entities, identify any that appear to be duplicates (same host/domain with different representations). "
            . "Return JSON array of groups: [{\"keep\": id, \"merge\": [id, ...], \"reason\": \"...\"}]\n\n"
            . json_encode($entities, JSON_PRETTY_PRINT);

        $response = $this->chat($provider, $prompt);

        // Try to extract JSON from response
        if (preg_match('/\[[\s\S]*\]/m', $response, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return [];
    }

    public function groundedInterpretation(
        string $title,
        array $observed,
        array $inferred = [],
        array $recommended = [],
        array $options = []
    ): array {
        $provider = $this->getDefaultProvider();
        $safeObserved = $this->maskSecrets($observed);
        $safeInferred = $this->maskSecrets($inferred);
        $safeRecommended = $this->maskSecrets($recommended);

        if (! $provider) {
            return [
                'content' => $this->fallbackGroundedNarrative($title, $safeObserved, $safeInferred, $safeRecommended),
                'observed' => $safeObserved,
                'inferred' => $safeInferred,
                'recommended' => $safeRecommended,
                'meta' => [
                    'provider' => null,
                    'model' => null,
                    'grounded' => true,
                    'mode' => 'fallback',
                ],
            ];
        }

        $prompt = <<<PROMPT
You are an evidence-grounded security reporting assistant.

Task title: {$title}

Rules:
- Only use facts from the OBSERVED section as observed facts.
- You may use the INFERRED section only as explicitly labeled inference.
- Keep RECOMMENDED as next steps, not facts.
- Do not invent data, counts, affected assets, providers, or incidents.
- Return plain text with exactly these section headers:
Observed
Inferred
Recommended

OBSERVED:
{$this->prettyJson($safeObserved)}

INFERRED:
{$this->prettyJson($safeInferred)}

RECOMMENDED:
{$this->prettyJson($safeRecommended)}
PROMPT;

        return [
            'content' => $this->chat($provider, $prompt),
            'observed' => $safeObserved,
            'inferred' => $safeInferred,
            'recommended' => $safeRecommended,
            'meta' => [
                'provider' => $provider->provider,
                'model' => $provider->model,
                'grounded' => true,
                'mode' => $options['mode'] ?? 'interpretation',
            ],
        ];
    }

    private function chat(MetisAiProvider $provider, string $prompt): string
    {
        try {
            $apiKey = $provider->getDecryptedApiKey();

            return match ($provider->provider) {
                'anthropic'       => $this->callAnthropic($apiKey, $provider->model ?? 'claude-3-5-sonnet-20241022', $prompt),
                'openai'          => $this->callOpenAi($apiKey, $provider->model ?? 'gpt-4o', $prompt, 'https://api.openai.com/v1'),
                'gemini'          => $this->callGemini($apiKey, $provider->model ?? 'gemini-1.5-pro', $prompt),
                'openai_compatible'=> $this->callOpenAi($apiKey, $provider->model ?? 'gpt-4o', $prompt, rtrim($provider->base_url ?? '', '/')),
                default           => 'Unknown provider.',
            };
        } catch (\Throwable $e) {
            Log::error('AI service error: ' . $e->getMessage());
            return 'AI summary unavailable: ' . $e->getMessage();
        }
    }

    private function callAnthropic(string $apiKey, string $model, string $prompt): string
    {
        $response = Http::withHeaders([
            'x-api-key'         => $apiKey,
            'anthropic-version' => '2023-06-01',
            'content-type'      => 'application/json',
        ])->post('https://api.anthropic.com/v1/messages', [
            'model'      => $model,
            'max_tokens' => 1024,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
        ]);

        return $response->json('content.0.text') ?? 'No response from Anthropic.';
    }

    private function callOpenAi(string $apiKey, string $model, string $prompt, string $baseUrl): string
    {
        $response = Http::withToken($apiKey)
            ->post("{$baseUrl}/chat/completions", [
                'model'    => $model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
            ]);

        return $response->json('choices.0.message.content') ?? 'No response from OpenAI.';
    }

    private function callGemini(string $apiKey, string $model, string $prompt): string
    {
        $response = Http::post(
            "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
            ['contents' => [['parts' => [['text' => $prompt]]]]]
        );

        return $response->json('candidates.0.content.parts.0.text') ?? 'No response from Gemini.';
    }

    private function getDefaultProvider(): ?MetisAiProvider
    {
        return MetisAiProvider::query()
            ->where('enabled', true)
            ->where('is_default', true)
            ->first()
            ?? MetisAiProvider::query()->where('enabled', true)->first();
    }

    private function maskSecrets(array $data): array
    {
        $sensitiveKeys = ['password', 'secret', 'token', 'key', 'credential', 'auth', 'api_key'];

        array_walk_recursive($data, function (&$value, $key) use ($sensitiveKeys) {
            foreach ($sensitiveKeys as $sensitive) {
                if (stripos((string) $key, $sensitive) !== false) {
                    $value = '***REDACTED***';
                    break;
                }
            }
        });

        return $data;
    }

    private function jsonSafe(array $data): string
    {
        return implode(', ', array_slice($data, 0, 10));
    }

    private function prettyJson(array $data): string
    {
        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) ?: '{}';
    }

    private function fallbackGroundedNarrative(string $title, array $observed, array $inferred, array $recommended): string
    {
        $lines = [$title, '', 'Observed'];

        foreach ($this->flattenForNarrative($observed) as $line) {
            $lines[] = '- '.$line;
        }

        $lines[] = '';
        $lines[] = 'Inferred';
        foreach ($this->flattenForNarrative($inferred) as $line) {
            $lines[] = '- '.$line;
        }

        $lines[] = '';
        $lines[] = 'Recommended';
        foreach ($this->flattenForNarrative($recommended) as $line) {
            $lines[] = '- '.$line;
        }

        return implode("\n", $lines);
    }

    private function flattenForNarrative(array $payload): array
    {
        $lines = [];

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $lines[] = sprintf('%s: %s', (string) $key, json_encode($value, JSON_UNESCAPED_SLASHES));
                continue;
            }

            $lines[] = sprintf('%s: %s', (string) $key, (string) $value);
        }

        return $lines === [] ? ['No data provided.'] : $lines;
    }
}

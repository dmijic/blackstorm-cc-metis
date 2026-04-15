<?php

namespace Tests\Feature\Api\Intel;

use App\Models\Finding;
use App\Models\FindingMatch;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IntelFindingIngestTest extends TestCase
{
    use RefreshDatabase;

    public function test_findings_are_ingested_deduplicated_and_password_payloads_are_discarded(): void
    {
        Sanctum::actingAs(User::factory()->create());

        Subject::query()->create([
            'name' => 'example.com',
            'type' => 'domain',
            'enabled' => true,
        ]);

        $payload = [
            [
                'source' => 'pastebin',
                'type' => 'credential_dump',
                'severity' => 'high',
                'title' => 'example.com exposure discovered',
                'summary' => 'The leak references blackstorm handling for example.com.',
                'observed_at' => now()->toDateTimeString(),
                'confidence' => 0.91,
                'dedupe_key' => 'finding-123',
                'evidences' => [
                    [
                        'kind' => 'url',
                        'data_json' => [
                            'url' => 'https://intel.local/example.com/exposure',
                        ],
                    ],
                ],
            ],
            [
                'source' => 'pastebin',
                'type' => 'credential_dump',
                'severity' => 'critical',
                'title' => 'Should be discarded',
                'summary' => 'This payload must never be stored.',
                'observed_at' => now()->toDateTimeString(),
                'confidence' => 0.50,
                'dedupe_key' => 'finding-password',
                'password' => 'plaintext-secret',
            ],
        ];

        $response = $this->postJson('/api/intel/findings/ingest', $payload);

        $response
            ->assertOk()
            ->assertJsonPath('data.created', 1)
            ->assertJsonPath('data.deduplicated', 0)
            ->assertJsonPath('data.discarded_password', 1);

        $this->assertDatabaseCount('findings', 1);
        $this->assertDatabaseCount('evidences', 1);
        $this->assertDatabaseCount('matches', 1);

        $duplicateResponse = $this->postJson('/api/intel/findings/ingest', [$payload[0]]);

        $duplicateResponse
            ->assertOk()
            ->assertJsonPath('data.created', 0)
            ->assertJsonPath('data.deduplicated', 1);

        $this->assertDatabaseCount('findings', 1);

        $finding = Finding::query()->first();

        $this->assertSame('finding-123', $finding->dedupe_key);
        $this->assertSame(1, FindingMatch::query()->count());
    }
}

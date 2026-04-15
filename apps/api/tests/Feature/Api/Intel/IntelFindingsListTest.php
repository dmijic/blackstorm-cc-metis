<?php

namespace Tests\Feature\Api\Intel;

use App\Models\Finding;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IntelFindingsListTest extends TestCase
{
    use RefreshDatabase;

    public function test_findings_list_supports_status_filtering(): void
    {
        Sanctum::actingAs(User::factory()->create());

        Finding::query()->create([
            'source' => 'telegram',
            'type' => 'brand_mention',
            'severity' => 'med',
            'title' => 'New finding',
            'summary' => 'Summary',
            'observed_at' => now()->subHour(),
            'confidence' => 0.60,
            'dedupe_key' => 'new-finding',
            'status' => 'new',
        ]);

        Finding::query()->create([
            'source' => 'github',
            'type' => 'repo_exposure',
            'severity' => 'high',
            'title' => 'Confirmed finding',
            'summary' => 'Summary',
            'observed_at' => now()->subDay(),
            'confidence' => 0.88,
            'dedupe_key' => 'confirmed-finding',
            'status' => 'confirmed',
        ]);

        $response = $this->getJson('/api/intel/findings?status=new');

        $response
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.dedupe_key', 'new-finding')
            ->assertJsonPath('data.0.status', 'new');
    }
}

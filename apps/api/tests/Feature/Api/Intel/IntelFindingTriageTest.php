<?php

namespace Tests\Feature\Api\Intel;

use App\Models\Finding;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IntelFindingTriageTest extends TestCase
{
    use RefreshDatabase;

    public function test_triage_updates_status_and_creates_note(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $finding = Finding::query()->create([
            'source' => 'crawler',
            'type' => 'directory_listing',
            'severity' => 'low',
            'title' => 'Pending finding',
            'summary' => 'Summary',
            'observed_at' => now()->subHours(3),
            'confidence' => 0.55,
            'dedupe_key' => 'triage-finding',
            'status' => 'new',
        ]);

        $response = $this->postJson("/api/intel/findings/{$finding->id}/triage", [
            'status' => 'confirmed',
            'note' => 'Validated by analyst review.',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.notes.0.note', 'Validated by analyst review.');

        $this->assertDatabaseHas('findings', [
            'id' => $finding->id,
            'status' => 'confirmed',
        ]);

        $this->assertDatabaseHas('triage_notes', [
            'finding_id' => $finding->id,
            'actor_id' => $user->id,
            'note' => 'Validated by analyst review.',
        ]);
    }
}

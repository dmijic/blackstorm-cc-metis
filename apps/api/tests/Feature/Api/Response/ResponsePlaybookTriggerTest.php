<?php

namespace Tests\Feature\Api\Response;

use App\Jobs\ProcessActionRun;
use App\Models\Finding;
use App\Models\Playbook;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ResponsePlaybookTriggerTest extends TestCase
{
    use RefreshDatabase;

    public function test_confirming_a_finding_queues_action_runs_for_matching_playbooks(): void
    {
        Queue::fake();

        Sanctum::actingAs(User::factory()->create());

        $finding = Finding::query()->create([
            'source' => 'crawler',
            'type' => 'credential_exposure',
            'severity' => 'critical',
            'title' => 'Credential exposure',
            'summary' => 'Matching finding for SOAR trigger.',
            'observed_at' => now()->subHour(),
            'confidence' => 0.95,
            'dedupe_key' => 'soar-trigger-finding',
            'status' => 'new',
        ]);

        $playbook = Playbook::query()->create([
            'name' => 'Critical exposures',
            'enabled' => true,
            'rules_json' => [
                'finding_type' => 'credential_exposure',
                'severity' => 'critical',
                'min_confidence' => 0.90,
            ],
        ]);

        $playbook->actions()->create([
            'action_type' => 'webhook',
            'config_json' => [
                'url' => 'https://example.test/webhook',
                'secret' => 'super-secret',
            ],
        ]);

        $response = $this->postJson("/api/intel/findings/{$finding->id}/triage", [
            'status' => 'confirmed',
            'note' => 'Escalated to response automation.',
        ]);

        $response->assertOk();

        $this->assertDatabaseHas('action_runs', [
            'playbook_id' => $playbook->id,
            'finding_id' => $finding->id,
            'status' => 'queued',
        ]);

        Queue::assertPushed(ProcessActionRun::class, 1);
    }
}

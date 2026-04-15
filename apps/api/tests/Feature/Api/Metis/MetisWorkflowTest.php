<?php

namespace Tests\Feature\Api\Metis;

use App\Models\MetisDomainEntity;
use App\Models\MetisDomainVerification;
use App\Models\MetisFindingEntity;
use App\Models\MetisProject;
use App\Models\MetisScope;
use App\Models\User;
use App\Services\Metis\ScopeVerifierService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use Tests\TestCase;

class MetisWorkflowTest extends TestCase
{
    use RefreshDatabase;
    use MockeryPHPUnitIntegration;

    public function test_project_can_be_created(): void
    {
        Sanctum::actingAs(User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]));

        $response = $this->postJson('/api/metis/projects', [
            'name' => 'Acme ASM',
            'client' => 'Acme Corp',
            'description' => 'External attack surface baseline.',
            'tags' => ['asm', 'q2'],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.name', 'Acme ASM')
            ->assertJsonPath('data.client', 'Acme Corp');

        $this->assertDatabaseHas('metis_projects', [
            'name' => 'Acme ASM',
            'client' => 'Acme Corp',
        ]);

        $project = MetisProject::query()->first();

        $this->assertNotNull($project);
        $this->assertDatabaseHas('metis_scope', [
            'project_id' => $project->id,
        ]);
    }

    public function test_domain_verification_can_be_initiated_and_checked(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Verification Project',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);

        $initResponse = $this->postJson("/api/metis/projects/{$project->id}/scope/verify", [
            'domain' => 'example.com',
            'method' => 'dns_txt',
        ]);

        $initResponse
            ->assertCreated()
            ->assertJsonPath('data.domain', 'example.com')
            ->assertJsonPath('data.status', 'pending');

        $verificationId = $initResponse->json('data.id');

        $mock = Mockery::mock(ScopeVerifierService::class)->makePartial();
        $mock->shouldReceive('checkDnsTxt')
            ->once()
            ->andReturnUsing(function (MetisDomainVerification $verification) {
                $verification->update([
                    'status' => 'verified',
                    'verified_at' => now(),
                ]);

                return true;
            });

        $this->app->instance(ScopeVerifierService::class, $mock);

        $checkResponse = $this->postJson("/api/metis/projects/{$project->id}/scope/verifications/{$verificationId}/check");

        $checkResponse
            ->assertOk()
            ->assertJsonPath('verified', true)
            ->assertJsonPath('data.status', 'verified');
    }

    public function test_passive_ct_step_runs_and_persists_entities(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Passive Recon',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);

        Http::fake([
            'https://crt.sh/*' => Http::response([
                ['name_value' => "api.example.com\nwww.example.com"],
            ], 200),
        ]);

        $response = $this->postJson("/api/metis/projects/{$project->id}/runs", [
            'type' => 'ct_lookup',
            'params' => ['domain' => 'example.com'],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.type', 'ct_lookup');

        $this->assertDatabaseHas('metis_job_runs', [
            'project_id' => $project->id,
            'type' => 'ct_lookup',
            'status' => 'completed',
        ]);

        $this->assertDatabaseHas('metis_domain_entities', [
            'project_id' => $project->id,
            'domain' => 'api.example.com',
            'layer' => 'discovery',
        ]);
    }

    public function test_live_step_is_blocked_when_target_is_not_verified(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Guardrails',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);

        $response = $this->postJson("/api/metis/projects/{$project->id}/runs", [
            'type' => 'http_probe',
            'params' => ['hosts' => ['app.example.com']],
        ]);

        $response
            ->assertForbidden()
            ->assertJsonPath('blocked_targets.0', 'app.example.com');
    }

    public function test_report_generation_returns_project_statistics(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Reporting Project',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);
        MetisDomainEntity::query()->create([
            'project_id' => $project->id,
            'domain' => 'example.com',
            'layer' => 'scope',
            'verified' => true,
            'first_seen' => now()->subDay(),
            'last_seen' => now(),
        ]);
        MetisFindingEntity::query()->create([
            'project_id' => $project->id,
            'type' => 'misconfiguration',
            'severity' => 'high',
            'title' => 'Exposed admin panel',
            'confidence' => 'high',
            'status' => 'open',
        ]);

        $jsonResponse = $this->getJson("/api/metis/projects/{$project->id}/report/json");

        $jsonResponse
            ->assertOk()
            ->assertJsonPath('meta.project.name', 'Reporting Project')
            ->assertJsonPath('statistics.total_domains', 1)
            ->assertJsonPath('statistics.high_findings', 1);

        $htmlResponse = $this->get("/api/metis/projects/{$project->id}/report/html");

        $htmlResponse
            ->assertOk()
            ->assertSee('Reporting Project')
            ->assertSee('Metis Security Report');

        $pdfResponse = $this->get("/api/metis/projects/{$project->id}/report/pdf");

        $pdfResponse
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }
}

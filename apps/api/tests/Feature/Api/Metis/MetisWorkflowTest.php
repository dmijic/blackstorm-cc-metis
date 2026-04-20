<?php

namespace Tests\Feature\Api\Metis;

use App\Models\MetisAiProvider;
use App\Models\MetisDomainEntity;
use App\Models\MetisDomainVerification;
use App\Models\MetisFindingEntity;
use App\Models\MetisHostEntity;
use App\Models\MetisProject;
use App\Models\MetisScope;
use App\Models\MetisWorkflow;
use App\Models\MetisWorkflowNode;
use App\Models\User;
use App\Services\Metis\WorkflowEngineService;
use App\Services\Metis\ScopeVerifierService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
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

    public function test_domain_verification_can_be_deleted_and_entity_is_unverified(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Verification Cleanup',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);
        $verification = MetisDomainVerification::query()->create([
            'project_id' => $project->id,
            'domain' => 'example.com',
            'token' => MetisDomainVerification::generateToken(),
            'method' => 'dns_txt',
            'status' => 'verified',
            'verified_at' => now(),
        ]);
        MetisDomainEntity::query()->create([
            'project_id' => $project->id,
            'domain' => 'example.com',
            'layer' => 'scope',
            'verified' => true,
            'classification' => 'verified_domain',
            'first_seen' => now()->subDay(),
            'last_seen' => now(),
        ]);

        $response = $this->deleteJson("/api/metis/projects/{$project->id}/scope/verifications/{$verification->id}");

        $response
            ->assertOk()
            ->assertJsonPath('deleted', true)
            ->assertJsonPath('domain', 'example.com')
            ->assertJsonPath('still_verified', false);

        $this->assertDatabaseMissing('metis_domain_verifications', [
            'id' => $verification->id,
        ]);
        $this->assertDatabaseHas('metis_domain_entities', [
            'project_id' => $project->id,
            'domain' => 'example.com',
            'verified' => false,
            'classification' => 'discovered_domain',
        ]);
        $this->assertDatabaseHas('metis_audit_logs', [
            'project_id' => $project->id,
            'action' => 'domain.verification_deleted',
        ]);
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

    public function test_ai_provider_can_store_encrypted_api_keys_longer_than_255_characters(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $apiKey = 'sk-test-'.str_repeat('a', 192);

        $response = $this->postJson('/api/metis/ai-providers', [
            'name' => 'OpenAI',
            'provider' => 'openai',
            'model' => 'gpt-4o',
            'api_key' => $apiKey,
            'is_default' => true,
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.name', 'OpenAI')
            ->assertJsonPath('data.provider', 'openai')
            ->assertJsonPath('data.model', 'gpt-4o');

        /** @var MetisAiProvider $provider */
        $provider = MetisAiProvider::query()->firstOrFail();

        $this->assertGreaterThan(255, strlen($provider->getRawOriginal('api_key_encrypted')));
        $this->assertSame($apiKey, $provider->getDecryptedApiKey());
    }

    public function test_emergency_override_path_is_audited_and_allows_active_run(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Override Project',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);
        MetisHostEntity::query()->create([
            'project_id' => $project->id,
            'hostname' => 'admin.example.com',
            'ip' => '203.0.113.10',
            'ip_addresses_json' => ['203.0.113.10'],
            'first_seen' => now()->subDay(),
            'last_seen' => now(),
        ]);

        Http::fake([
            'https://203.0.113.10/*' => Http::response('<html><title>Admin</title></html>', 200, [
                'Content-Type' => 'text/html; charset=utf-8',
                'Server' => 'nginx',
            ]),
            'http://203.0.113.10/*' => Http::response('fallback', 200),
        ]);

        $overrideResponse = $this->postJson("/api/metis/projects/{$project->id}/overrides", [
            'run_type' => 'http_probe',
            'reason' => 'Approved emergency validation for an out-of-scope test host.',
            'target_summary' => 'Single IP validation',
            'targets' => ['203.0.113.10'],
            'one_time' => true,
            'confirmation_text' => 'OVERRIDE',
        ]);

        $overrideResponse->assertCreated();
        $overrideId = $overrideResponse->json('data.id');

        $runResponse = $this->postJson("/api/metis/projects/{$project->id}/runs", [
            'type' => 'http_probe',
            'override_id' => $overrideId,
            'params' => ['hosts' => ['203.0.113.10']],
        ]);

        $runResponse
            ->assertCreated()
            ->assertJsonPath('data.override_id', $overrideId);

        $this->assertDatabaseHas('metis_audit_logs', [
            'project_id' => $project->id,
            'action' => 'override.created',
        ]);
        $this->assertDatabaseHas('metis_audit_logs', [
            'project_id' => $project->id,
            'action' => 'override.used',
        ]);
        $this->assertDatabaseHas('metis_job_runs', [
            'project_id' => $project->id,
            'type' => 'http_probe',
            'override_id' => $overrideId,
            'status' => 'completed',
        ]);
    }

    public function test_override_options_are_inventory_bound_and_unknown_targets_are_rejected(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Override Options',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
            'known_subdomains' => ['app.example.com'],
        ]);
        MetisDomainEntity::query()->create([
            'project_id' => $project->id,
            'domain' => 'docs.example.com',
            'layer' => 'discovery',
            'verified' => false,
            'first_seen' => now()->subDay(),
            'last_seen' => now(),
        ]);
        MetisHostEntity::query()->create([
            'project_id' => $project->id,
            'hostname' => 'app.example.com',
            'ip' => '198.51.100.10',
            'ip_addresses_json' => ['198.51.100.10'],
            'first_seen' => now()->subDay(),
            'last_seen' => now(),
        ]);

        $this->getJson("/api/metis/projects/{$project->id}/overrides/options")
            ->assertOk()
            ->assertJsonFragment(['value' => 'example.com'])
            ->assertJsonFragment(['value' => 'app.example.com'])
            ->assertJsonFragment(['value' => 'docs.example.com'])
            ->assertJsonFragment(['value' => '198.51.100.10']);

        $this->postJson("/api/metis/projects/{$project->id}/overrides", [
            'run_type' => 'http_probe',
            'reason' => 'Attempt to use a target not present in project inventory.',
            'target_summary' => 'Invalid target check',
            'targets' => ['evil.example.net'],
            'one_time' => true,
            'confirmation_text' => 'OVERRIDE',
        ])->assertStatus(422);
    }

    public function test_attack_surface_map_workflow_produces_grouped_assets(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Infra Grouping',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);

        MetisHostEntity::query()->create([
            'project_id' => $project->id,
            'hostname' => 'app.example.com',
            'ip' => '198.51.100.10',
            'ip_addresses_json' => ['198.51.100.10'],
            'provider_hint' => 'cloudflare',
            'tls_json' => ['fingerprint_sha1' => 'cert-a'],
            'first_seen' => now()->subDay(),
            'last_seen' => now(),
        ]);
        MetisHostEntity::query()->create([
            'project_id' => $project->id,
            'hostname' => 'api.example.com',
            'ip' => '198.51.100.10',
            'ip_addresses_json' => ['198.51.100.10'],
            'provider_hint' => 'cloudflare',
            'tls_json' => ['fingerprint_sha1' => 'cert-a'],
            'first_seen' => now()->subDay(),
            'last_seen' => now(),
        ]);

        $workflow = $this->createWorkflow($user->id, 'attack-surface-only', 'attack_surface_map');

        $response = $this->postJson("/api/metis/projects/{$project->id}/workflow-runs", [
            'workflow_id' => $workflow->id,
            'input' => ['mode' => 'test'],
        ]);

        $response->assertCreated();
        $runId = $response->json('data.id');

        $details = $this->getJson("/api/metis/projects/{$project->id}/workflow-runs/{$runId}");

        $details
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $this->assertDatabaseCount('metis_infra_groups', 3);
    }

    public function test_custom_script_run_executes_and_returns_parsed_output(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Script Project',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);

        $this->postJson('/api/metis/workflows/sync-defaults')->assertOk();

        $templates = $this->getJson('/api/metis/scripts/templates')->assertOk();
        $templateId = collect($templates->json('data'))->firstWhere('slug', 'ip-summary-shell')['id'];

        $response = $this->postJson("/api/metis/projects/{$project->id}/script-runs", [
            'template_id' => $templateId,
            'input' => ['targets' => ['198.51.100.42']],
        ]);

        $response->assertCreated();

        $runId = $response->json('data.id');
        $details = $this->getJson("/api/metis/projects/{$project->id}/script-runs/{$runId}");

        $details
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.parsed_output_json.note', 'shell template executed');
    }

    public function test_report_templates_and_external_service_docs_are_available(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Templates Project',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
        ]);

        $this->postJson('/api/metis/workflows/sync-defaults')->assertOk();

        $this->getJson('/api/metis/report-templates')
            ->assertOk()
            ->assertJsonFragment(['slug' => 'nist-technical'])
            ->assertJsonFragment(['slug' => 'metis-technical-recon']);

        $this->putJson('/api/metis/external-services/search_provider', [
            'enabled' => true,
            'config' => ['provider' => 'manual'],
        ])->assertOk();

        $this->getJson('/api/metis/external-services/docs')
            ->assertOk()
            ->assertJsonPath('data.summary.configured', 1);

        $this->postJson('/api/metis/external-services/search_provider/test')
            ->assertOk()
            ->assertJsonPath('data.mode', 'query_templates_only');

        $reportResponse = $this->getJson("/api/metis/projects/{$project->id}/report/json?template=nist-technical");
        $reportResponse
            ->assertOk()
            ->assertJsonPath('meta.template.slug', 'nist-technical');
    }

    public function test_wayback_optional_behavior_and_search_recon_safe_mode_workflow(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'History Project',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
            'brand_keywords' => ['Blackstorm'],
        ]);

        Http::fake([
            'https://web.archive.org/*' => Http::response([], 500),
        ]);

        $waybackRun = $this->postJson("/api/metis/projects/{$project->id}/runs", [
            'type' => 'wizard_pipeline',
            'params' => [
                'steps' => ['wayback'],
                'optional_steps' => ['wayback'],
            ],
        ]);

        $waybackRun->assertCreated();
        $waybackRunId = $waybackRun->json('data.id');
        $this->getJson("/api/metis/projects/{$project->id}/runs/{$waybackRunId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $workflow = $this->createWorkflow($user->id, 'search-safe-mode', 'search_engine_recon');
        $workflowResponse = $this->postJson("/api/metis/projects/{$project->id}/workflow-runs", [
            'workflow_id' => $workflow->id,
        ]);

        $workflowResponse->assertCreated();
        $runId = $workflowResponse->json('data.id');

        $details = $this->getJson("/api/metis/projects/{$project->id}/workflow-runs/{$runId}");
        $details
            ->assertOk()
            ->assertJsonPath('context.discovery.search_urls.mode', 'query_templates_only')
            ->assertJsonPath('context.discovery.search_urls.safe_mode', true);
    }

    public function test_workflow_optional_nodes_can_be_skipped_and_reused_via_resume(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        Sanctum::actingAs($user);

        $project = MetisProject::query()->create([
            'created_by' => $user->id,
            'name' => 'Resume Project',
            'status' => 'active',
        ]);
        MetisScope::query()->create([
            'project_id' => $project->id,
            'root_domains' => ['example.com'],
            'brand_keywords' => ['Blackstorm'],
        ]);

        $workflow = MetisWorkflow::query()->create([
            'created_by' => $user->id,
            'slug' => 'skip-and-resume',
            'name' => 'Skip And Resume',
            'description' => 'Workflow with optional and resumable nodes',
            'is_system' => false,
            'is_default' => false,
            'active' => true,
        ]);

        MetisWorkflowNode::query()->create([
            'workflow_id' => $workflow->id,
            'key' => 'search_engine_recon',
            'type' => 'search_engine_recon',
            'position' => 10,
            'config_json' => ['output_keys' => ['discovery.search_urls']],
            'execution_class' => WorkflowEngineService::class,
            'execution_mode' => 'passive',
            'requires_verified_scope' => false,
            'timeout_seconds' => 60,
            'retry_limit' => 0,
            'audit_behavior' => 'full',
            'supports_ai' => false,
            'is_optional' => true,
            'danger_level' => 'info',
            'ui_meta_json' => [
                'name' => 'Search Engine Recon',
                'icon' => 'fas fa-search',
                'short_description' => 'Safe search query generation',
            ],
        ]);

        MetisWorkflowNode::query()->create([
            'workflow_id' => $workflow->id,
            'key' => 'attack_surface_map',
            'type' => 'attack_surface_map',
            'position' => 20,
            'config_json' => ['output_keys' => ['attack_surface.grouped_assets']],
            'execution_class' => WorkflowEngineService::class,
            'execution_mode' => 'passive',
            'requires_verified_scope' => false,
            'timeout_seconds' => 60,
            'retry_limit' => 0,
            'audit_behavior' => 'full',
            'supports_ai' => false,
            'is_optional' => false,
            'danger_level' => 'info',
            'ui_meta_json' => [
                'name' => 'Attack Surface Map',
                'icon' => 'fas fa-map',
                'short_description' => 'Grouping',
            ],
        ]);

        $firstRun = $this->postJson("/api/metis/projects/{$project->id}/workflow-runs", [
            'workflow_id' => $workflow->id,
            'input' => [
                'optional_nodes' => [
                    'search_engine_recon' => false,
                ],
            ],
        ])->assertCreated();

        $firstRunId = $firstRun->json('data.id');

        $firstDetails = $this->getJson("/api/metis/projects/{$project->id}/workflow-runs/{$firstRunId}");
        $firstDetails
            ->assertOk()
            ->assertJsonPath('steps.0.key', 'search_engine_recon')
            ->assertJsonPath('steps.0.summary.status', 'skipped')
            ->assertJsonPath('context.workflow.skipped.search_engine_recon.reason', 'disabled_by_workflow_input');

        $secondRun = $this->postJson("/api/metis/projects/{$project->id}/workflow-runs", [
            'workflow_id' => $workflow->id,
            'input' => [
                'resume_from_run_id' => $firstRunId,
            ],
        ])->assertCreated();

        $secondRunId = $secondRun->json('data.id');

        $secondDetails = $this->getJson("/api/metis/projects/{$project->id}/workflow-runs/{$secondRunId}");
        $secondDetails
            ->assertOk()
            ->assertJsonPath('context.workflow.resumed_from_run_id.value', $firstRunId)
            ->assertJsonPath('steps.1.key', 'attack_surface_map')
            ->assertJsonPath('steps.1.summary.status', 'resumed')
            ->assertJsonPath('steps.1.summary.from_run_id', $firstRunId);
    }

    private function createWorkflow(int $userId, string $slug, string $nodeType): MetisWorkflow
    {
        $workflow = MetisWorkflow::query()->create([
            'created_by' => $userId,
            'slug' => $slug,
            'name' => Str::headline($slug),
            'description' => 'Test workflow',
            'is_system' => false,
            'is_default' => false,
            'active' => true,
        ]);

        MetisWorkflowNode::query()->create([
            'workflow_id' => $workflow->id,
            'key' => $nodeType,
            'type' => $nodeType,
            'position' => 10,
            'execution_class' => WorkflowEngineService::class,
            'execution_mode' => in_array($nodeType, ['attack_surface_map', 'search_engine_recon'], true) ? 'passive' : 'active',
            'requires_verified_scope' => false,
            'timeout_seconds' => 60,
            'retry_limit' => 0,
            'audit_behavior' => 'full',
            'supports_ai' => false,
            'is_optional' => false,
            'danger_level' => 'info',
            'ui_meta_json' => [
                'name' => Str::headline($nodeType),
                'icon' => 'fas fa-circle',
                'short_description' => $nodeType,
            ],
        ]);

        return $workflow;
    }
}

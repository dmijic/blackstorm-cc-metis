<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metis_emergency_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status')->default('confirmed');
            $table->string('token')->unique();
            $table->string('run_type')->nullable();
            $table->text('reason');
            $table->text('target_summary');
            $table->json('targets_json');
            $table->json('confirmation_meta')->nullable();
            $table->boolean('one_time')->default(true);
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
        });

        Schema::create('metis_workflows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->nullable()->constrained('metis_projects')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('slug')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(false);
            $table->boolean('is_default')->default(false);
            $table->boolean('active')->default(true);
            $table->json('definition_json')->nullable();
            $table->timestamps();
        });

        Schema::create('metis_workflow_nodes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_id')->constrained('metis_workflows')->cascadeOnDelete();
            $table->string('key');
            $table->string('type');
            $table->unsignedInteger('position')->default(0);
            $table->json('input_schema_json')->nullable();
            $table->json('output_schema_json')->nullable();
            $table->json('allowed_target_types_json')->nullable();
            $table->json('config_json')->nullable();
            $table->string('execution_class');
            $table->string('execution_mode')->default('passive');
            $table->boolean('requires_verified_scope')->default(false);
            $table->unsignedInteger('timeout_seconds')->default(120);
            $table->unsignedInteger('retry_limit')->default(0);
            $table->string('audit_behavior')->default('full');
            $table->boolean('supports_ai')->default(false);
            $table->boolean('is_optional')->default(false);
            $table->string('danger_level')->default('info');
            $table->json('ui_meta_json')->nullable();
            $table->string('next_node_key')->nullable();
            $table->string('failure_node_key')->nullable();
            $table->timestamps();

            $table->unique(['workflow_id', 'key']);
        });

        Schema::create('metis_workflow_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_id')->constrained('metis_workflows')->cascadeOnDelete();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('override_id')->nullable()->constrained('metis_emergency_overrides')->nullOnDelete();
            $table->string('status')->default('queued');
            $table->string('current_node_key')->nullable();
            $table->json('input_json')->nullable();
            $table->json('summary_json')->nullable();
            $table->text('context_ref')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('metis_workflow_run_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_run_id')->constrained('metis_workflow_runs')->cascadeOnDelete();
            $table->foreignId('workflow_node_id')->nullable()->constrained('metis_workflow_nodes')->nullOnDelete();
            $table->foreignId('used_job_run_id')->nullable()->constrained('metis_job_runs')->nullOnDelete();
            $table->string('key');
            $table->string('type');
            $table->string('status')->default('queued');
            $table->json('input_json')->nullable();
            $table->text('output_ref')->nullable();
            $table->json('summary_json')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedInteger('attempt')->default(1);
            $table->boolean('used_override')->default(false);
            $table->unsignedBigInteger('duration_ms')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['workflow_run_id', 'key']);
        });

        Schema::create('metis_workflow_variables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_run_id')->constrained('metis_workflow_runs')->cascadeOnDelete();
            $table->foreignId('source_step_id')->nullable()->constrained('metis_workflow_run_steps')->nullOnDelete();
            $table->string('key');
            $table->string('value_type')->default('json');
            $table->json('value_json')->nullable();
            $table->timestamps();

            $table->unique(['workflow_run_id', 'key']);
        });

        Schema::create('metis_script_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->nullable()->constrained('metis_projects')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('slug')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('runtime');
            $table->text('script_body');
            $table->json('input_schema_json')->nullable();
            $table->json('output_schema_json')->nullable();
            $table->json('allowed_target_types_json')->nullable();
            $table->json('execution_policy_json')->nullable();
            $table->unsignedInteger('timeout_seconds')->default(60);
            $table->json('environment_policy_json')->nullable();
            $table->json('network_policy_json')->nullable();
            $table->text('ai_prompt_template')->nullable();
            $table->boolean('enabled')->default(true);
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });

        Schema::create('metis_script_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->foreignId('template_id')->constrained('metis_script_templates')->cascadeOnDelete();
            $table->foreignId('workflow_run_id')->nullable()->constrained('metis_workflow_runs')->nullOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('status')->default('queued');
            $table->json('input_json')->nullable();
            $table->json('parsed_output_json')->nullable();
            $table->json('artifacts_json')->nullable();
            $table->json('ai_summary_json')->nullable();
            $table->text('stdout_ref')->nullable();
            $table->text('stderr_ref')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedInteger('timeout_seconds')->default(60);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('metis_report_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('slug')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('style');
            $table->string('template_kind');
            $table->json('config_json')->nullable();
            $table->json('sections_json')->nullable();
            $table->json('ai_defaults_json')->nullable();
            $table->boolean('strict_evidence_default')->default(true);
            $table->boolean('is_system')->default(false);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('metis_infra_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->foreignId('workflow_run_id')->nullable()->constrained('metis_workflow_runs')->nullOnDelete();
            $table->string('type');
            $table->string('name');
            $table->string('fingerprint')->nullable();
            $table->text('summary')->nullable();
            $table->json('metadata_json')->nullable();
            $table->unsignedInteger('asset_count')->default(0);
            $table->timestamp('first_seen')->nullable();
            $table->timestamp('last_seen')->nullable();
            $table->timestamps();
        });

        Schema::create('metis_infra_group_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('infra_group_id')->constrained('metis_infra_groups')->cascadeOnDelete();
            $table->string('entity_type');
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->string('asset_key');
            $table->string('label');
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->unique(['infra_group_id', 'asset_key']);
        });

        Schema::table('metis_domain_entities', function (Blueprint $table) {
            $table->json('dns_summary_json')->nullable()->after('dns_json');
            $table->json('ownership_summary_json')->nullable()->after('rdap_json');
            $table->json('related_ips_json')->nullable()->after('ownership_summary_json');
            $table->string('provider_hint')->nullable()->after('related_ips_json');
            $table->string('classification')->nullable()->after('provider_hint');
        });

        Schema::table('metis_host_entities', function (Blueprint $table) {
            $table->json('ip_addresses_json')->nullable()->after('ip');
            $table->json('tls_json')->nullable()->after('http_json');
            $table->json('service_json')->nullable()->after('tls_json');
            $table->json('banner_json')->nullable()->after('service_json');
            $table->json('network_json')->nullable()->after('banner_json');
            $table->string('provider_hint')->nullable()->after('network_json');
            $table->string('classification')->nullable()->after('provider_hint');
            $table->string('favicon_hash')->nullable()->after('classification');
        });

        Schema::table('metis_url_entities', function (Blueprint $table) {
            $table->json('metadata_json')->nullable()->after('status_code');
            $table->string('classification')->nullable()->after('metadata_json');
            $table->boolean('historical_only')->default(false)->after('classification');
        });

        Schema::table('metis_job_runs', function (Blueprint $table) {
            $table->foreignId('override_id')->nullable()->after('created_by')->constrained('metis_emergency_overrides')->nullOnDelete();
            $table->json('meta_json')->nullable()->after('summary_json');
        });
    }

    public function down(): void
    {
        Schema::table('metis_job_runs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('override_id');
            $table->dropColumn('meta_json');
        });

        Schema::table('metis_url_entities', function (Blueprint $table) {
            $table->dropColumn(['metadata_json', 'classification', 'historical_only']);
        });

        Schema::table('metis_host_entities', function (Blueprint $table) {
            $table->dropColumn([
                'ip_addresses_json',
                'tls_json',
                'service_json',
                'banner_json',
                'network_json',
                'provider_hint',
                'classification',
                'favicon_hash',
            ]);
        });

        Schema::table('metis_domain_entities', function (Blueprint $table) {
            $table->dropColumn([
                'dns_summary_json',
                'ownership_summary_json',
                'related_ips_json',
                'provider_hint',
                'classification',
            ]);
        });

        Schema::dropIfExists('metis_infra_group_assets');
        Schema::dropIfExists('metis_infra_groups');
        Schema::dropIfExists('metis_report_templates');
        Schema::dropIfExists('metis_script_runs');
        Schema::dropIfExists('metis_script_templates');
        Schema::dropIfExists('metis_workflow_variables');
        Schema::dropIfExists('metis_workflow_run_steps');
        Schema::dropIfExists('metis_workflow_runs');
        Schema::dropIfExists('metis_workflow_nodes');
        Schema::dropIfExists('metis_workflows');
        Schema::dropIfExists('metis_emergency_overrides');
    }
};

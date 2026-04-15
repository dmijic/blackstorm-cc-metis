<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metis_job_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('type'); // dns_lookup, ct_lookup, http_probe, wayback, port_scan, dir_enum, wizard_pipeline
            $table->json('params_json')->nullable();
            $table->enum('status', ['queued', 'running', 'completed', 'failed', 'cancelled'])->default('queued');
            $table->text('output_ref')->nullable(); // path or key to output blob
            $table->json('summary_json')->nullable(); // counts: new_domains, new_hosts, etc.
            $table->text('error_message')->nullable();
            $table->integer('progress')->default(0); // 0-100
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('metis_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('entity_type')->nullable(); // domain_entity, host_entity, url_entity, finding_entity
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->text('text');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metis_notes');
        Schema::dropIfExists('metis_job_runs');
    }
};

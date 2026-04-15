<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metis_domain_entities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->string('domain');
            $table->boolean('verified')->default(false);
            $table->json('dns_json')->nullable();
            $table->json('ct_sources_json')->nullable();
            $table->json('rdap_json')->nullable();
            $table->enum('layer', ['scope', 'discovery', 'live', 'history', 'findings'])->default('discovery');
            $table->timestamp('first_seen')->nullable();
            $table->timestamp('last_seen')->nullable();
            $table->timestamps();

            $table->unique(['project_id', 'domain']);
        });

        Schema::create('metis_host_entities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->string('hostname');
            $table->string('ip', 45)->nullable();
            $table->json('http_json')->nullable(); // status, title, server, tech_hints, final_url, cert
            $table->integer('http_status')->nullable();
            $table->boolean('is_live')->default(false);
            $table->json('open_ports')->nullable();
            $table->timestamp('first_seen')->nullable();
            $table->timestamp('last_seen')->nullable();
            $table->timestamps();

            $table->unique(['project_id', 'hostname']);
        });

        Schema::create('metis_url_entities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->text('url');
            $table->string('source')->default('unknown'); // wayback, crawl, manual
            $table->string('status_code', 10)->nullable();
            $table->timestamp('first_seen')->nullable();
            $table->timestamp('last_seen')->nullable();
            $table->timestamps();

            $table->unique(['project_id', 'url']);
        });

        Schema::create('metis_finding_entities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->string('type'); // misconfiguration, exposed_port, vuln, leaked_credential, etc.
            $table->enum('severity', ['info', 'low', 'medium', 'high', 'critical'])->default('info');
            $table->string('title');
            $table->text('summary')->nullable();
            $table->enum('confidence', ['low', 'medium', 'high'])->default('medium');
            $table->json('evidence_json')->nullable();
            $table->enum('status', ['open', 'in_review', 'resolved', 'accepted_risk'])->default('open');
            $table->string('affected_entity_type')->nullable(); // domain, host, url
            $table->unsignedBigInteger('affected_entity_id')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metis_finding_entities');
        Schema::dropIfExists('metis_url_entities');
        Schema::dropIfExists('metis_host_entities');
        Schema::dropIfExists('metis_domain_entities');
    }
};

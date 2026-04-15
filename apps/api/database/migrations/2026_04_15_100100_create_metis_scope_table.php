<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metis_scope', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->json('root_domains')->default('[]');
            $table->json('brand_keywords')->default('[]');
            $table->json('known_subdomains')->default('[]');
            $table->json('ip_ranges')->default('[]');
            $table->json('github_orgs')->default('[]');
            $table->json('email_domains')->default('[]');
            $table->timestamps();
        });

        Schema::create('metis_domain_verifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->string('domain');
            $table->string('token', 64)->unique();
            $table->enum('method', ['dns_txt', 'well_known']);
            $table->enum('status', ['pending', 'verified', 'failed'])->default('pending');
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();

            $table->unique(['project_id', 'domain']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metis_domain_verifications');
        Schema::dropIfExists('metis_scope');
    }
};

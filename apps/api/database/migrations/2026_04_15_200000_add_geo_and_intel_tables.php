<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Geo + Shodan enrichment on host entities ──────────────────────────
        Schema::table('metis_host_entities', function (Blueprint $table) {
            $table->decimal('geo_lat', 10, 7)->nullable()->after('open_ports');
            $table->decimal('geo_lon', 10, 7)->nullable()->after('geo_lat');
            $table->string('geo_country', 100)->nullable()->after('geo_lon');
            $table->string('geo_city', 100)->nullable()->after('geo_country');
            $table->string('geo_isp', 200)->nullable()->after('geo_city');
            $table->string('geo_org', 200)->nullable()->after('geo_isp');
            $table->json('shodan_data')->nullable()->after('geo_org');
            $table->json('censys_data')->nullable()->after('shodan_data');
            $table->timestamp('geo_enriched_at')->nullable()->after('censys_data');
        });

        // ── Intel Providers ───────────────────────────────────────────────────
        // Shodan, Censys, LeakIX, HIBP, Flare, SpyCloud, DarkOwl, Telegram, GitHub, Pastebin, Tor paste
        Schema::create('metis_intel_providers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('type', [
                'shodan', 'censys', 'leakix',           // OSINT / port scan intel
                'hibp',                                  // breach database
                'flare', 'spycloud', 'darkOwl',         // commercial dark web
                'pastebin', 'github',                   // paste / code monitoring
                'telegram',                             // channel monitoring
                'tor_paste',                            // dark web paste sites via Tor
            ]);
            $table->text('api_key_encrypted')->nullable();
            $table->json('config')->nullable();          // {channel_ids: [], org: "", etc.}
            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });

        // ── Intel Hits ────────────────────────────────────────────────────────
        // Discovered leaks, mentions, exposures linked to a project
        Schema::create('metis_intel_hits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('metis_projects')->cascadeOnDelete();
            $table->string('provider_type', 50);
            $table->enum('hit_type', [
                'credential_leak',
                'paste_mention',
                'telegram_mention',
                'dark_web_mention',
                'shodan_exposure',
                'censys_exposure',
                'leakix_exposure',
                'breach_data',
            ]);
            $table->enum('severity', ['info', 'low', 'medium', 'high', 'critical'])->default('medium');
            $table->string('title');
            $table->text('summary')->nullable();
            $table->json('raw_data');
            $table->string('source_url', 2048)->nullable();
            $table->string('matched_keyword')->nullable();
            $table->boolean('acknowledged')->default(false);
            $table->timestamp('discovered_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metis_intel_hits');
        Schema::dropIfExists('metis_intel_providers');
        Schema::table('metis_host_entities', function (Blueprint $table) {
            $table->dropColumn([
                'geo_lat', 'geo_lon', 'geo_country', 'geo_city',
                'geo_isp', 'geo_org', 'shodan_data', 'censys_data', 'geo_enriched_at',
            ]);
        });
    }
};

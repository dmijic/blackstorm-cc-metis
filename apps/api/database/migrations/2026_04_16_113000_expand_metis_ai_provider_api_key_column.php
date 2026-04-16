<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('metis_ai_providers') || ! Schema::hasColumn('metis_ai_providers', 'api_key_encrypted')) {
            return;
        }

        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE metis_ai_providers ALTER COLUMN api_key_encrypted TYPE TEXT');
            return;
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE metis_ai_providers MODIFY api_key_encrypted TEXT NOT NULL');
        }
    }

    public function down(): void
    {
        // No safe rollback: encrypted payloads routinely exceed VARCHAR(255).
    }
};

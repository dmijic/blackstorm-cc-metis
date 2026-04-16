<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SuperAdmin', 'Admin', 'Operator', 'Analyst', 'Viewer'))");
            return;
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE users MODIFY role ENUM('SuperAdmin', 'Admin', 'Operator', 'Analyst', 'Viewer') NOT NULL DEFAULT 'Viewer'");
        }
    }

    public function down(): void
    {
        // Downgrade any SuperAdmin users to Admin before removing the constraint value
        DB::table('users')->where('role', 'SuperAdmin')->update(['role' => 'Admin']);

        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Admin', 'Operator', 'Analyst', 'Viewer'))");
            return;
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE users MODIFY role ENUM('Admin', 'Operator', 'Analyst', 'Viewer') NOT NULL DEFAULT 'Viewer'");
        }
    }
};

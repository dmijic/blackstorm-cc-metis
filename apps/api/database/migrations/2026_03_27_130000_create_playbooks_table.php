<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('playbooks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('org_id')->nullable();
            $table->string('name');
            $table->boolean('enabled')->default(true);
            $table->json('rules_json')->nullable();
            $table->timestamps();

            $table->index(['org_id', 'enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('playbooks');
    }
};

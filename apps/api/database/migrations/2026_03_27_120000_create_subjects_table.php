<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subjects', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('org_id')->nullable();
            $table->string('name');
            $table->enum('type', ['domain', 'email_domain', 'keyword']);
            $table->json('config_json')->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->index(['org_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subjects');
    }
};

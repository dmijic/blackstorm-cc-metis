<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('findings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('org_id')->nullable();
            $table->string('source');
            $table->string('type');
            $table->enum('severity', ['low', 'med', 'high', 'critical']);
            $table->string('title');
            $table->text('summary');
            $table->dateTime('observed_at');
            $table->decimal('confidence', 3, 2)->default(0.50);
            $table->string('dedupe_key');
            $table->enum('status', ['new', 'in_review', 'confirmed', 'false_positive', 'escalated'])->default('new');
            $table->timestamps();

            $table->index(['org_id', 'dedupe_key']);
            $table->index(['status', 'severity']);
            $table->index('observed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('findings');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('action_runs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('org_id')->nullable();
            $table->foreignId('playbook_id')->constrained()->cascadeOnDelete();
            $table->foreignId('finding_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['queued', 'sent', 'failed'])->default('queued');
            $table->json('payload_json');
            $table->text('error')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('sent_at')->nullable();

            $table->index(['status', 'created_at']);
            $table->index('finding_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('action_runs');
    }
};

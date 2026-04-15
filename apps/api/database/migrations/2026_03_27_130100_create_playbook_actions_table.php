<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('playbook_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('playbook_id')->constrained()->cascadeOnDelete();
            $table->enum('action_type', ['webhook', 'email']);
            $table->json('config_json');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('playbook_actions');
    }
};

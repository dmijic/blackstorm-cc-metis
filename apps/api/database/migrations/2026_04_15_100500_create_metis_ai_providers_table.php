<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metis_ai_providers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('name'); // "OpenAI GPT-4o", "Anthropic Claude 3.5", etc.
            $table->enum('provider', ['openai', 'anthropic', 'gemini', 'openai_compatible']);
            $table->string('model')->nullable(); // gpt-4o, claude-3-5-sonnet-20241022, etc.
            $table->string('api_key_encrypted'); // encrypted; never plaintext
            $table->string('base_url')->nullable(); // for openai_compatible
            $table->boolean('is_default')->default(false);
            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metis_ai_providers');
    }
};

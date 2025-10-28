<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('name'); // e.g., "My API Key", "Production Bearer Token"
            $table->string('type'); // e.g., "bearer", "api_key", "oauth2", "basic"
            $table->text('data'); // Encrypted JSON data containing actual credentials
            $table->text('description')->nullable(); // Optional description
            $table->timestamps();
            
            // Index for faster queries
            $table->index(['user_id', 'type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('credentials');
    }
};

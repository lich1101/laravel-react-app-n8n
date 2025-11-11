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
        Schema::create('automation_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('automation_table_id')->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('key');
            $table->enum('group', ['input', 'output', 'meta'])->default('input');
            $table->string('data_type')->default('string');
            $table->boolean('is_required')->default(false);
            $table->boolean('is_unique')->default(false);
            $table->json('options')->nullable();
            $table->json('validation_rules')->nullable();
            $table->integer('display_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['automation_table_id', 'key']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('automation_fields');
    }
};

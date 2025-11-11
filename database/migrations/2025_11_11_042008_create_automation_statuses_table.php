<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('automation_statuses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('automation_table_id')->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('value');
            $table->string('color')->nullable();
            $table->boolean('is_default')->default(false);
            $table->boolean('is_terminal')->default(false);
            $table->integer('sort_order')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['automation_table_id', 'value']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_statuses');
    }
};

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
        Schema::create('folder_project_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_folder_id')->constrained('folders')->onDelete('cascade');
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->string('project_folder_id')->nullable(); // ID của folder trong project domain
            $table->json('workflow_mappings')->nullable(); // Mapping workflow IDs: {"admin_workflow_id": "project_workflow_id"}
            $table->timestamps();

            $table->unique(['admin_folder_id', 'project_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('folder_project_mappings');
    }
};

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
        Schema::create('workflow_executions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_id')->constrained()->onDelete('cascade');
            $table->string('trigger_type')->default('webhook'); // webhook, manual, schedule
            $table->string('status')->default('running'); // running, success, failed
            $table->json('input_data')->nullable(); // Webhook input data
            $table->json('output_data')->nullable(); // Final output data
            $table->json('node_results')->nullable(); // Results from each node
            $table->text('error_message')->nullable(); // Error message if failed
            $table->integer('duration_ms')->nullable(); // Execution time in milliseconds
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('workflow_executions');
    }
};

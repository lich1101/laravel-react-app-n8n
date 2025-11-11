<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('automation_rows', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('automation_table_id')->constrained()->cascadeOnDelete();
            $table->foreignId('automation_status_id')->nullable()->constrained('automation_statuses')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('input_data')->nullable();
            $table->json('output_data')->nullable();
            $table->json('meta_data')->nullable();
            $table->boolean('is_pending_callback')->default(false);
            $table->timestamp('pending_since')->nullable();
            $table->timestamp('last_callback_at')->nullable();
            $table->timestamp('last_webhook_at')->nullable();
            $table->string('external_reference')->nullable();
            $table->json('last_webhook_payload')->nullable();
            $table->json('last_callback_payload')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['automation_table_id', 'automation_status_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_rows');
    }
};

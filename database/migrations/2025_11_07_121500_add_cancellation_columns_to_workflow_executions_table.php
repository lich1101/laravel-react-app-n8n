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
        Schema::table('workflow_executions', function (Blueprint $table) {
            $table->string('queue_job_id')->nullable()->after('trigger_type');
            $table->timestamp('cancel_requested_at')->nullable()->after('finished_at');
            $table->timestamp('cancelled_at')->nullable()->after('cancel_requested_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('workflow_executions', function (Blueprint $table) {
            $table->dropColumn(['queue_job_id', 'cancel_requested_at', 'cancelled_at']);
        });
    }
};



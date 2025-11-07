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
            $table->unsignedBigInteger('resumed_from_execution_id')->nullable()->after('workflow_id');
            $table->unsignedBigInteger('resumed_to_execution_id')->nullable()->after('resumed_from_execution_id');
            $table->timestamp('resumed_at')->nullable()->after('cancelled_at');

            $table->index('resumed_from_execution_id', 'workflow_exec_resumed_from_idx');
            $table->index('resumed_to_execution_id', 'workflow_exec_resumed_to_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('workflow_executions', function (Blueprint $table) {
            $table->dropIndex('workflow_exec_resumed_from_idx');
            $table->dropIndex('workflow_exec_resumed_to_idx');

            $table->dropColumn(['resumed_from_execution_id', 'resumed_to_execution_id', 'resumed_at']);
        });
    }
};


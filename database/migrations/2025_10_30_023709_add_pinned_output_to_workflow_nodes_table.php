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
        Schema::table('workflow_nodes', function (Blueprint $table) {
            $table->json('pinned_output')->nullable()->after('config');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('workflow_nodes', function (Blueprint $table) {
            $table->dropColumn('pinned_output');
        });
    }
};

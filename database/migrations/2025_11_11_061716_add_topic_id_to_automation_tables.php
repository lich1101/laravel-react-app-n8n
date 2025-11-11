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
        Schema::table('automation_tables', function (Blueprint $table) {
            $table->foreignId('automation_topic_id')->nullable()->after('id')->constrained('automation_topics')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('automation_tables', function (Blueprint $table) {
            $table->dropConstrainedForeignId('automation_topic_id');
        });
    }
};

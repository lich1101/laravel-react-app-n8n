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
        // Modify the enum to include 'pending'
        \Illuminate\Support\Facades\DB::statement("ALTER TABLE projects MODIFY COLUMN provisioning_status ENUM('pending', 'provisioning', 'completed', 'failed') NULL");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Revert to original enum values
        \Illuminate\Support\Facades\DB::statement("ALTER TABLE projects MODIFY COLUMN provisioning_status ENUM('provisioning', 'completed', 'failed') NULL");
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Insert max_user_workflows setting if it doesn't exist
        DB::table('system_settings')->insertOrIgnore([
            [
                'key' => 'max_user_workflows',
                'value' => '10', // Default: 10 workflows that user role can create
                'type' => 'integer',
                'description' => 'Số workflow mà role user có thể tạo thêm trong project',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('system_settings')->where('key', 'max_user_workflows')->delete();
    }
};

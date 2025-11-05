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
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique(); // Setting key (e.g. 'max_concurrent_workflows')
            $table->text('value')->nullable(); // Setting value (can be JSON)
            $table->string('type')->default('string'); // string, integer, boolean, json
            $table->text('description')->nullable(); // Setting description
            $table->timestamps();
        });

        // Insert default settings
        DB::table('system_settings')->insert([
            [
                'key' => 'max_concurrent_workflows',
                'value' => '5', // Default: 5 workflows at the same time
                'type' => 'integer',
                'description' => 'Số lượng workflow tối đa có thể chạy đồng thời',
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
        Schema::dropIfExists('system_settings');
    }
};

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
        Schema::table('workflows', function (Blueprint $table) {
            $table->foreignId('folder_id')->nullable()->after('user_id')->constrained('folders')->onDelete('cascade');
            $table->boolean('is_from_folder')->default(false)->after('folder_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('workflows', function (Blueprint $table) {
            $table->dropForeign(['folder_id']);
            $table->dropColumn(['folder_id', 'is_from_folder']);
        });
    }
};

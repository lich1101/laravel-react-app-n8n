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
        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('subscription_package_id')->nullable()->after('max_concurrent_workflows')->constrained()->onDelete('set null');
            $table->integer('max_user_workflows')->nullable()->after('subscription_package_id')->comment('Số workflow mà role user có thể tạo thêm trong project');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropForeign(['subscription_package_id']);
            $table->dropColumn(['subscription_package_id', 'max_user_workflows']);
        });
    }
};

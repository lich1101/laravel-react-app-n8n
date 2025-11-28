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
        Schema::table('subscription_packages', function (Blueprint $table) {
            $table->integer('duration_days')->nullable()->after('description')->comment('Thời hạn gói cước (số ngày)');
            $table->decimal('price', 10, 2)->nullable()->after('duration_days')->comment('Giá gói cước');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscription_packages', function (Blueprint $table) {
            $table->dropColumn(['duration_days', 'price']);
        });
    }
};

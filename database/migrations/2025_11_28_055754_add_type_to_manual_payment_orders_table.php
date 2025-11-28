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
        Schema::table('manual_payment_orders', function (Blueprint $table) {
            $table->enum('type', ['new', 'renewal', 'change'])->default('new')->after('subscription_package_id')->comment('Loại đơn hàng: new=đăng ký mới, renewal=gia hạn, change=đổi gói');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('manual_payment_orders', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};

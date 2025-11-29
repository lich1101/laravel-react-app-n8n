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
        Schema::create('payment_order_emails', function (Blueprint $table) {
            $table->id();
            $table->foreignId('manual_payment_order_id')->nullable()->constrained('manual_payment_orders')->onDelete('set null');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('subscription_package_id')->nullable()->constrained('subscription_packages')->onDelete('set null');
            $table->string('recipient_email');
            $table->string('subject');
            $table->text('customer_name')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('customer_phone')->nullable();
            $table->string('package_name')->nullable();
            $table->decimal('amount', 10, 2)->nullable();
            $table->string('order_type')->nullable(); // new, renewal, change
            $table->enum('status', ['sent', 'failed'])->default('sent');
            $table->text('error_message')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payment_order_emails');
    }
};

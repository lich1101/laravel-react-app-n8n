<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentOrderEmail extends Model
{
    use HasFactory;

    protected $fillable = [
        'manual_payment_order_id',
        'user_id',
        'subscription_package_id',
        'recipient_email',
        'subject',
        'customer_name',
        'customer_email',
        'customer_phone',
        'package_name',
        'amount',
        'order_type',
        'status',
        'error_message',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function manualPaymentOrder(): BelongsTo
    {
        return $this->belongsTo(ManualPaymentOrder::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function subscriptionPackage(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPackage::class);
    }
}

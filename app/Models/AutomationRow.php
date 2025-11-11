<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class AutomationRow extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'uuid',
        'automation_table_id',
        'automation_status_id',
        'created_by',
        'updated_by',
        'input_data',
        'output_data',
        'meta_data',
        'is_pending_callback',
        'pending_since',
        'last_callback_at',
        'last_webhook_at',
        'external_reference',
        'last_webhook_payload',
        'last_callback_payload',
    ];

    protected $casts = [
        'input_data' => 'array',
        'output_data' => 'array',
        'meta_data' => 'array',
        'last_webhook_payload' => 'array',
        'last_callback_payload' => 'array',
        'is_pending_callback' => 'boolean',
        'pending_since' => 'datetime',
        'last_callback_at' => 'datetime',
        'last_webhook_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $row): void {
            if (empty($row->uuid)) {
                $row->uuid = (string) Str::uuid();
            }
        });
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(AutomationTable::class, 'automation_table_id');
    }

    public function status(): BelongsTo
    {
        return $this->belongsTo(AutomationStatus::class, 'automation_status_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

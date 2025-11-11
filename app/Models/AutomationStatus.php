<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class AutomationStatus extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'automation_table_id',
        'label',
        'value',
        'color',
        'is_default',
        'is_terminal',
        'sort_order',
        'metadata',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'is_terminal' => 'boolean',
        'metadata' => 'array',
    ];

    public function table(): BelongsTo
    {
        return $this->belongsTo(AutomationTable::class, 'automation_table_id');
    }
}

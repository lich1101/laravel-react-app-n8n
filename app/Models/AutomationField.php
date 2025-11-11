<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class AutomationField extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'automation_table_id',
        'label',
        'key',
        'group',
        'data_type',
        'is_required',
        'is_unique',
        'options',
        'validation_rules',
        'display_order',
        'is_active',
    ];

    protected $casts = [
        'is_required' => 'boolean',
        'is_unique' => 'boolean',
        'is_active' => 'boolean',
        'options' => 'array',
        'validation_rules' => 'array',
    ];

    public function table(): BelongsTo
    {
        return $this->belongsTo(AutomationTable::class, 'automation_table_id');
    }
}

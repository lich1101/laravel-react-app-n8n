<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class AutomationTable extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'automation_topic_id',
        'name',
        'slug',
        'description',
        'is_active',
        'created_by',
        'config',
        'last_synced_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'config' => 'array',
        'last_synced_at' => 'datetime',
    ];

    public function topic(): BelongsTo
    {
        return $this->belongsTo(AutomationTopic::class, 'automation_topic_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function fields(): HasMany
    {
        return $this->hasMany(AutomationField::class);
    }

    public function statuses(): HasMany
    {
        return $this->hasMany(AutomationStatus::class)->orderBy('sort_order');
    }

    public function rows(): HasMany
    {
        return $this->hasMany(AutomationRow::class);
    }

    public function folders(): BelongsToMany
    {
        return $this->belongsToMany(Folder::class, 'folder_automation_table');
    }

    public function defaultStatus(): ?AutomationStatus
    {
        return $this->statuses()->where('is_default', true)->first();
    }
}

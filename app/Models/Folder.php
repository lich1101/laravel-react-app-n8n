<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Folder extends Model
{
    protected $fillable = [
        'name',
        'description',
        'created_by',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * User who created this folder
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Workflows in this folder (via pivot table)
     */
    public function workflows(): BelongsToMany
    {
        return $this->belongsToMany(Workflow::class, 'folder_workflows')
            ->withPivot('order')
            ->orderBy('order');
    }

    /**
     * Workflows with direct folder_id relationship
     */
    public function directWorkflows(): HasMany
    {
        return $this->hasMany(Workflow::class, 'folder_id');
    }

    /**
     * Projects using this folder
     */
    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_folders');
    }
}

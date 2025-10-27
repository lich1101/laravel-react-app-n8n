<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    protected $fillable = [
        'name',
        'subdomain',
        'domain',
        'status',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Users in this project
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * Folders assigned to this project
     */
    public function folders(): BelongsToMany
    {
        return $this->belongsToMany(Folder::class, 'project_folders');
    }

    /**
     * Workflows in this project
     */
    public function workflows(): HasMany
    {
        return $this->hasManyThrough(Workflow::class, User::class, 'project_id', 'user_id');
    }
}

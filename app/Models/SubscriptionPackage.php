<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class SubscriptionPackage extends Model
{
    protected $fillable = [
        'name',
        'max_concurrent_workflows',
        'max_user_workflows',
        'description',
        'duration_days',
        'price',
    ];

    protected $casts = [
        'max_concurrent_workflows' => 'integer',
        'max_user_workflows' => 'integer',
        'duration_days' => 'integer',
        'price' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Folders in this subscription package
     */
    public function folders(): BelongsToMany
    {
        return $this->belongsToMany(Folder::class, 'subscription_package_folder');
    }

    /**
     * Projects using this subscription package
     */
    public function projects()
    {
        return $this->hasMany(Project::class);
    }
}

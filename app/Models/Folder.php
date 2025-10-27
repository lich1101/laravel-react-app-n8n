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

    /**
     * Permissions for this folder
     */
    public function permissions(): HasMany
    {
        return $this->hasMany(FolderUserPermission::class, 'folder_id');
    }

    /**
     * Users who have permissions on this folder
     */
    public function authorizedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'folder_user_permissions', 'folder_id', 'user_id')
            ->withPivot('permission', 'granted_by')
            ->withTimestamps();
    }

    /**
     * Check if user has permission on this folder
     */
    public function userHasPermission(User $user, string $requiredPermission = 'view'): bool
    {
        // Admin and folder creator always have full access
        if ($user->role === 'admin' || $user->id === $this->created_by) {
            return true;
        }

        // Check if user has specific permission
        $permission = $this->permissions()
            ->where('user_id', $user->id)
            ->first();

        if (!$permission) {
            return false;
        }

        // View permission can only view
        // Edit permission can view and edit
        if ($requiredPermission === 'view') {
            return in_array($permission->permission, ['view', 'edit']);
        }

        if ($requiredPermission === 'edit') {
            return $permission->permission === 'edit';
        }

        return false;
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FolderProjectMapping extends Model
{
    protected $fillable = [
        'admin_folder_id',
        'project_id',
        'project_folder_id',
        'workflow_mappings',
    ];

    protected $casts = [
        'workflow_mappings' => 'array',
    ];

    /**
     * Admin folder (from administrator)
     */
    public function adminFolder(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'admin_folder_id');
    }

    /**
     * Project
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}

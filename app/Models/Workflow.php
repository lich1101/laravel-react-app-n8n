<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Workflow extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'description',
        'nodes',
        'edges',
        'active',
        'folder_id',
        'is_from_folder',
    ];

    protected $casts = [
        'nodes' => 'array',
        'edges' => 'array',
        'active' => 'boolean',
        'is_from_folder' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    public function workflowNodes()
    {
        return $this->hasMany(WorkflowNode::class);
    }

    public function executions(): HasMany
    {
        return $this->hasMany(WorkflowExecution::class);
    }

    public function folders(): BelongsToMany
    {
        return $this->belongsToMany(Folder::class, 'folder_workflows')
            ->withPivot('order')
            ->orderBy('order');
    }
}

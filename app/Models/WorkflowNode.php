<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkflowNode extends Model
{
    protected $fillable = [
        'workflow_id',
        'node_id',
        'type',
        'config',
        'pinned_output',
    ];

    protected $casts = [
        'config' => 'array',
        'pinned_output' => 'array',
    ];

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }
}

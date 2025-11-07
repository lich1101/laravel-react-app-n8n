<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkflowExecution extends Model
{
    protected $fillable = [
        'workflow_id',
        'trigger_type',
        'resumed_from_execution_id',
        'resumed_to_execution_id',
        'status',
        'queue_job_id',
        'input_data',
        'workflow_snapshot',
        'output_data',
        'node_results',
        'execution_order',
        'error_node',
        'error_message',
        'duration_ms',
        'started_at',
        'finished_at',
        'cancel_requested_at',
        'cancelled_at',
        'resumed_at',
    ];

    protected $casts = [
        'input_data' => 'array',
        'workflow_snapshot' => 'array',
        'output_data' => 'array',
        'node_results' => 'array',
        'execution_order' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'cancel_requested_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'resumed_at' => 'datetime',
    ];

    /**
     * Get the workflow that owns the execution
     */
    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }
}

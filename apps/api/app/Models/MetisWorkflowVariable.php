<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisWorkflowVariable extends Model
{
    protected $table = 'metis_workflow_variables';

    protected $fillable = [
        'workflow_run_id',
        'source_step_id',
        'key',
        'value_type',
        'value_json',
    ];

    protected function casts(): array
    {
        return [
            'value_json' => 'array',
        ];
    }

    public function workflowRun(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflowRun::class, 'workflow_run_id');
    }

    public function sourceStep(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflowRunStep::class, 'source_step_id');
    }
}

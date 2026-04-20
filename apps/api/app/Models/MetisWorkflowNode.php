<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisWorkflowNode extends Model
{
    protected $table = 'metis_workflow_nodes';

    protected $fillable = [
        'workflow_id',
        'key',
        'type',
        'position',
        'input_schema_json',
        'output_schema_json',
        'allowed_target_types_json',
        'config_json',
        'execution_class',
        'execution_mode',
        'requires_verified_scope',
        'timeout_seconds',
        'retry_limit',
        'audit_behavior',
        'supports_ai',
        'is_optional',
        'danger_level',
        'ui_meta_json',
        'next_node_key',
        'failure_node_key',
    ];

    protected function casts(): array
    {
        return [
            'input_schema_json' => 'array',
            'output_schema_json' => 'array',
            'allowed_target_types_json' => 'array',
            'config_json' => 'array',
            'requires_verified_scope' => 'boolean',
            'supports_ai' => 'boolean',
            'is_optional' => 'boolean',
            'ui_meta_json' => 'array',
        ];
    }

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflow::class, 'workflow_id');
    }
}

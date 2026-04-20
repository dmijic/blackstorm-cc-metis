<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MetisWorkflow extends Model
{
    protected $table = 'metis_workflows';

    protected $fillable = [
        'project_id',
        'created_by',
        'slug',
        'name',
        'description',
        'is_system',
        'is_default',
        'active',
        'definition_json',
    ];

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_default' => 'boolean',
            'active' => 'boolean',
            'definition_json' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function nodes(): HasMany
    {
        return $this->hasMany(MetisWorkflowNode::class, 'workflow_id')->orderBy('position');
    }

    public function runs(): HasMany
    {
        return $this->hasMany(MetisWorkflowRun::class, 'workflow_id')->latest();
    }
}

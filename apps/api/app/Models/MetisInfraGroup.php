<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MetisInfraGroup extends Model
{
    protected $table = 'metis_infra_groups';

    protected $fillable = [
        'project_id',
        'workflow_run_id',
        'type',
        'name',
        'fingerprint',
        'summary',
        'metadata_json',
        'asset_count',
        'first_seen',
        'last_seen',
    ];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
            'first_seen' => 'datetime',
            'last_seen' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }

    public function workflowRun(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflowRun::class, 'workflow_run_id');
    }

    public function assets(): HasMany
    {
        return $this->hasMany(MetisInfraGroupAsset::class, 'infra_group_id');
    }
}

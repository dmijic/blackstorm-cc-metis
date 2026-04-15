<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisFindingEntity extends Model
{
    protected $table = 'metis_finding_entities';

    protected $fillable = [
        'project_id',
        'type',
        'severity',
        'title',
        'summary',
        'confidence',
        'evidence_json',
        'status',
        'affected_entity_type',
        'affected_entity_id',
    ];

    protected function casts(): array
    {
        return [
            'evidence_json' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

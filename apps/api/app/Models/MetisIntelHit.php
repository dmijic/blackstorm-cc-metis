<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisIntelHit extends Model
{
    protected $table = 'metis_intel_hits';

    protected $fillable = [
        'project_id', 'provider_type', 'hit_type', 'severity',
        'title', 'summary', 'raw_data', 'source_url',
        'matched_keyword', 'acknowledged', 'discovered_at',
    ];

    protected $casts = [
        'raw_data'      => 'array',
        'acknowledged'  => 'boolean',
        'discovered_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

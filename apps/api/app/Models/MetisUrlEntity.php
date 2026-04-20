<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisUrlEntity extends Model
{
    protected $table = 'metis_url_entities';

    protected $fillable = [
        'project_id',
        'url',
        'source',
        'status_code',
        'metadata_json',
        'classification',
        'historical_only',
        'first_seen',
        'last_seen',
    ];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
            'historical_only' => 'boolean',
            'first_seen' => 'datetime',
            'last_seen'  => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

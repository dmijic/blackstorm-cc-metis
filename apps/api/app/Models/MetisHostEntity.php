<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisHostEntity extends Model
{
    protected $table = 'metis_host_entities';

    protected $fillable = [
        'project_id',
        'hostname',
        'ip',
        'http_json',
        'http_status',
        'is_live',
        'open_ports',
        'first_seen',
        'last_seen',
    ];

    protected function casts(): array
    {
        return [
            'http_json'  => 'array',
            'open_ports' => 'array',
            'is_live'    => 'boolean',
            'first_seen' => 'datetime',
            'last_seen'  => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

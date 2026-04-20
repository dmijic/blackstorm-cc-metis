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
        'ip_addresses_json',
        'http_json',
        'tls_json',
        'service_json',
        'banner_json',
        'network_json',
        'http_status',
        'is_live',
        'open_ports',
        'provider_hint',
        'classification',
        'favicon_hash',
        'first_seen',
        'last_seen',
    ];

    protected function casts(): array
    {
        return [
            'ip_addresses_json' => 'array',
            'http_json'  => 'array',
            'tls_json' => 'array',
            'service_json' => 'array',
            'banner_json' => 'array',
            'network_json' => 'array',
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

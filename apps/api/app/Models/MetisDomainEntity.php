<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisDomainEntity extends Model
{
    protected $table = 'metis_domain_entities';

    protected $fillable = [
        'project_id',
        'domain',
        'verified',
        'dns_json',
        'ct_sources_json',
        'rdap_json',
        'layer',
        'first_seen',
        'last_seen',
    ];

    protected function casts(): array
    {
        return [
            'verified'       => 'boolean',
            'dns_json'       => 'array',
            'ct_sources_json'=> 'array',
            'rdap_json'      => 'array',
            'first_seen'     => 'datetime',
            'last_seen'      => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisScope extends Model
{
    protected $table = 'metis_scope';

    protected $fillable = [
        'project_id',
        'root_domains',
        'brand_keywords',
        'known_subdomains',
        'ip_ranges',
        'github_orgs',
        'email_domains',
    ];

    protected function casts(): array
    {
        return [
            'root_domains'    => 'array',
            'brand_keywords'  => 'array',
            'known_subdomains'=> 'array',
            'ip_ranges'       => 'array',
            'github_orgs'     => 'array',
            'email_domains'   => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

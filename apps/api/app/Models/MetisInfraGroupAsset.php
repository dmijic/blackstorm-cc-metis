<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisInfraGroupAsset extends Model
{
    protected $table = 'metis_infra_group_assets';

    protected $fillable = [
        'infra_group_id',
        'entity_type',
        'entity_id',
        'asset_key',
        'label',
        'metadata_json',
    ];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
        ];
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(MetisInfraGroup::class, 'infra_group_id');
    }
}

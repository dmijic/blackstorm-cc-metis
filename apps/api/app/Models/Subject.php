<?php

namespace App\Models;

use App\Enums\SubjectType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subject extends Model
{
    protected $fillable = [
        'org_id',
        'name',
        'type',
        'config_json',
        'enabled',
    ];

    protected function casts(): array
    {
        return [
            'config_json' => 'array',
            'enabled' => 'boolean',
            'type' => SubjectType::class,
        ];
    }

    public function matches(): HasMany
    {
        return $this->hasMany(FindingMatch::class);
    }
}

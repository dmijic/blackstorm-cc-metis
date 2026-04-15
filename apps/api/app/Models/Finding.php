<?php

namespace App\Models;

use App\Enums\FindingSeverity;
use App\Enums\FindingStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Finding extends Model
{
    protected $fillable = [
        'org_id',
        'source',
        'type',
        'severity',
        'title',
        'summary',
        'observed_at',
        'confidence',
        'dedupe_key',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'confidence' => 'float',
            'observed_at' => 'datetime',
            'severity' => FindingSeverity::class,
            'status' => FindingStatus::class,
        ];
    }

    public function evidences(): HasMany
    {
        return $this->hasMany(Evidence::class);
    }

    public function matches(): HasMany
    {
        return $this->hasMany(FindingMatch::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(TriageNote::class)->latest('created_at');
    }

    public function actionRuns(): HasMany
    {
        return $this->hasMany(ActionRun::class)->latest('created_at');
    }
}

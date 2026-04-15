<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class MetisProject extends Model
{
    protected $table = 'metis_projects';

    protected $fillable = [
        'created_by',
        'name',
        'client',
        'description',
        'tags',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'tags' => 'array',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scope(): HasOne
    {
        return $this->hasOne(MetisScope::class, 'project_id');
    }

    public function domainVerifications(): HasMany
    {
        return $this->hasMany(MetisDomainVerification::class, 'project_id');
    }

    public function domainEntities(): HasMany
    {
        return $this->hasMany(MetisDomainEntity::class, 'project_id');
    }

    public function hostEntities(): HasMany
    {
        return $this->hasMany(MetisHostEntity::class, 'project_id');
    }

    public function urlEntities(): HasMany
    {
        return $this->hasMany(MetisUrlEntity::class, 'project_id');
    }

    public function findingEntities(): HasMany
    {
        return $this->hasMany(MetisFindingEntity::class, 'project_id');
    }

    public function jobRuns(): HasMany
    {
        return $this->hasMany(MetisJobRun::class, 'project_id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(MetisNote::class, 'project_id');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(MetisAuditLog::class, 'project_id');
    }

    public function intelHits(): HasMany
    {
        return $this->hasMany(MetisIntelHit::class, 'project_id');
    }
}

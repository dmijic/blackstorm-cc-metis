<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class MetisEmergencyOverride extends Model
{
    protected $table = 'metis_emergency_overrides';

    protected $fillable = [
        'project_id',
        'created_by',
        'confirmed_by',
        'status',
        'token',
        'run_type',
        'reason',
        'target_summary',
        'targets_json',
        'confirmation_meta',
        'one_time',
        'expires_at',
        'used_at',
    ];

    protected function casts(): array
    {
        return [
            'targets_json' => 'array',
            'confirmation_meta' => 'array',
            'one_time' => 'boolean',
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $override) {
            $override->token = $override->token ?: (string) Str::uuid();
        });
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function workflowRuns(): HasMany
    {
        return $this->hasMany(MetisWorkflowRun::class, 'override_id');
    }

    public function jobRuns(): HasMany
    {
        return $this->hasMany(MetisJobRun::class, 'override_id');
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function isUsableFor(string $runType, string $target): bool
    {
        if ($this->status !== 'confirmed' || $this->isExpired()) {
            return false;
        }

        if ($this->used_at && $this->one_time) {
            return false;
        }

        if ($this->run_type && $this->run_type !== $runType) {
            return false;
        }

        return collect($this->targets_json ?? [])
            ->contains(fn ($item) => strtolower((string) $item) === strtolower($target));
    }

    public function consume(): void
    {
        $this->update([
            'status' => $this->one_time ? 'consumed' : $this->status,
            'used_at' => now(),
        ]);
    }
}

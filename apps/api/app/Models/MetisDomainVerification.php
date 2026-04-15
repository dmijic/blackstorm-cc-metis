<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class MetisDomainVerification extends Model
{
    protected $table = 'metis_domain_verifications';

    protected $fillable = [
        'project_id',
        'domain',
        'token',
        'method',
        'status',
        'verified_at',
        'last_checked_at',
    ];

    protected function casts(): array
    {
        return [
            'verified_at'    => 'datetime',
            'last_checked_at'=> 'datetime',
        ];
    }

    public static function generateToken(): string
    {
        return 'metis-verify-' . Str::random(32);
    }

    public function isVerified(): bool
    {
        return $this->status === 'verified';
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

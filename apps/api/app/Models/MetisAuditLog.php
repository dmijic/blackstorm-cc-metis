<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisAuditLog extends Model
{
    protected $table = 'metis_audit_logs';

    public const CREATED_AT = 'occurred_at';
    public const UPDATED_AT = null; // audit logs are append-only

    protected $fillable = [
        'user_id',
        'project_id',
        'action',
        'entity_type',
        'entity_id',
        'meta',
        'ip_address',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'meta'        => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public static function record(
        string $action,
        ?int $projectId = null,
        ?int $userId = null,
        ?string $entityType = null,
        ?int $entityId = null,
        array $meta = [],
        ?string $ip = null
    ): self {
        return self::create([
            'action'      => $action,
            'project_id'  => $projectId,
            'user_id'     => $userId,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'meta'        => $meta,
            'ip_address'  => $ip,
        ]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }
}

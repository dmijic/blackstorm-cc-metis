<?php

namespace App\Models;

use App\Enums\ActionRunStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActionRun extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'org_id',
        'playbook_id',
        'finding_id',
        'status',
        'payload_json',
        'error',
        'created_at',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'payload_json' => 'array',
            'sent_at' => 'datetime',
            'status' => ActionRunStatus::class,
        ];
    }

    public function playbook(): BelongsTo
    {
        return $this->belongsTo(Playbook::class);
    }

    public function finding(): BelongsTo
    {
        return $this->belongsTo(Finding::class);
    }
}

<?php

namespace App\Models;

use App\Enums\EvidenceKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Evidence extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'evidences';

    protected $fillable = [
        'finding_id',
        'kind',
        'data_json',
    ];

    protected function casts(): array
    {
        return [
            'data_json' => 'array',
            'kind' => EvidenceKind::class,
        ];
    }

    public function finding(): BelongsTo
    {
        return $this->belongsTo(Finding::class);
    }
}

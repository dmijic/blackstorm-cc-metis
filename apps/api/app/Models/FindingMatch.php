<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FindingMatch extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'matches';

    protected $fillable = [
        'finding_id',
        'subject_id',
        'confidence',
        'why_json',
    ];

    protected function casts(): array
    {
        return [
            'confidence' => 'float',
            'why_json' => 'array',
        ];
    }

    public function finding(): BelongsTo
    {
        return $this->belongsTo(Finding::class);
    }

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }
}

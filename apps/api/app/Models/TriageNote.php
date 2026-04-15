<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TriageNote extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'finding_id',
        'actor_id',
        'note',
    ];

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function finding(): BelongsTo
    {
        return $this->belongsTo(Finding::class);
    }
}

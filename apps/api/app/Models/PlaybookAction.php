<?php

namespace App\Models;

use App\Enums\PlaybookActionType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlaybookAction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'playbook_id',
        'action_type',
        'config_json',
    ];

    protected function casts(): array
    {
        return [
            'action_type' => PlaybookActionType::class,
            'config_json' => 'array',
        ];
    }

    public function playbook(): BelongsTo
    {
        return $this->belongsTo(Playbook::class);
    }
}

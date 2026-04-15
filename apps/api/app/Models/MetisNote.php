<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisNote extends Model
{
    protected $table = 'metis_notes';

    protected $fillable = [
        'project_id',
        'created_by',
        'entity_type',
        'entity_id',
        'text',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

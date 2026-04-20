<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetisReportTemplate extends Model
{
    protected $table = 'metis_report_templates';

    protected $fillable = [
        'created_by',
        'slug',
        'name',
        'description',
        'style',
        'template_kind',
        'config_json',
        'sections_json',
        'ai_defaults_json',
        'strict_evidence_default',
        'is_system',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'config_json' => 'array',
            'sections_json' => 'array',
            'ai_defaults_json' => 'array',
            'strict_evidence_default' => 'boolean',
            'is_system' => 'boolean',
            'active' => 'boolean',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

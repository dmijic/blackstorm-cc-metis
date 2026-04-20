<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MetisScriptTemplate extends Model
{
    protected $table = 'metis_script_templates';

    protected $fillable = [
        'project_id',
        'created_by',
        'slug',
        'name',
        'description',
        'runtime',
        'script_body',
        'input_schema_json',
        'output_schema_json',
        'allowed_target_types_json',
        'execution_policy_json',
        'timeout_seconds',
        'environment_policy_json',
        'network_policy_json',
        'ai_prompt_template',
        'enabled',
        'is_system',
    ];

    protected function casts(): array
    {
        return [
            'input_schema_json' => 'array',
            'output_schema_json' => 'array',
            'allowed_target_types_json' => 'array',
            'execution_policy_json' => 'array',
            'environment_policy_json' => 'array',
            'network_policy_json' => 'array',
            'enabled' => 'boolean',
            'is_system' => 'boolean',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function runs(): HasMany
    {
        return $this->hasMany(MetisScriptRun::class, 'template_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class MetisScriptRun extends Model
{
    protected $table = 'metis_script_runs';

    protected $fillable = [
        'project_id',
        'template_id',
        'workflow_run_id',
        'created_by',
        'status',
        'input_json',
        'parsed_output_json',
        'artifacts_json',
        'ai_summary_json',
        'stdout_ref',
        'stderr_ref',
        'error_message',
        'timeout_seconds',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'input_json' => 'array',
            'parsed_output_json' => 'array',
            'artifacts_json' => 'array',
            'ai_summary_json' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(MetisScriptTemplate::class, 'template_id');
    }

    public function workflowRun(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflowRun::class, 'workflow_run_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function storeArtifact(string $channel, string $content): string
    {
        $path = "metis/scripts/{$this->id}/{$channel}.log";
        Storage::disk('local')->put($path, $content);
        $column = "{$channel}_ref";
        $this->update([$column => $path]);

        return $path;
    }

    public function loadArtifact(string $channel): ?string
    {
        $column = "{$channel}_ref";
        $ref = $this->{$column};

        if (! $ref || ! Storage::disk('local')->exists($ref)) {
            return null;
        }

        return (string) Storage::disk('local')->get($ref);
    }
}

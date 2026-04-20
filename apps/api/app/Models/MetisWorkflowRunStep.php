<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class MetisWorkflowRunStep extends Model
{
    protected $table = 'metis_workflow_run_steps';

    protected $fillable = [
        'workflow_run_id',
        'workflow_node_id',
        'used_job_run_id',
        'key',
        'type',
        'status',
        'input_json',
        'output_ref',
        'summary_json',
        'error_message',
        'attempt',
        'used_override',
        'duration_ms',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'input_json' => 'array',
            'summary_json' => 'array',
            'used_override' => 'boolean',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function workflowRun(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflowRun::class, 'workflow_run_id');
    }

    public function workflowNode(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflowNode::class, 'workflow_node_id');
    }

    public function usedJobRun(): BelongsTo
    {
        return $this->belongsTo(MetisJobRun::class, 'used_job_run_id');
    }

    public function markStarted(): void
    {
        $this->update([
            'status' => 'running',
            'started_at' => now(),
        ]);
    }

    public function markCompleted(array $summary = [], array $output = []): void
    {
        if ($output !== []) {
            $this->storeOutput($output);
        }

        $durationMs = $this->started_at
            ? (int) round(now()->diffInMilliseconds($this->started_at))
            : null;

        $this->update([
            'status' => 'completed',
            'summary_json' => $summary,
            'duration_ms' => $durationMs,
            'finished_at' => now(),
        ]);
    }

    public function markFailed(string $error, array $output = []): void
    {
        if ($output !== []) {
            $this->storeOutput($output);
        }

        $durationMs = $this->started_at
            ? (int) round(now()->diffInMilliseconds($this->started_at))
            : null;

        $this->update([
            'status' => 'failed',
            'error_message' => $error,
            'duration_ms' => $durationMs,
            'finished_at' => now(),
        ]);
    }

    public function storeOutput(array $payload): void
    {
        $path = "metis/workflows/{$this->workflow_run_id}/steps/{$this->id}.json";
        Storage::disk('local')->put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->update(['output_ref' => $path]);
    }

    public function loadOutput(): ?array
    {
        if (! $this->output_ref || ! Storage::disk('local')->exists($this->output_ref)) {
            return null;
        }

        $decoded = json_decode((string) Storage::disk('local')->get($this->output_ref), true);

        return is_array($decoded) ? $decoded : null;
    }
}

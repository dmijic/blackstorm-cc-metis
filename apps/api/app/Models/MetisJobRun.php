<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class MetisJobRun extends Model
{
    protected $table = 'metis_job_runs';

    protected $fillable = [
        'project_id',
        'created_by',
        'type',
        'params_json',
        'status',
        'output_ref',
        'summary_json',
        'error_message',
        'progress',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'params_json'  => 'array',
            'summary_json' => 'array',
            'started_at'   => 'datetime',
            'finished_at'  => 'datetime',
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

    public function markStarted(): void
    {
        $this->update([
            'status'     => 'running',
            'progress'   => max(5, (int) $this->progress),
            'started_at' => now(),
        ]);

        MetisAuditLog::record(
            action: "job.started.{$this->type}",
            projectId: $this->project_id,
            userId: $this->created_by,
            entityType: 'job_run',
            entityId: $this->id,
        );
    }

    public function markCompleted(array $summary = []): void
    {
        $this->update([
            'status'      => 'completed',
            'progress'    => 100,
            'summary_json'=> $summary,
            'finished_at' => now(),
        ]);

        MetisAuditLog::record(
            action: "job.completed.{$this->type}",
            projectId: $this->project_id,
            userId: $this->created_by,
            entityType: 'job_run',
            entityId: $this->id,
            meta: $summary,
        );
    }

    public function markFailed(string $error): void
    {
        $this->update([
            'status'        => 'failed',
            'error_message' => $error,
            'finished_at'   => now(),
        ]);

        MetisAuditLog::record(
            action: "job.failed.{$this->type}",
            projectId: $this->project_id,
            userId: $this->created_by,
            entityType: 'job_run',
            entityId: $this->id,
            meta: ['error' => $error],
        );
    }

    public function storeOutput(array $payload): void
    {
        $path = "metis/runs/{$this->id}.json";

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

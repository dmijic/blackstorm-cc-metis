<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class MetisWorkflowRun extends Model
{
    protected $table = 'metis_workflow_runs';

    protected $fillable = [
        'workflow_id',
        'project_id',
        'created_by',
        'override_id',
        'status',
        'current_node_key',
        'input_json',
        'summary_json',
        'context_ref',
        'error_message',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'input_json' => 'array',
            'summary_json' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(MetisWorkflow::class, 'workflow_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(MetisProject::class, 'project_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function override(): BelongsTo
    {
        return $this->belongsTo(MetisEmergencyOverride::class, 'override_id');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(MetisWorkflowRunStep::class, 'workflow_run_id')->orderBy('id');
    }

    public function variables(): HasMany
    {
        return $this->hasMany(MetisWorkflowVariable::class, 'workflow_run_id');
    }

    public function markStarted(): void
    {
        $this->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        MetisAuditLog::record(
            action: 'workflow.started',
            projectId: $this->project_id,
            userId: $this->created_by,
            entityType: 'workflow_run',
            entityId: $this->id,
            meta: ['workflow_id' => $this->workflow_id],
        );
    }

    public function markCompleted(array $summary = [], array $context = []): void
    {
        if ($context !== []) {
            $this->storeContext($context);
        }

        $this->update([
            'status' => 'completed',
            'summary_json' => $summary,
            'finished_at' => now(),
        ]);

        MetisAuditLog::record(
            action: 'workflow.completed',
            projectId: $this->project_id,
            userId: $this->created_by,
            entityType: 'workflow_run',
            entityId: $this->id,
            meta: $summary,
        );
    }

    public function markFailed(string $error, array $context = []): void
    {
        if ($context !== []) {
            $this->storeContext($context);
        }

        $this->update([
            'status' => 'failed',
            'error_message' => $error,
            'finished_at' => now(),
        ]);

        MetisAuditLog::record(
            action: 'workflow.failed',
            projectId: $this->project_id,
            userId: $this->created_by,
            entityType: 'workflow_run',
            entityId: $this->id,
            meta: ['error' => $error],
        );
    }

    public function storeContext(array $payload): void
    {
        $path = "metis/workflows/{$this->id}/context.json";
        Storage::disk('local')->put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->update(['context_ref' => $path]);
    }

    public function loadContext(): ?array
    {
        if (! $this->context_ref || ! Storage::disk('local')->exists($this->context_ref)) {
            return null;
        }

        $decoded = json_decode((string) Storage::disk('local')->get($this->context_ref), true);

        return is_array($decoded) ? $decoded : null;
    }
}

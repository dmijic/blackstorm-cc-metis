<?php

namespace App\Jobs\Metis;

use App\Services\Metis\WorkflowEngineService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class RunMetisWorkflowJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800;
    public int $tries = 1;

    public function __construct(public readonly int $workflowRunId) {}

    public function handle(WorkflowEngineService $engine): void
    {
        try {
            $engine->execute($this->workflowRunId);
        } catch (\Throwable $e) {
            Log::error("RunMetisWorkflowJob [{$this->workflowRunId}] failed: ".$e->getMessage());
            throw $e;
        }
    }
}

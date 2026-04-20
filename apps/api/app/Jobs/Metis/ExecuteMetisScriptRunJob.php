<?php

namespace App\Jobs\Metis;

use App\Models\MetisScriptRun;
use App\Services\Metis\ScriptExecutionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ExecuteMetisScriptRunJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;
    public int $tries = 1;

    public function __construct(public readonly int $scriptRunId) {}

    public function handle(ScriptExecutionService $scripts): void
    {
        $run = MetisScriptRun::query()->with('template')->findOrFail($this->scriptRunId);

        try {
            $scripts->execute($run);
        } catch (\Throwable $e) {
            Log::error("ExecuteMetisScriptRunJob [{$this->scriptRunId}] failed: ".$e->getMessage());
            $run->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'finished_at' => now(),
            ]);
        }
    }
}

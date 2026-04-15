<?php

namespace App\Jobs\Metis;

use App\Models\MetisJobRun;
use App\Services\Metis\ReconService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class CtLookupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 120;
    public int $tries   = 2;

    public function __construct(public readonly int $jobRunId) {}

    public function handle(ReconService $recon): void
    {
        $run = MetisJobRun::findOrFail($this->jobRunId);

        try {
            $recon->ctLookup($run);
        } catch (\Throwable $e) {
            Log::error("CtLookupJob [{$this->jobRunId}] failed: " . $e->getMessage());
            $run->markFailed($e->getMessage());
        }
    }
}

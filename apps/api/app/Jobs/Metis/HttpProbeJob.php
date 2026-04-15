<?php

namespace App\Jobs\Metis;

use App\Models\MetisJobRun;
use App\Services\Metis\ReconService;
use App\Services\Metis\ScopeVerifierService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class HttpProbeJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;
    public int $tries   = 1;

    public function __construct(public readonly int $jobRunId) {}

    public function handle(ReconService $recon, ScopeVerifierService $scopeVerifier): void
    {
        $run = MetisJobRun::findOrFail($this->jobRunId);

        try {
            $recon->httpProbe($run, $scopeVerifier);
        } catch (\Throwable $e) {
            Log::error("HttpProbeJob [{$this->jobRunId}] failed: " . $e->getMessage());
            $run->markFailed($e->getMessage());
        }
    }
}

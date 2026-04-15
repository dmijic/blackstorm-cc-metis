<?php

namespace App\Jobs\Metis;

use App\Models\MetisJobRun;
use App\Services\Metis\ReconService;
use App\Services\Metis\ScopeVerifierService;
use App\Services\Metis\ToolsClientService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class PortScanJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;
    public int $tries = 1;

    public function __construct(public readonly int $jobRunId) {}

    public function handle(
        ReconService $recon,
        ScopeVerifierService $scopeVerifier,
        ToolsClientService $tools
    ): void {
        $run = MetisJobRun::findOrFail($this->jobRunId);

        try {
            $recon->portScan($run, $scopeVerifier, $tools);
        } catch (\Throwable $e) {
            Log::error("PortScanJob [{$this->jobRunId}] failed: " . $e->getMessage());
            $run->markFailed($e->getMessage());
        }
    }
}

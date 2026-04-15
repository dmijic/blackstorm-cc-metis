<?php

namespace App\Jobs\Metis;

use App\Models\MetisJobRun;
use App\Services\Metis\AssessmentService;
use App\Services\Metis\ScopeVerifierService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class DirectoryDiscoveryJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900;
    public int $tries = 1;

    public function __construct(public readonly int $jobRunId) {}

    public function handle(AssessmentService $assessment, ScopeVerifierService $scopeVerifier): void
    {
        $run = MetisJobRun::findOrFail($this->jobRunId);

        try {
            $assessment->directoryDiscovery($run, $scopeVerifier);
        } catch (\Throwable $e) {
            Log::error("DirectoryDiscoveryJob [{$this->jobRunId}] failed: ".$e->getMessage());
            $run->markFailed($e->getMessage());
        }
    }
}

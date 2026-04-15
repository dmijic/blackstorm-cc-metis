<?php

namespace App\Jobs\Metis;

use App\Models\MetisJobRun;
use App\Services\Metis\IntelService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class GithubHintsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;
    public int $tries = 1;

    public function __construct(public readonly int $jobRunId) {}

    public function handle(IntelService $intel): void
    {
        $run = MetisJobRun::findOrFail($this->jobRunId);

        try {
            $intel->githubHints($run);
        } catch (\Throwable $e) {
            Log::error("GithubHintsJob [{$this->jobRunId}] failed: ".$e->getMessage());
            $run->markFailed($e->getMessage());
        }
    }
}

<?php

namespace App\Jobs\Metis;

use App\Models\MetisJobRun;
use App\Models\MetisProject;
use App\Services\Metis\AssessmentService;
use App\Services\Metis\IntelService;
use App\Services\Metis\ReconService;
use App\Services\Metis\ScopeVerifierService;
use App\Services\Metis\ToolsClientService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Orchestrates the main Metis wizard pipeline:
 * 1. Passive OSINT (DNS + CT + Subfinder + GitHub hints per root domain)
 * 2. Validate Live (HTTP probe + port scan + directory discovery on authorized scope)
 * 3. History (Wayback per root domain)
 * 4. Surface Map (dedupe/classify is reflected in entity layers, findings, and summaries)
 * 5. Documentation readiness
 */
class WizardPipelineJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800;
    public int $tries = 1;

    public function __construct(
        public readonly int $jobRunId,
        public readonly array $steps = ['dns', 'ct', 'subfinder', 'github_hints', 'http_probe', 'port_scan', 'directory_enum', 'wayback'],
    ) {}

    public function handle(
        ReconService $recon,
        AssessmentService $assessment,
        IntelService $intel,
        ScopeVerifierService $scopeVerifier,
        ToolsClientService $tools
    ): void {
        $pipelineRun = MetisJobRun::query()->with('creator')->findOrFail($this->jobRunId);
        $project = MetisProject::query()->with('scope')->findOrFail($pipelineRun->project_id);
        $rootDomains = $project->scope?->root_domains ?? [];

        if ($rootDomains === []) {
            $pipelineRun->markFailed('No root domains defined in scope.');
            return;
        }

        $pipelineRun->markStarted();

        $stepResults = [];
        $childRunIds = [];

        try {
            $this->runStep('dns', function () use ($project, $rootDomains, $recon, &$stepResults, &$childRunIds) {
                foreach ($rootDomains as $domain) {
                    $run = $this->createChildRun($project, 'dns_lookup', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['dns'][$domain] = $recon->dnsLookup($run);
                }
            });

            $this->runStep('ct', function () use ($project, $rootDomains, $recon, &$stepResults, &$childRunIds) {
                foreach ($rootDomains as $domain) {
                    $run = $this->createChildRun($project, 'ct_lookup', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['ct'][$domain] = $recon->ctLookup($run);
                }
            });

            $this->runStep('subfinder', function () use ($project, $rootDomains, $recon, $tools, &$stepResults, &$childRunIds) {
                foreach ($rootDomains as $domain) {
                    $run = $this->createChildRun($project, 'subfinder', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['subfinder'][$domain] = $recon->subfinder($run, $tools);
                }
            });

            $this->runStep('github_hints', function () use ($project, $intel, &$stepResults, &$childRunIds) {
                $run = $this->createChildRun($project, 'github_hints', []);
                $childRunIds[] = $run->id;
                $stepResults['github_hints'] = $intel->githubHints($run);
            });

            $this->runStep('http_probe', function () use ($project, $recon, $scopeVerifier, &$stepResults, &$childRunIds) {
                $hosts = $project->domainEntities()
                    ->pluck('domain')
                    ->unique()
                    ->values()
                    ->all();

                if ($hosts !== []) {
                    $run = $this->createChildRun($project, 'http_probe', ['hosts' => $hosts]);
                    $childRunIds[] = $run->id;
                    $stepResults['http_probe'] = $recon->httpProbe($run, $scopeVerifier);
                }
            });

            $this->runStep('port_scan', function () use ($project, $recon, $scopeVerifier, $tools, &$stepResults, &$childRunIds) {
                $hosts = $project->hostEntities()
                    ->where('is_live', true)
                    ->pluck('hostname')
                    ->unique()
                    ->values()
                    ->all();

                if ($hosts !== []) {
                    $run = $this->createChildRun($project, 'port_scan', ['hosts' => $hosts]);
                    $childRunIds[] = $run->id;
                    $stepResults['port_scan'] = $recon->portScan($run, $scopeVerifier, $tools);
                }
            });

            $this->runStep('directory_enum', function () use ($project, $assessment, $scopeVerifier, &$stepResults, &$childRunIds) {
                $run = $this->createChildRun($project, 'directory_enum', []);
                $childRunIds[] = $run->id;
                $stepResults['directory_enum'] = $assessment->directoryDiscovery($run, $scopeVerifier);
            });

            $this->runStep('wayback', function () use ($project, $rootDomains, $recon, &$stepResults, &$childRunIds) {
                foreach ($rootDomains as $domain) {
                    $run = $this->createChildRun($project, 'wayback', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['wayback'][$domain] = $recon->waybackFetch($run);
                }
            });

            $summary = [
                'steps_run' => array_values(array_intersect(['dns', 'ct', 'subfinder', 'github_hints', 'http_probe', 'port_scan', 'directory_enum', 'wayback'], $this->steps)),
                'child_runs' => count($childRunIds),
            ];

            $pipelineRun->storeOutput([
                'steps' => $stepResults,
                'child_run_ids' => $childRunIds,
            ]);
            $pipelineRun->markCompleted($summary);

            Log::info("WizardPipeline complete for run {$this->jobRunId}.");
        } catch (\Throwable $e) {
            Log::error("WizardPipeline [{$this->jobRunId}] failed: " . $e->getMessage());
            $pipelineRun->storeOutput([
                'steps' => $stepResults,
                'child_run_ids' => $childRunIds,
                'error' => $e->getMessage(),
            ]);
            $pipelineRun->markFailed($e->getMessage());
        }
    }

    private function runStep(string $step, callable $callback): void
    {
        if (! in_array($step, $this->steps, true)) {
            return;
        }

        $callback();
    }

    private function createChildRun(MetisProject $project, string $type, array $params): MetisJobRun
    {
        return MetisJobRun::create([
            'project_id' => $project->id,
            'created_by' => $this->resolveCreatedBy(),
            'type' => $type,
            'params_json' => $params,
            'status' => 'queued',
        ]);
    }

    private function resolveCreatedBy(): int
    {
        return MetisJobRun::query()->findOrFail($this->jobRunId)->created_by;
    }
}

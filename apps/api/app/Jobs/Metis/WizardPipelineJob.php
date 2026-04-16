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
use Illuminate\Support\Collection;
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
        public readonly array $optionalSteps = ['wayback'],
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
        $warnings = [];

        try {
            $seedDomains = collect([
                ...$rootDomains,
                ...($project->scope?->known_subdomains ?? []),
            ])
                ->map(fn ($domain) => strtolower(trim((string) $domain)))
                ->filter()
                ->unique()
                ->values()
                ->all();

            $this->runStep('dns', function () use ($project, $seedDomains, $recon, &$stepResults, &$childRunIds) {
                foreach ($seedDomains as $domain) {
                    $run = $this->createChildRun($project, 'dns_lookup', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['dns'][$domain] = $recon->dnsLookup($run);
                }
            }, $warnings);

            $this->runStep('ct', function () use ($project, $rootDomains, $recon, &$stepResults, &$childRunIds) {
                foreach ($rootDomains as $domain) {
                    $run = $this->createChildRun($project, 'ct_lookup', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['ct'][$domain] = $recon->ctLookup($run);
                }
            }, $warnings);

            $this->runStep('subfinder', function () use ($project, $rootDomains, $recon, $tools, &$stepResults, &$childRunIds) {
                foreach ($rootDomains as $domain) {
                    $run = $this->createChildRun($project, 'subfinder', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['subfinder'][$domain] = $recon->subfinder($run, $tools);
                }
            }, $warnings);

            $this->runStep('github_hints', function () use ($project, $intel, &$stepResults, &$childRunIds) {
                $run = $this->createChildRun($project, 'github_hints', []);
                $childRunIds[] = $run->id;
                $stepResults['github_hints'] = $intel->githubHints($run);
            }, $warnings);

            $this->runStep('dns', function () use ($project, $recon, &$stepResults, &$childRunIds) {
                $domainsToResolve = $this->domainsNeedingDnsEnrichment($project);

                if ($domainsToResolve->isEmpty()) {
                    return;
                }

                foreach ($domainsToResolve as $domain) {
                    $run = $this->createChildRun($project, 'dns_lookup', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['dns_enrichment'][$domain] = $recon->dnsLookup($run);
                }
            }, $warnings);

            $this->runStep('http_probe', function () use ($project, $recon, $scopeVerifier, &$stepResults, &$childRunIds) {
                $project->refresh();

                $hosts = $project->hostEntities()
                    ->pluck('hostname')
                    ->merge(
                        $project->domainEntities()
                            ->pluck('domain')
                    )
                    ->unique()
                    ->values()
                    ->all();

                if ($hosts !== []) {
                    $run = $this->createChildRun($project, 'http_probe', ['hosts' => $hosts]);
                    $childRunIds[] = $run->id;
                    $stepResults['http_probe'] = $recon->httpProbe($run, $scopeVerifier);
                }
            }, $warnings);

            $this->runStep('port_scan', function () use ($project, $recon, $scopeVerifier, $tools, &$stepResults, &$childRunIds) {
                $project->refresh();

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
            }, $warnings);

            $this->runStep('directory_enum', function () use ($project, $assessment, $scopeVerifier, &$stepResults, &$childRunIds) {
                $run = $this->createChildRun($project, 'directory_enum', []);
                $childRunIds[] = $run->id;
                $stepResults['directory_enum'] = $assessment->directoryDiscovery($run, $scopeVerifier);
            }, $warnings);

            $this->runStep('wayback', function () use ($project, $rootDomains, $recon, &$stepResults, &$childRunIds) {
                foreach ($rootDomains as $domain) {
                    $run = $this->createChildRun($project, 'wayback', ['domain' => $domain]);
                    $childRunIds[] = $run->id;
                    $stepResults['wayback'][$domain] = $recon->waybackFetch($run);
                }
            }, $warnings);

            $project->refresh();

            $chain = [
                'seed_domains' => count($seedDomains),
                'discovered_domains' => $project->domainEntities()->count(),
                'resolved_hosts' => $project->hostEntities()->count(),
                'live_hosts' => $project->hostEntities()->where('is_live', true)->count(),
                'historical_urls' => $project->urlEntities()->count(),
                'open_findings' => $project->findingEntities()->where('status', 'open')->count(),
            ];

            $recommendations = $this->buildRecommendations($project, $chain);

            $summary = [
                'steps_run' => array_values(array_intersect(['dns', 'ct', 'subfinder', 'github_hints', 'http_probe', 'port_scan', 'directory_enum', 'wayback'], $this->steps)),
                'child_runs' => count($childRunIds),
                'warnings' => count($warnings),
                'chain' => $chain,
            ];

            $pipelineRun->storeOutput([
                'steps' => $stepResults,
                'child_run_ids' => $childRunIds,
                'warnings' => $warnings,
                'chain' => $chain,
                'recommendations' => $recommendations,
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

    private function runStep(string $step, callable $callback, array &$warnings): void
    {
        if (! in_array($step, $this->steps, true)) {
            return;
        }

        try {
            $callback();
        } catch (\Throwable $e) {
            if (in_array($step, $this->optionalSteps, true)) {
                $warnings[] = [
                    'step' => $step,
                    'message' => $e->getMessage(),
                ];

                Log::warning("WizardPipeline optional step [{$step}] failed: ".$e->getMessage());
                return;
            }

            throw $e;
        }
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

    private function domainsNeedingDnsEnrichment(MetisProject $project): Collection
    {
        return $project->domainEntities()
            ->get()
            ->filter(fn ($entity) => empty($entity->dns_json))
            ->pluck('domain')
            ->map(fn ($domain) => strtolower(trim((string) $domain)))
            ->filter()
            ->unique()
            ->values();
    }

    private function buildRecommendations(MetisProject $project, array $chain): array
    {
        $recommendations = [];
        $scope = $project->scope;

        if ($project->domainVerifications()->where('status', 'verified')->count() === 0) {
            $recommendations[] = [
                'id' => 'verify-scope',
                'label' => 'Verify at least one root domain to unlock active validation safely.',
                'target' => 'scope',
            ];
        }

        if (($scope?->github_orgs ?? []) !== []) {
            $recommendations[] = [
                'id' => 'github-hints',
                'label' => 'Run GitHub Hints after configuring a GitHub token to avoid rate limits.',
                'target' => 'modules',
            ];
        }

        if (($scope?->email_domains ?? []) !== []) {
            $recommendations[] = [
                'id' => 'hibp',
                'label' => 'Run HIBP for owned email domains if the connector is configured.',
                'target' => 'modules',
            ];
        }

        if (($chain['live_hosts'] ?? 0) > 0) {
            $recommendations[] = [
                'id' => 'report',
                'label' => 'Generate a report now that live surface data is available.',
                'target' => 'report',
            ];
        } elseif (($chain['resolved_hosts'] ?? 0) > 0) {
            $recommendations[] = [
                'id' => 'validate-live',
                'label' => 'Run HTTP probe on resolved hosts to separate live services from passive inventory.',
                'target' => 'validate',
            ];
        }

        if (($chain['historical_urls'] ?? 0) === 0) {
            $recommendations[] = [
                'id' => 'wayback-optional',
                'label' => 'History fetch is optional. Run Wayback later if you need path discovery and legacy endpoints.',
                'target' => 'history',
            ];
        }

        return $recommendations;
    }
}

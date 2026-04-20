<?php

namespace App\Services\Metis;

use App\Models\MetisEmergencyOverride;
use App\Models\MetisJobRun;
use App\Models\MetisProject;
use App\Models\MetisReportTemplate;
use App\Models\MetisScriptTemplate;
use App\Models\MetisWorkflow;
use App\Models\MetisWorkflowNode;
use App\Models\MetisWorkflowRun;
use App\Models\MetisWorkflowRunStep;
use App\Models\MetisWorkflowVariable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class WorkflowEngineService
{
    public function __construct(
        private readonly WorkflowBlueprintService $blueprints,
        private readonly ReconService $recon,
        private readonly IntelService $intel,
        private readonly AssessmentService $assessment,
        private readonly SearchReconService $searchRecon,
        private readonly AttackSurfaceService $attackSurface,
        private readonly ScopeVerifierService $scopeVerifier,
        private readonly ToolsClientService $tools,
        private readonly ScriptExecutionService $scripts,
        private readonly AiService $ai,
        private readonly ReportService $reports,
    ) {}

    public function syncDefaults(?int $userId = null): MetisWorkflow
    {
        foreach ($this->blueprints->reportTemplates() as $template) {
            MetisReportTemplate::query()->updateOrCreate(
                ['slug' => $template['slug']],
                [...$template, 'created_by' => $userId]
            );
        }

        foreach ($this->blueprints->scriptTemplates() as $template) {
            MetisScriptTemplate::query()->updateOrCreate(
                ['slug' => $template['slug']],
                [...$template, 'created_by' => $userId]
            );
        }

        $workflowDefinition = $this->blueprints->defaultWorkflow();
        $workflow = MetisWorkflow::query()->updateOrCreate(
            ['slug' => $workflowDefinition['slug']],
            Arr::except($workflowDefinition, ['nodes']) + ['created_by' => $userId]
        );

        foreach ($workflowDefinition['nodes'] as $node) {
            $workflow->nodes()->updateOrCreate(
                ['key' => $node['key']],
                $node
            );
        }

        return $workflow->fresh('nodes');
    }

    public function createRun(MetisWorkflow $workflow, MetisProject $project, int $userId, array $input = [], ?MetisEmergencyOverride $override = null): MetisWorkflowRun
    {
        return MetisWorkflowRun::query()->create([
            'workflow_id' => $workflow->id,
            'project_id' => $project->id,
            'created_by' => $userId,
            'override_id' => $override?->id,
            'status' => 'queued',
            'input_json' => $input,
        ]);
    }

    public function execute(int $workflowRunId): void
    {
        $run = MetisWorkflowRun::query()
            ->with(['workflow.nodes', 'project.scope', 'project.domainEntities', 'project.hostEntities', 'override', 'creator'])
            ->findOrFail($workflowRunId);

        $run->markStarted();
        $this->seedScopeVariables($run);
        $resumeSource = $this->resolveResumeSource($run);

        $context = $this->loadContext($run);

        foreach ($run->workflow->nodes as $node) {
            $run->update(['current_node_key' => $node->key]);
            $step = $run->steps()->create([
                'workflow_node_id' => $node->id,
                'key' => $node->key,
                'type' => $node->type,
                'status' => 'queued',
                'input_json' => $context,
                'used_override' => $run->override_id !== null && $node->requires_verified_scope,
            ]);

            if ($this->shouldSkipNode($run, $node)) {
                $step->markCompleted(
                    ['status' => 'skipped', 'reason' => 'disabled_by_workflow_input'],
                    ['status' => 'skipped']
                );
                $this->putVariable($run, "workflow.skipped.{$node->key}", [
                    'node' => $node->key,
                    'reason' => 'disabled_by_workflow_input',
                ], $step);
                continue;
            }

            if ($resumeSource && $this->reuseCompletedNode($run, $resumeSource, $node, $step)) {
                $context = $this->loadContext($run);
                continue;
            }

            $step->markStarted();

            try {
                $result = $this->executeNode($run, $node, $step);
                foreach ($result['variables'] ?? [] as $key => $value) {
                    $this->putVariable($run, $key, $value, $step);
                }

                $context = $this->loadContext($run);
                $step->markCompleted($result['summary'] ?? [], $result['output'] ?? []);
            } catch (\Throwable $e) {
                $step->markFailed($e->getMessage(), ['error' => $e->getMessage()]);

                if ($node->is_optional) {
                    $this->putVariable($run, "warnings.{$node->key}", [
                        'node' => $node->key,
                        'message' => $e->getMessage(),
                    ], $step);
                    continue;
                }

                $run->markFailed($e->getMessage(), $context);
                return;
            }
        }

        $context = $this->loadContext($run);
        $summary = [
            'nodes' => $run->steps()->count(),
            'completed' => $run->steps()->where('status', 'completed')->count(),
            'warnings' => count($context['warnings'] ?? []),
            'group_count' => count($context['attack_surface']['grouped_assets']['groups'] ?? []),
        ];
        $run->markCompleted($summary, $context);
    }

    private function executeNode(MetisWorkflowRun $run, MetisWorkflowNode $node, MetisWorkflowRunStep $step): array
    {
        $project = $run->project->fresh(['scope', 'domainEntities', 'hostEntities', 'urlEntities', 'findingEntities', 'intelHits']);
        $override = $run->override;

        return match ($node->type) {
            'input_scope' => $this->executeInputScope($project),
            'passive_dns' => $this->executePassiveDns($run, $project, $step),
            'ct_lookup' => $this->executeCtLookup($run, $project, $step),
            'rdap_whois' => $this->executeRdapWhois($project),
            'github_hints' => $this->executeGithubHints($run, $project, $step),
            'search_engine_recon' => $this->executeSearchRecon($project),
            'dns_enrichment' => $this->executeDnsEnrichment($run, $project, $step),
            'resolve_hosts' => $this->executeResolveHosts($project),
            'live_http_probe' => $this->executeHttpProbe($run, $project, $step, $override),
            'tls_fingerprint' => $this->executeTlsFingerprint($project, $override),
            'ping_check' => $this->executePingCheck($project, $override),
            'port_scan' => $this->executePortScan($run, $project, $step, $override),
            'banner_grab' => $this->executeBannerGrab($project, $override),
            'service_fingerprint' => $this->executeServiceFingerprint($project),
            'directory_discovery' => $this->executeDirectoryDiscovery($run, $project, $step, $override),
            'wayback' => $this->executeWayback($run, $project, $step),
            'cti_exposure' => $this->executeCtiExposure($run, $project, $step),
            'hibp_scan' => $this->executeHibp($run, $project, $step),
            'vuln_assessment' => $this->executeVulnAssessment($run, $project, $step, $override),
            'remediation_validation' => $this->executeRemediationValidation($run, $project, $step, $override),
            'iam_audit' => $this->executeIamAudit($run, $project, $step, $override),
            'custom_script' => $this->executeCustomScript($run, $node),
            'ai_interpretation' => $this->executeAiInterpretation($run, $project),
            'attack_surface_map' => $this->executeAttackSurfaceMap($run, $project),
            'recommendation_engine' => $this->executeRecommendations($project),
            'report_generate' => $this->executeReportGenerate($run, $project),
            'export_json' => $this->executeExportJson($run, $project),
            'export_pdf' => $this->executeExportPdf($run, $project),
            default => [
                'summary' => ['status' => 'skipped'],
                'variables' => [],
                'output' => ['status' => 'unsupported_node_type', 'type' => $node->type],
            ],
        };
    }

    private function executeInputScope(MetisProject $project): array
    {
        return [
            'summary' => [
                'root_domains' => count($project->scope?->root_domains ?? []),
                'verified_domains' => $project->domainVerifications()->where('status', 'verified')->count(),
            ],
            'variables' => [
                'project.root_domains' => $project->scope?->root_domains ?? [],
                'project.known_subdomains' => $project->scope?->known_subdomains ?? [],
                'project.brand_keywords' => $project->scope?->brand_keywords ?? [],
                'project.github_orgs' => $project->scope?->github_orgs ?? [],
                'project.email_domains' => $project->scope?->email_domains ?? [],
                'scope.verified_domains' => $project->domainVerifications()->where('status', 'verified')->pluck('domain')->values()->all(),
                'scope.approved_ip_ranges' => $project->scope?->ip_ranges ?? [],
            ],
            'output' => ['scope' => $project->scope?->toArray()],
        ];
    }

    private function executePassiveDns(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step): array
    {
        $domains = collect([
            ...($project->scope?->root_domains ?? []),
            ...($project->scope?->known_subdomains ?? []),
        ])->map(fn ($value) => strtolower(trim((string) $value)))->filter()->unique()->values();

        $results = [];
        foreach ($domains as $domain) {
            $child = $this->createChildRun($run, 'dns_lookup', ['domain' => $domain]);
            $step->update(['used_job_run_id' => $child->id]);
            $results[$domain] = $this->recon->dnsLookup($child);
        }

        $project->refresh();
        $mapping = $this->attackSurface->normalizeDnsMappings($project);

        return [
            'summary' => ['domains' => $domains->count(), 'dns_records' => count($mapping['records'])],
            'variables' => [
                'dns.records' => $mapping['records'],
                'dns.a_records' => $mapping['a_records'],
                'dns.aaaa_records' => $mapping['aaaa_records'],
                'dns.reverse_map' => $mapping['reverse_map'],
            ],
            'output' => ['domains' => $results, 'mapping' => $mapping],
        ];
    }

    private function executeCtLookup(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step): array
    {
        $results = [];
        $domains = collect($project->scope?->root_domains ?? [])->filter()->values();

        foreach ($domains as $domain) {
            $child = $this->createChildRun($run, 'ct_lookup', ['domain' => $domain]);
            $step->update(['used_job_run_id' => $child->id]);
            $results[$domain] = $this->recon->ctLookup($child);
        }

        $subdomains = $project->fresh()->domainEntities()
            ->where('layer', 'discovery')
            ->pluck('domain')
            ->values()
            ->all();

        return [
            'summary' => ['root_domains' => count($results), 'subdomains' => count($subdomains)],
            'variables' => ['discovery.ct_subdomains' => $subdomains],
            'output' => ['domains' => $results],
        ];
    }

    private function executeRdapWhois(MetisProject $project): array
    {
        $ownership = $project->fresh()->domainEntities()
            ->map(fn ($domain) => [
                'domain' => $domain->domain,
                'ownership' => $domain->ownership_summary_json ?? [],
            ])
            ->values()
            ->all();

        return [
            'summary' => ['domains' => count($ownership)],
            'variables' => ['dns.ownership' => $ownership],
            'output' => ['ownership' => $ownership],
        ];
    }

    private function executeGithubHints(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step): array
    {
        if (($project->scope?->github_orgs ?? []) === []) {
            return ['summary' => ['skipped' => 'no_github_orgs'], 'variables' => [], 'output' => []];
        }

        $child = $this->createChildRun($run, 'github_hints', []);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->intel->githubHints($child);

        return [
            'summary' => ['hints' => $payload['hint_count'] ?? 0],
            'variables' => ['discovery.github_hints' => $payload],
            'output' => $payload,
        ];
    }

    private function executeSearchRecon(MetisProject $project): array
    {
        $payload = $this->searchRecon->runProjectQueries($project);

        return [
            'summary' => ['queries' => count($payload['queries'] ?? []), 'results' => count($payload['results'] ?? [])],
            'variables' => ['discovery.search_urls' => $payload],
            'output' => $payload,
        ];
    }

    private function executeDnsEnrichment(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step): array
    {
        $domains = $project->domainEntities()
            ->get()
            ->filter(fn ($entity) => empty($entity->dns_json))
            ->pluck('domain')
            ->unique()
            ->values();

        $results = [];
        foreach ($domains as $domain) {
            $child = $this->createChildRun($run, 'dns_lookup', ['domain' => $domain]);
            $step->update(['used_job_run_id' => $child->id]);
            $results[$domain] = $this->recon->dnsLookup($child);
        }

        $mapping = $this->attackSurface->normalizeDnsMappings($project->fresh());

        return [
            'summary' => ['domains' => $domains->count()],
            'variables' => ['dns.reverse_map' => $mapping['reverse_map']],
            'output' => ['domains' => $results, 'mapping' => $mapping],
        ];
    }

    private function executeResolveHosts(MetisProject $project): array
    {
        $mapping = $this->attackSurface->normalizeDnsMappings($project);
        $resolvedHosts = $project->fresh()->hostEntities()
            ->map(fn ($host) => [
                'hostname' => $host->hostname,
                'ip' => $host->ip,
                'ips' => $host->ip_addresses_json ?? array_values(array_filter([$host->ip])),
                'provider_hint' => $host->provider_hint,
            ])
            ->values()
            ->all();

        return [
            'summary' => ['hosts' => count($resolvedHosts), 'shared_ips' => count($mapping['reverse_map'])],
            'variables' => [
                'resolved.host_ips' => $resolvedHosts,
                'dns.reverse_map' => $mapping['reverse_map'],
            ],
            'output' => ['hosts' => $resolvedHosts],
        ];
    }

    private function executeHttpProbe(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step, ?MetisEmergencyOverride $override): array
    {
        $hosts = $this->activeTargets($project);
        if ($hosts === []) {
            return ['summary' => ['skipped' => 'no_hosts'], 'variables' => [], 'output' => []];
        }

        $child = $this->createChildRun($run, 'http_probe', ['hosts' => $hosts], $override);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->recon->httpProbe($child, $this->scopeVerifier);

        return [
            'summary' => ['targets' => count($hosts)],
            'variables' => ['host_services.http' => $payload],
            'output' => $payload,
        ];
    }

    private function executeTlsFingerprint(MetisProject $project, ?MetisEmergencyOverride $override): array
    {
        $hosts = $project->fresh()->hostEntities()->where('is_live', true)->pluck('hostname')->values()->all();
        $payload = $this->attackSurface->fingerprintTls($project, $hosts, $this->scopeVerifier, $override);

        return [
            'summary' => ['targets' => count($hosts)],
            'variables' => ['tls.certificates' => $payload],
            'output' => $payload,
        ];
    }

    private function executePingCheck(MetisProject $project, ?MetisEmergencyOverride $override): array
    {
        $hosts = $this->activeTargets($project);
        $payload = $this->attackSurface->pingCheck($project, $hosts, $this->scopeVerifier, $override);

        return [
            'summary' => ['targets' => count($hosts)],
            'variables' => ['network.reachability' => $payload],
            'output' => $payload,
        ];
    }

    private function executePortScan(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step, ?MetisEmergencyOverride $override): array
    {
        $hosts = $project->fresh()->hostEntities()->where('is_live', true)->pluck('hostname')->values()->all();
        if ($hosts === []) {
            $hosts = $this->activeTargets($project);
        }

        if ($hosts === []) {
            return ['summary' => ['skipped' => 'no_hosts'], 'variables' => [], 'output' => []];
        }

        $child = $this->createChildRun($run, 'port_scan', ['hosts' => $hosts], $override);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->recon->portScan($child, $this->scopeVerifier, $this->tools);

        return [
            'summary' => ['targets' => count($hosts)],
            'variables' => ['host_services.ports' => $payload],
            'output' => $payload,
        ];
    }

    private function executeBannerGrab(MetisProject $project, ?MetisEmergencyOverride $override): array
    {
        $hosts = $this->activeTargets($project);
        $payload = $this->attackSurface->bannerGrab($project, $hosts, $this->scopeVerifier, $override);

        return [
            'summary' => ['targets' => count($hosts)],
            'variables' => ['host_services.banners' => $payload],
            'output' => $payload,
        ];
    }

    private function executeServiceFingerprint(MetisProject $project): array
    {
        $project->load('hostEntities');
        $payload = $this->attackSurface->fingerprintServices($project);

        return [
            'summary' => ['hosts' => count($payload)],
            'variables' => ['host_services.fingerprints' => $payload],
            'output' => $payload,
        ];
    }

    private function executeDirectoryDiscovery(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step, ?MetisEmergencyOverride $override): array
    {
        $child = $this->createChildRun($run, 'directory_enum', ['hosts' => $this->activeTargets($project)], $override);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->assessment->directoryDiscovery($child, $this->scopeVerifier);

        return [
            'summary' => ['findings' => $payload['finding_count'] ?? 0],
            'variables' => ['findings.directory' => $payload],
            'output' => $payload,
        ];
    }

    private function executeWayback(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step): array
    {
        $results = [];
        foreach ($project->scope?->root_domains ?? [] as $domain) {
            $child = $this->createChildRun($run, 'wayback', ['domain' => $domain]);
            $step->update(['used_job_run_id' => $child->id]);
            $results[$domain] = $this->recon->waybackFetch($child);
        }

        $urls = $project->fresh()->urlEntities()->orderByDesc('first_seen')->limit(200)->get()->map(fn ($url) => [
            'url' => $url->url,
            'source' => $url->source,
            'historical_only' => $url->historical_only,
        ])->all();

        return [
            'summary' => ['urls' => count($urls)],
            'variables' => ['history.urls' => $urls],
            'output' => ['domains' => $results, 'urls' => $urls],
        ];
    }

    private function executeCtiExposure(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step): array
    {
        $child = $this->createChildRun($run, 'cti_exposure', []);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->intel->ctiExposure($child);

        return [
            'summary' => ['hits' => $payload['hits'] ?? 0],
            'variables' => ['intel.cti' => $payload],
            'output' => $payload,
        ];
    }

    private function executeHibp(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step): array
    {
        $child = $this->createChildRun($run, 'hibp_scan', []);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->intel->hibpScan($child);

        return [
            'summary' => ['domains' => $payload['domains_with_hits'] ?? 0, 'accounts' => $payload['accounts'] ?? 0],
            'variables' => ['intel.hibp' => $payload],
            'output' => $payload,
        ];
    }

    private function executeVulnAssessment(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step, ?MetisEmergencyOverride $override): array
    {
        $child = $this->createChildRun($run, 'vuln_assessment', ['hosts' => $this->activeTargets($project)], $override);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->assessment->vulnAssessment($child, $this->scopeVerifier);

        return [
            'summary' => ['findings' => $payload['findings'] ?? 0],
            'variables' => ['findings.items' => $payload],
            'output' => $payload,
        ];
    }

    private function executeRemediationValidation(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step, ?MetisEmergencyOverride $override): array
    {
        $child = $this->createChildRun($run, 'remediation_validation', ['hosts' => $this->activeTargets($project)], $override);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->assessment->remediationValidation($child, $this->scopeVerifier);

        return [
            'summary' => ['resolved' => count($payload['resolved'] ?? []), 'persisting' => count($payload['persisting'] ?? [])],
            'variables' => ['findings.validation' => $payload],
            'output' => $payload,
        ];
    }

    private function executeIamAudit(MetisWorkflowRun $run, MetisProject $project, MetisWorkflowRunStep $step, ?MetisEmergencyOverride $override): array
    {
        $child = $this->createChildRun($run, 'iam_audit', ['hosts' => $this->activeTargets($project)], $override);
        $step->update(['used_job_run_id' => $child->id]);
        $payload = $this->assessment->iamAudit($child, $this->scopeVerifier);

        return [
            'summary' => ['findings' => $payload['findings'] ?? 0],
            'variables' => ['findings.iam' => $payload],
            'output' => $payload,
        ];
    }

    private function executeCustomScript(MetisWorkflowRun $run, MetisWorkflowNode $node): array
    {
        $templateId = $node->config_json['template_id'] ?? null;
        abort_if(! $templateId, 422, 'Custom script node requires template_id.');

        $template = MetisScriptTemplate::query()->findOrFail($templateId);
        $input = [
            'targets' => collect($this->activeTargets($run->project))->values()->all(),
            'context' => $this->loadContext($run),
        ];
        $scriptRun = $this->scripts->createRun($template, $input, $run->project_id, $run->created_by, $run);
        $payload = $this->scripts->execute($scriptRun);

        return [
            'summary' => ['script_run_id' => $scriptRun->id, 'status' => $scriptRun->status],
            'variables' => ['custom_script.output' => $payload],
            'output' => ['script_run_id' => $scriptRun->id, 'payload' => $payload],
        ];
    }

    private function executeAiInterpretation(MetisWorkflowRun $run, MetisProject $project): array
    {
        $context = $this->loadContext($run);
        $observed = [
            'domains' => $project->domainEntities()->count(),
            'hosts' => $project->hostEntities()->count(),
            'live_hosts' => $project->hostEntities()->where('is_live', true)->count(),
            'findings' => $project->findingEntities()->where('status', 'open')->count(),
            'infra_groups' => $project->infraGroups()->count(),
        ];

        $payload = $this->ai->groundedInterpretation(
            title: 'Workflow Interpretation',
            observed: $observed,
            inferred: ['provider_hints' => $project->hostEntities()->whereNotNull('provider_hint')->pluck('provider_hint')->unique()->values()->all()],
            recommended: $this->attackSurface->recommendationSet($project)
        );

        return [
            'summary' => ['provider' => $payload['meta']['provider'] ?? null, 'model' => $payload['meta']['model'] ?? null],
            'variables' => ['ai.executive_brief' => $payload],
            'output' => $payload,
        ];
    }

    private function executeAttackSurfaceMap(MetisWorkflowRun $run, MetisProject $project): array
    {
        $payload = $this->attackSurface->buildInfrastructureGroups($project, $run);

        return [
            'summary' => ['groups' => $payload['group_count'] ?? 0],
            'variables' => ['attack_surface.grouped_assets' => $payload],
            'output' => $payload,
        ];
    }

    private function executeRecommendations(MetisProject $project): array
    {
        $payload = $this->attackSurface->recommendationSet($project);

        return [
            'summary' => ['items' => count($payload)],
            'variables' => ['recommendations.items' => $payload],
            'output' => ['recommendations' => $payload],
        ];
    }

    private function executeReportGenerate(MetisWorkflowRun $run, MetisProject $project): array
    {
        $template = MetisReportTemplate::query()->where('slug', 'metis-technical-recon')->first();
        $payload = $this->reports->buildTemplateReport($project, $template?->slug ?? 'metis-technical-recon', [
            'strict_evidence' => true,
            'workflow_run_id' => $run->id,
        ]);

        return [
            'summary' => ['sections' => count($payload['sections'] ?? [])],
            'variables' => ['report.sections' => $payload['sections'] ?? []],
            'output' => $payload,
        ];
    }

    private function executeExportJson(MetisWorkflowRun $run, MetisProject $project): array
    {
        $payload = $this->reports->buildTemplateReport($project, 'metis-technical-recon', [
            'strict_evidence' => true,
            'workflow_run_id' => $run->id,
        ]);
        $path = "metis/reports/project-{$project->id}/workflow-{$run->id}.json";
        Storage::disk('local')->put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return [
            'summary' => ['artifact' => $path],
            'variables' => ['report.json_artifact' => ['path' => $path]],
            'output' => ['path' => $path],
        ];
    }

    private function executeExportPdf(MetisWorkflowRun $run, MetisProject $project): array
    {
        $pdf = $this->reports->generatePdf($project);
        $path = "metis/reports/project-{$project->id}/workflow-{$run->id}.pdf";
        Storage::disk('local')->put($path, $pdf);

        return [
            'summary' => ['artifact' => $path],
            'variables' => ['report.pdf_artifact' => ['path' => $path]],
            'output' => ['path' => $path],
        ];
    }

    private function seedScopeVariables(MetisWorkflowRun $run): void
    {
        if ($run->variables()->exists()) {
            return;
        }

        $project = $run->project()->with('scope', 'domainVerifications')->first();
        $this->putVariable($run, 'workflow.input', $run->input_json ?? []);
        $this->putVariable($run, 'project.root_domains', $project->scope?->root_domains ?? []);
        $this->putVariable($run, 'scope.verified_domains', $project->domainVerifications()->where('status', 'verified')->pluck('domain')->values()->all());
        $this->putVariable($run, 'scope.approved_ip_ranges', $project->scope?->ip_ranges ?? []);
    }

    private function createChildRun(MetisWorkflowRun $workflowRun, string $type, array $params, ?MetisEmergencyOverride $override = null): MetisJobRun
    {
        return MetisJobRun::query()->create([
            'project_id' => $workflowRun->project_id,
            'created_by' => $workflowRun->created_by,
            'override_id' => $override?->id ?? $workflowRun->override_id,
            'type' => $type,
            'params_json' => array_filter([
                ...$params,
                'override_id' => $override?->id ?? $workflowRun->override_id,
            ], fn ($value) => $value !== null && $value !== []),
            'status' => 'queued',
        ]);
    }

    private function activeTargets(MetisProject $project): array
    {
        $targets = $project->hostEntities()
            ->pluck('hostname')
            ->merge($project->domainEntities()->pluck('domain'))
            ->filter()
            ->unique()
            ->values()
            ->all();

        return array_values(array_unique(array_map('strtolower', $targets)));
    }

    private function putVariable(MetisWorkflowRun $run, string $key, mixed $value, ?MetisWorkflowRunStep $step = null): void
    {
        $variable = MetisWorkflowVariable::query()->updateOrCreate(
            [
                'workflow_run_id' => $run->id,
                'key' => $key,
            ],
            [
                'source_step_id' => $step?->id,
                'value_type' => is_array($value) ? 'json' : gettype($value),
                'value_json' => is_array($value) ? $value : ['value' => $value],
            ]
        );

        $context = $run->loadContext() ?? [];
        data_set($context, $key, $variable->value_json);
        $run->storeContext($context);
    }

    private function loadContext(MetisWorkflowRun $run): array
    {
        return $run->loadContext() ?? [];
    }

    private function shouldSkipNode(MetisWorkflowRun $run, MetisWorkflowNode $node): bool
    {
        if (! $node->is_optional) {
            return false;
        }

        $input = $run->input_json ?? [];

        $explicitSkipNodes = collect($input['skip_nodes'] ?? [])
            ->map(fn ($value) => strtolower(trim((string) $value)))
            ->filter()
            ->values()
            ->all();

        if (in_array(strtolower($node->key), $explicitSkipNodes, true)) {
            return true;
        }

        $optionalNodes = $input['optional_nodes'] ?? [];
        if (array_key_exists($node->key, $optionalNodes)) {
            return ! (bool) $optionalNodes[$node->key];
        }

        return false;
    }

    private function resolveResumeSource(MetisWorkflowRun $run): ?MetisWorkflowRun
    {
        $resumeFromRunId = (int) ($run->input_json['resume_from_run_id'] ?? 0);
        if ($resumeFromRunId <= 0 || $resumeFromRunId === $run->id) {
            return null;
        }

        $source = MetisWorkflowRun::query()
            ->with(['steps.workflowNode'])
            ->find($resumeFromRunId);

        if (! $source || $source->project_id !== $run->project_id || $source->workflow_id !== $run->workflow_id) {
            return null;
        }

        $context = $source->loadContext();
        if (! is_array($context) || $source->status !== 'completed') {
            return null;
        }

        $this->putVariable($run, 'workflow.resumed_from_run_id', $source->id);

        return $source;
    }

    private function reuseCompletedNode(MetisWorkflowRun $run, MetisWorkflowRun $source, MetisWorkflowNode $node, MetisWorkflowRunStep $step): bool
    {
        $sourceStep = $source->steps->firstWhere('key', $node->key);
        if (! $sourceStep || $sourceStep->status !== 'completed') {
            return false;
        }

        $rerunNodes = collect($run->input_json['rerun_nodes'] ?? [])
            ->map(fn ($value) => strtolower(trim((string) $value)))
            ->filter()
            ->values()
            ->all();

        if (in_array(strtolower($node->key), $rerunNodes, true)) {
            return false;
        }

        $sourceContext = $source->loadContext() ?? [];
        foreach (($node->config_json['output_keys'] ?? []) as $key) {
            $value = data_get($sourceContext, $key);
            if ($value !== null) {
                $this->putVariable($run, $key, $value, $step);
            }
        }

        $step->markCompleted(
            [
                'status' => 'resumed',
                'from_run_id' => $source->id,
            ],
            [
                'status' => 'resumed',
                'from_run_id' => $source->id,
                'source_summary' => $sourceStep->summary_json,
                'source_output' => $sourceStep->loadOutput(),
            ]
        );

        return true;
    }
}

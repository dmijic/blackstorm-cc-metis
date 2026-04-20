<?php

namespace App\Services\Metis;

use App\Models\MetisEmergencyOverride;
use App\Models\MetisProject;
use App\Models\MetisReportTemplate;
use Illuminate\Support\Str;

class ReportService
{
    public function __construct(
        private readonly AiService $aiService,
    ) {}

    public function generateJson(MetisProject $project, array $options = []): array
    {
        $project->load([
            'scope',
            'domainVerifications',
            'domainEntities',
            'hostEntities',
            'urlEntities',
            'findingEntities',
            'jobRuns.override',
            'intelHits',
            'infraGroups.assets',
        ]);

        $latestOverride = $project->jobRuns
            ->pluck('override')
            ->filter()
            ->sortByDesc('created_at')
            ->first();

        return [
            'meta' => [
                'generated_at' => now()->toIso8601String(),
                'project' => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'client' => $project->client,
                    'description' => $project->description,
                    'status' => $project->status,
                ],
                'strict_evidence' => (bool) ($options['strict_evidence'] ?? false),
                'workflow_run_id' => $options['workflow_run_id'] ?? null,
                'override' => $this->overrideMeta($latestOverride),
            ],
            'scope' => [
                'root_domains' => $project->scope?->root_domains ?? [],
                'brand_keywords' => $project->scope?->brand_keywords ?? [],
                'known_subdomains' => $project->scope?->known_subdomains ?? [],
                'ip_ranges' => $project->scope?->ip_ranges ?? [],
                'github_orgs' => $project->scope?->github_orgs ?? [],
                'email_domains' => $project->scope?->email_domains ?? [],
                'verified_domains' => $project->domainVerifications
                    ->where('status', 'verified')
                    ->pluck('domain')
                    ->values()
                    ->all(),
            ],
            'surface_map' => [
                'domains' => $project->domainEntities->map(fn ($d) => [
                    'domain' => $d->domain,
                    'verified' => $d->verified,
                    'layer' => $d->layer,
                    'dns' => $d->dns_json,
                    'dns_summary' => $d->dns_summary_json,
                    'ownership' => $d->ownership_summary_json,
                    'related_ips' => $d->related_ips_json,
                    'provider_hint' => $d->provider_hint,
                    'classification' => $d->classification,
                    'ct' => $d->ct_sources_json,
                ])->values()->all(),
                'hosts' => $project->hostEntities->map(fn ($h) => [
                    'hostname' => $h->hostname,
                    'ip' => $h->ip,
                    'ip_addresses' => $h->ip_addresses_json,
                    'is_live' => $h->is_live,
                    'status' => $h->http_status,
                    'http' => $h->http_json,
                    'title' => $h->http_json['title'] ?? null,
                    'server' => $h->http_json['server'] ?? null,
                    'ports' => $h->open_ports,
                    'service' => $h->service_json,
                    'tls' => $h->tls_json,
                    'banner' => $h->banner_json,
                    'network' => $h->network_json,
                    'provider_hint' => $h->provider_hint,
                    'classification' => $h->classification,
                ])->values()->all(),
                'urls_count' => $project->urlEntities()->count(),
            ],
            'infra_groups' => $project->infraGroups->map(fn ($group) => [
                'id' => $group->id,
                'type' => $group->type,
                'name' => $group->name,
                'summary' => $group->summary,
                'fingerprint' => $group->fingerprint,
                'asset_count' => $group->asset_count,
                'metadata' => $group->metadata_json,
                'assets' => $group->assets->map(fn ($asset) => [
                    'entity_type' => $asset->entity_type,
                    'entity_id' => $asset->entity_id,
                    'asset_key' => $asset->asset_key,
                    'label' => $asset->label,
                    'metadata' => $asset->metadata_json,
                ])->values()->all(),
            ])->values()->all(),
            'findings' => $project->findingEntities->map(fn ($f) => [
                'id' => $f->id,
                'type' => $f->type,
                'severity' => $f->severity,
                'title' => $f->title,
                'summary' => $f->summary,
                'confidence' => $f->confidence,
                'status' => $f->status,
                'evidence' => $f->evidence_json,
            ])->values()->all(),
            'intel_hits' => $project->intelHits->map(fn ($hit) => [
                'id' => $hit->id,
                'provider_type' => $hit->provider_type,
                'hit_type' => $hit->hit_type,
                'severity' => $hit->severity,
                'title' => $hit->title,
                'summary' => $hit->summary,
                'matched_keyword' => $hit->matched_keyword,
                'source_url' => $hit->source_url,
                'discovered_at' => $hit->discovered_at?->toIso8601String(),
            ])->values()->all(),
            'statistics' => [
                'total_domains' => $project->domainEntities()->count(),
                'verified_domains' => $project->domainEntities()->where('verified', true)->count(),
                'live_hosts' => $project->hostEntities()->where('is_live', true)->count(),
                'total_urls' => $project->urlEntities()->count(),
                'open_findings' => $project->findingEntities()->where('status', 'open')->count(),
                'critical_findings' => $project->findingEntities()->where('severity', 'critical')->count(),
                'high_findings' => $project->findingEntities()->where('severity', 'high')->count(),
                'intel_hits' => $project->intelHits()->count(),
                'infra_groups' => $project->infraGroups()->count(),
            ],
            'job_runs' => $project->jobRuns->map(fn ($j) => [
                'id' => $j->id,
                'type' => $j->type,
                'status' => $j->status,
                'summary' => $j->summary_json,
                'started' => $j->started_at?->toIso8601String(),
                'finished' => $j->finished_at?->toIso8601String(),
                'override_id' => $j->override_id,
            ])->values()->all(),
        ];
    }

    public function buildTemplateReport(MetisProject $project, string $templateSlug, array $options = []): array
    {
        $template = MetisReportTemplate::query()->where('slug', $templateSlug)->first();
        $data = $this->generateJson($project, $options);
        $stats = $data['statistics'];
        $strictEvidence = (bool) ($options['strict_evidence'] ?? false);

        $assetInventory = [
            'domains' => $stats['total_domains'],
            'verified_domains' => $stats['verified_domains'],
            'live_hosts' => $stats['live_hosts'],
            'historical_urls' => $stats['total_urls'],
        ];

        $observedSummary = [
            'asset_inventory' => $assetInventory,
            'infra_groups' => $stats['infra_groups'],
            'findings' => $stats['open_findings'],
            'intel_hits' => $stats['intel_hits'],
        ];

        $inferredSummary = [
            'provider_hints' => collect($data['surface_map']['hosts'])
                ->pluck('provider_hint')
                ->filter()
                ->unique()
                ->values()
                ->all(),
            'shared_certificate_groups' => collect($data['infra_groups'])
                ->where('type', 'shared_certificate')
                ->count(),
            'shared_ip_groups' => collect($data['infra_groups'])
                ->where('type', 'shared_ip')
                ->count(),
        ];

        $recommendedSummary = [
            'recommended_next_steps' => $this->recommendedNextSteps($data),
        ];

        $narrative = ($options['ai_assist'] ?? false) && ! $strictEvidence
            ? $this->aiService->groundedInterpretation(
                $template?->name ?? Str::headline(str_replace('-', ' ', $templateSlug)),
                $observedSummary,
                $inferredSummary,
                $recommendedSummary,
                ['mode' => 'report_draft']
            )
            : [
                'content' => $this->deterministicNarrative($observedSummary, $inferredSummary, $recommendedSummary),
                'meta' => ['provider' => null, 'model' => null, 'grounded' => true, 'mode' => 'deterministic'],
            ];

        $sections = [
            $this->section('cover', 'Cover', 'observed', [
                'report_title' => $template?->name ?? 'Metis Technical Recon Report',
                'project' => $data['meta']['project'],
                'generated_at' => $data['meta']['generated_at'],
            ]),
            $this->section('scope_authorization', 'Scope & Authorization', 'observed', [
                'scope' => $data['scope'],
                'override' => $data['meta']['override'],
            ]),
            $this->section('methodology', 'Methodology', 'observed', [
                'passive' => ['dns discovery', 'certificate transparency', 'rdap/whois', 'search recon', 'github public hints', 'wayback'],
                'active' => ['http probing', 'tls fingerprinting', 'port scanning', 'service fingerprinting', 'directory discovery', 'safe validation'],
                'strict_evidence' => $strictEvidence,
            ]),
            $this->section('data_sources', 'Data Sources', 'observed', [
                'providers' => collect($data['intel_hits'])->pluck('provider_type')->unique()->values()->all(),
                'job_types' => collect($data['job_runs'])->pluck('type')->unique()->values()->all(),
            ]),
            $this->section('asset_inventory', 'Asset Inventory', 'observed', $assetInventory),
            $this->section('dns_ownership', 'DNS & Ownership Summary', 'observed', [
                'domains' => collect($data['surface_map']['domains'])->map(fn ($domain) => [
                    'domain' => $domain['domain'],
                    'dns_summary' => $domain['dns_summary'],
                    'ownership' => $domain['ownership'],
                    'related_ips' => $domain['related_ips'],
                ])->values()->all(),
            ]),
            $this->section('infrastructure_grouping', 'Infrastructure Grouping', 'observed', [
                'groups' => $data['infra_groups'],
            ]),
            $this->section('exposure_summary', 'Exposure Summary', 'observed', [
                'hosts' => collect($data['surface_map']['hosts'])->map(fn ($host) => [
                    'hostname' => $host['hostname'],
                    'classification' => $host['classification'],
                    'ports' => $host['ports'],
                    'provider_hint' => $host['provider_hint'],
                ])->values()->all(),
                'intel_hits' => $data['intel_hits'],
            ]),
            $this->section('findings', 'Findings', 'observed', $data['findings']),
            $this->section('historical_surface', 'Historical Surface', 'observed', [
                'urls' => collect($project->urlEntities()->where('historical_only', true)->latest('first_seen')->limit(150)->get())
                    ->map(fn ($url) => [
                        'url' => $url->url,
                        'first_seen' => $url->first_seen?->toIso8601String(),
                        'status_code' => $url->status_code,
                    ])
                    ->values()
                    ->all(),
            ]),
            $this->section('change_analysis', 'Change Analysis', 'inferred', $inferredSummary),
            $this->section('recommendations', 'Recommendations', 'recommended', $recommendedSummary),
            $this->section('appendix', 'Appendix / Raw Sources / Audit Trail', 'observed', [
                'job_runs' => $data['job_runs'],
                'narrative' => $narrative,
            ]),
        ];

        return [
            'meta' => [
                ...$data['meta'],
                'template' => [
                    'slug' => $template?->slug ?? $templateSlug,
                    'name' => $template?->name ?? Str::headline(str_replace('-', ' ', $templateSlug)),
                    'description' => $template?->description,
                ],
                'evidence_mode' => $strictEvidence ? 'strictly_evidence_based' : 'assisted',
            ],
            'narrative' => $narrative,
            'sections' => $sections,
            'exports' => [
                'json' => "/api/metis/projects/{$project->id}/report/json?template={$templateSlug}",
                'html' => "/api/metis/projects/{$project->id}/report/html?template={$templateSlug}",
                'pdf' => "/api/metis/projects/{$project->id}/report/pdf?template={$templateSlug}",
            ],
        ];
    }

    public function generateHtml(MetisProject $project, ?string $aiSummary = null, array $options = []): string
    {
        $templateSlug = $options['template'] ?? 'metis-technical-recon';
        $payload = $this->buildTemplateReport($project, $templateSlug, $options);
        $stats = $this->generateJson($project, $options)['statistics'];

        $findingsHtml = '';
        foreach ($this->generateJson($project, $options)['findings'] as $finding) {
            $severityClass = match ($finding['severity']) {
                'critical' => '#ff4444',
                'high' => '#ff8800',
                'medium' => '#ffcc00',
                'low' => '#44aaff',
                default => '#888',
            };

            $findingsHtml .= "<tr>
                <td>".htmlspecialchars((string) $finding['id'])."</td>
                <td><span style='color:{$severityClass};font-weight:bold;'>".htmlspecialchars((string) $finding['severity'])."</span></td>
                <td>".htmlspecialchars((string) $finding['title'])."</td>
                <td>".htmlspecialchars((string) $finding['type'])."</td>
                <td>".htmlspecialchars((string) $finding['status'])."</td>
            </tr>";
        }

        $narrative = $aiSummary ?: ($payload['narrative']['content'] ?? null);
        $sectionHtml = collect($payload['sections'])->map(function (array $section) {
            return "<div class='section'>
                <h2>".htmlspecialchars($section['title'])."</h2>
                <pre>".htmlspecialchars(json_encode($section['content'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES))."</pre>
            </div>";
        })->implode('');

        $aiSection = $narrative
            ? "<div class='section'><h2>Executive Brief</h2><div class='ai-summary'>".nl2br(htmlspecialchars($narrative))."</div></div>"
            : '';

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Metis Report – {$project->name}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 32px; }
  h1 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 12px; }
  h2 { color: #79c0ff; margin-top: 0; }
  .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; margin-bottom: 24px; overflow: hidden; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .stat-card { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 16px; text-align: center; }
  .stat-value { font-size: 2em; font-weight: bold; color: #58a6ff; }
  .stat-label { font-size: 0.85em; color: #8b949e; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #21262d; color: #8b949e; padding: 8px 12px; text-align: left; font-size: 0.85em; text-transform: uppercase; }
  td { padding: 8px 12px; border-bottom: 1px solid #21262d; font-size: 0.9em; }
  .ai-summary { background: #0d1117; border-left: 3px solid #58a6ff; padding: 16px; border-radius: 4px; line-height: 1.6; }
  .meta { color: #8b949e; font-size: 0.85em; margin-bottom: 24px; }
  pre { white-space: pre-wrap; word-break: break-word; background: #0d1117; padding: 16px; border-radius: 6px; border: 1px solid #21262d; }
</style>
</head>
<body>
<h1>Metis Security Report</h1>
<div class="meta">
  Template: {$this->escape($payload['meta']['template']['name'] ?? 'Metis Technical Recon Report')} |
  Project: <strong style="color:#c9d1d9">{$this->escape($project->name)}</strong> |
  Client: {$this->escape($project->client ?: '-')} |
  Generated: {$this->escape($payload['meta']['generated_at'])}
</div>
{$aiSection}
<div class="section">
  <h2>Attack Surface Statistics</h2>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-value">{$stats['total_domains']}</div><div class="stat-label">Total Domains</div></div>
    <div class="stat-card"><div class="stat-value">{$stats['live_hosts']}</div><div class="stat-label">Live Hosts</div></div>
    <div class="stat-card"><div class="stat-value">{$stats['total_urls']}</div><div class="stat-label">Historical URLs</div></div>
    <div class="stat-card"><div class="stat-value">{$stats['infra_groups']}</div><div class="stat-label">Infra Groups</div></div>
  </div>
</div>
<div class="section">
  <h2>Findings</h2>
  <table>
    <thead><tr><th>#</th><th>Severity</th><th>Title</th><th>Type</th><th>Status</th></tr></thead>
    <tbody>{$findingsHtml}</tbody>
  </table>
</div>
{$sectionHtml}
</body>
</html>
HTML;
    }

    public function generatePdf(MetisProject $project, ?string $aiSummary = null, array $options = []): string
    {
        $templateSlug = $options['template'] ?? 'metis-technical-recon';
        $payload = $this->buildTemplateReport($project, $templateSlug, $options);

        $pdf = new \FPDF();
        $pdf->SetTitle($this->pdfText(($payload['meta']['template']['name'] ?? 'Metis Report').' - '.$project->name));
        $pdf->SetAuthor('Metis Command Center');
        $pdf->SetAutoPageBreak(true, 15);
        $pdf->AddPage();

        $pdf->SetFont('Arial', 'B', 18);
        $pdf->Cell(0, 10, $this->pdfText($payload['meta']['template']['name'] ?? 'Metis Security Report'), 0, 1);

        $pdf->SetFont('Arial', '', 11);
        $pdf->MultiCell(0, 6, $this->pdfText(sprintf(
            "Project: %s\nClient: %s\nGenerated: %s",
            $project->name,
            $project->client ?: '-',
            $payload['meta']['generated_at']
        )));
        $pdf->Ln(2);

        $brief = $aiSummary ?: ($payload['narrative']['content'] ?? null);
        if ($brief) {
            $pdf->SetFont('Arial', 'B', 13);
            $pdf->Cell(0, 8, $this->pdfText('Executive Brief'), 0, 1);
            $pdf->SetFont('Arial', '', 10);
            $pdf->MultiCell(0, 5, $this->pdfText($brief));
            $pdf->Ln(2);
        }

        foreach ($payload['sections'] as $section) {
            $pdf->SetFont('Arial', 'B', 13);
            $pdf->Cell(0, 8, $this->pdfText($section['title']), 0, 1);
            $pdf->SetFont('Arial', '', 10);
            $pdf->MultiCell(0, 5, $this->pdfText(json_encode($section['content'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)));
            $pdf->Ln(2);
        }

        return $pdf->Output('S');
    }

    private function recommendedNextSteps(array $data): array
    {
        $steps = [];

        if (collect($data['surface_map']['domains'])->contains(fn ($domain) => ! empty($domain['dns_summary']['mx_hosts'] ?? []))) {
            $steps[] = 'Found MX/email infrastructure, so HIBP domain exposure review is available.';
        }

        if (collect($data['surface_map']['hosts'])->contains(fn ($host) => ($host['classification'] ?? null) === 'admin/login')) {
            $steps[] = 'Admin/login surfaces were observed and should be reviewed with safe validation.';
        }

        if (collect($data['infra_groups'])->where('type', 'shared_ip')->isNotEmpty()) {
            $steps[] = 'Multiple assets share the same IP and should be reviewed as a grouped infrastructure cluster.';
        }

        if (collect($data['infra_groups'])->where('type', 'shared_certificate')->isNotEmpty()) {
            $steps[] = 'Certificate reuse suggests related assets and should be reviewed for shared ownership and blast radius.';
        }

        if (collect($data['surface_map']['hosts'])->contains(fn ($host) => ! empty($host['ports'] ?? []))) {
            $steps[] = 'Observed exposed services can be followed by safe vulnerability assessment and remediation validation.';
        }

        return $steps;
    }

    private function deterministicNarrative(array $observed, array $inferred, array $recommended): string
    {
        return implode("\n", [
            'Observed',
            json_encode($observed, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            '',
            'Inferred',
            json_encode($inferred, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            '',
            'Recommended',
            json_encode($recommended, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        ]);
    }

    private function section(string $key, string $title, string $classification, mixed $content): array
    {
        return [
            'key' => $key,
            'title' => $title,
            'classification' => $classification,
            'content' => $content,
        ];
    }

    private function overrideMeta(?MetisEmergencyOverride $override): ?array
    {
        if (! $override) {
            return null;
        }

        return [
            'id' => $override->id,
            'run_type' => $override->run_type,
            'reason' => $override->reason,
            'target_summary' => $override->target_summary,
            'used_at' => $override->used_at?->toIso8601String(),
            'status' => $override->status,
        ];
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private function pdfText(string $value): string
    {
        return iconv('UTF-8', 'windows-1252//TRANSLIT', $value) ?: $value;
    }
}

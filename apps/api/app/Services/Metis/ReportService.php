<?php

namespace App\Services\Metis;

use App\Models\MetisProject;

class ReportService
{
    public function generateJson(MetisProject $project): array
    {
        $project->load(['scope', 'domainEntities', 'hostEntities', 'urlEntities', 'findingEntities', 'jobRuns', 'intelHits']);

        return [
            'meta' => [
                'generated_at' => now()->toIso8601String(),
                'project'      => [
                    'id'          => $project->id,
                    'name'        => $project->name,
                    'client'      => $project->client,
                    'description' => $project->description,
                    'status'      => $project->status,
                ],
            ],
            'scope' => [
                'root_domains'    => $project->scope?->root_domains ?? [],
                'brand_keywords'  => $project->scope?->brand_keywords ?? [],
                'known_subdomains'=> $project->scope?->known_subdomains ?? [],
                'ip_ranges'       => $project->scope?->ip_ranges ?? [],
                'github_orgs'     => $project->scope?->github_orgs ?? [],
                'email_domains'   => $project->scope?->email_domains ?? [],
            ],
            'surface_map' => [
                'domains' => $project->domainEntities->map(fn($d) => [
                    'domain'   => $d->domain,
                    'verified' => $d->verified,
                    'layer'    => $d->layer,
                    'dns'      => $d->dns_json,
                    'ct'       => $d->ct_sources_json,
                ]),
                'hosts' => $project->hostEntities->map(fn($h) => [
                    'hostname' => $h->hostname,
                    'ip'       => $h->ip,
                    'is_live'  => $h->is_live,
                    'status'   => $h->http_status,
                    'title'    => $h->http_json['title'] ?? null,
                    'server'   => $h->http_json['server'] ?? null,
                    'ports'    => $h->open_ports,
                ]),
                'urls_count' => $project->urlEntities()->count(),
            ],
            'findings' => $project->findingEntities->map(fn($f) => [
                'id'         => $f->id,
                'type'       => $f->type,
                'severity'   => $f->severity,
                'title'      => $f->title,
                'summary'    => $f->summary,
                'confidence' => $f->confidence,
                'status'     => $f->status,
            ]),
            'intel_hits' => $project->intelHits->map(fn($hit) => [
                'id' => $hit->id,
                'provider_type' => $hit->provider_type,
                'hit_type' => $hit->hit_type,
                'severity' => $hit->severity,
                'title' => $hit->title,
                'summary' => $hit->summary,
                'matched_keyword' => $hit->matched_keyword,
                'source_url' => $hit->source_url,
                'discovered_at' => $hit->discovered_at?->toIso8601String(),
            ]),
            'statistics' => [
                'total_domains'   => $project->domainEntities()->count(),
                'live_hosts'      => $project->hostEntities()->where('is_live', true)->count(),
                'total_urls'      => $project->urlEntities()->count(),
                'open_findings'   => $project->findingEntities()->where('status', 'open')->count(),
                'critical_findings'=> $project->findingEntities()->where('severity', 'critical')->count(),
                'high_findings'   => $project->findingEntities()->where('severity', 'high')->count(),
                'intel_hits'      => $project->intelHits()->count(),
            ],
            'job_runs' => $project->jobRuns->map(fn($j) => [
                'id'       => $j->id,
                'type'     => $j->type,
                'status'   => $j->status,
                'summary'  => $j->summary_json,
                'started'  => $j->started_at?->toIso8601String(),
                'finished' => $j->finished_at?->toIso8601String(),
            ]),
        ];
    }

    public function generateHtml(MetisProject $project, ?string $aiSummary = null): string
    {
        $data     = $this->generateJson($project);
        $stats    = $data['statistics'];
        $now      = now()->format('Y-m-d H:i:s') . ' UTC';
        $findings = $data['findings'];
        $intelHits = $data['intel_hits'];
        $scopeRootDomains = htmlspecialchars(implode(', ', $data['scope']['root_domains']));
        $scopeIpRanges = htmlspecialchars(implode(', ', $data['scope']['ip_ranges']));
        $scopeGithubOrgs = htmlspecialchars(implode(', ', $data['scope']['github_orgs']));

        $findingsHtml = '';
        foreach ($findings as $f) {
            $severityClass = match($f['severity']) {
                'critical' => '#ff4444',
                'high'     => '#ff8800',
                'medium'   => '#ffcc00',
                'low'      => '#44aaff',
                default    => '#888',
            };
            $findingsHtml .= "<tr>
                <td>{$f['id']}</td>
                <td><span style='color:{$severityClass};font-weight:bold;'>{$f['severity']}</span></td>
                <td>" . htmlspecialchars($f['title']) . "</td>
                <td>{$f['type']}</td>
                <td>{$f['status']}</td>
            </tr>";
        }

        $intelHtml = '';
        foreach ($intelHits as $hit) {
            $intelHtml .= "<tr>
                <td>" . htmlspecialchars($hit['provider_type']) . "</td>
                <td>" . htmlspecialchars($hit['hit_type']) . "</td>
                <td>" . htmlspecialchars($hit['severity']) . "</td>
                <td>" . htmlspecialchars($hit['title']) . "</td>
            </tr>";
        }

        $aiSection = $aiSummary
            ? "<div class='section'><h2>AI Executive Brief</h2><div class='ai-summary'>" . nl2br(htmlspecialchars($aiSummary)) . "</div></div>"
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
  h2 { color: #79c0ff; margin-top: 32px; }
  .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .stat-card { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 16px; text-align: center; }
  .stat-value { font-size: 2em; font-weight: bold; color: #58a6ff; }
  .stat-label { font-size: 0.85em; color: #8b949e; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #21262d; color: #8b949e; padding: 8px 12px; text-align: left; font-size: 0.85em; text-transform: uppercase; }
  td { padding: 8px 12px; border-bottom: 1px solid #21262d; font-size: 0.9em; }
  tr:last-child td { border-bottom: none; }
  .ai-summary { background: #0d1117; border-left: 3px solid #58a6ff; padding: 16px; border-radius: 4px; line-height: 1.6; }
  .meta { color: #8b949e; font-size: 0.85em; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; }
</style>
</head>
<body>
<h1>Metis Security Report</h1>
<div class="meta">
  Project: <strong style="color:#c9d1d9">{$project->name}</strong> |
  Client: {$project->client} |
  Generated: {$now}
</div>

{$aiSection}

<div class="section">
  <h2>Attack Surface Statistics</h2>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-value">{$stats['total_domains']}</div><div class="stat-label">Total Domains</div></div>
    <div class="stat-card"><div class="stat-value">{$stats['live_hosts']}</div><div class="stat-label">Live Hosts</div></div>
    <div class="stat-card"><div class="stat-value">{$stats['total_urls']}</div><div class="stat-label">Historical URLs</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#ff4444">{$stats['critical_findings']}</div><div class="stat-label">Critical Findings</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#ff8800">{$stats['high_findings']}</div><div class="stat-label">High Findings</div></div>
    <div class="stat-card"><div class="stat-value">{$stats['intel_hits']}</div><div class="stat-label">Intel Hits</div></div>
  </div>
</div>

<div class="section">
  <h2>Findings</h2>
  <table>
    <thead><tr><th>#</th><th>Severity</th><th>Title</th><th>Type</th><th>Status</th></tr></thead>
    <tbody>{$findingsHtml}</tbody>
  </table>
</div>

<div class="section">
  <h2>Scope</h2>
  <p><strong>Root Domains:</strong> {$scopeRootDomains}</p>
  <p><strong>IP Ranges:</strong> {$scopeIpRanges}</p>
  <p><strong>GitHub Orgs:</strong> {$scopeGithubOrgs}</p>
</div>

<div class="section">
  <h2>Threat Intel</h2>
  <table>
    <thead><tr><th>Provider</th><th>Type</th><th>Severity</th><th>Title</th></tr></thead>
    <tbody>{$intelHtml}</tbody>
  </table>
</div>

<footer style="margin-top:48px; text-align:center; color:#484f58; font-size:0.8em;">
  Generated by Metis Command Center · Blackstorm · Authorized Security Assessment Only
</footer>
</body>
</html>
HTML;
    }

    public function generatePdf(MetisProject $project, ?string $aiSummary = null): string
    {
        $data = $this->generateJson($project);
        $pdf = new \FPDF();
        $pdf->SetTitle($this->pdfText('Metis Report - '.$project->name));
        $pdf->SetAuthor('Metis Command Center');
        $pdf->SetAutoPageBreak(true, 15);
        $pdf->AddPage();

        $pdf->SetFont('Arial', 'B', 18);
        $pdf->Cell(0, 10, $this->pdfText('Metis Security Report'), 0, 1);

        $pdf->SetFont('Arial', '', 11);
        $pdf->MultiCell(0, 6, $this->pdfText(sprintf(
            "Project: %s\nClient: %s\nGenerated: %s",
            $project->name,
            $project->client ?: '-',
            now()->toIso8601String()
        )));
        $pdf->Ln(2);

        if ($aiSummary) {
            $pdf->SetFont('Arial', 'B', 13);
            $pdf->Cell(0, 8, $this->pdfText('AI Executive Brief'), 0, 1);
            $pdf->SetFont('Arial', '', 10);
            $pdf->MultiCell(0, 5, $this->pdfText($aiSummary));
            $pdf->Ln(2);
        }

        $pdf->SetFont('Arial', 'B', 13);
        $pdf->Cell(0, 8, $this->pdfText('Statistics'), 0, 1);
        $pdf->SetFont('Arial', '', 10);
        foreach ($data['statistics'] as $label => $value) {
            $pdf->Cell(70, 6, $this->pdfText(ucwords(str_replace('_', ' ', $label))), 0, 0);
            $pdf->Cell(0, 6, $this->pdfText((string) $value), 0, 1);
        }
        $pdf->Ln(2);

        $pdf->SetFont('Arial', 'B', 13);
        $pdf->Cell(0, 8, $this->pdfText('Scope'), 0, 1);
        $pdf->SetFont('Arial', '', 10);
        foreach (['root_domains', 'ip_ranges', 'github_orgs', 'email_domains'] as $key) {
            $value = implode(', ', $data['scope'][$key] ?? []);
            $pdf->MultiCell(0, 5, $this->pdfText(ucwords(str_replace('_', ' ', $key)).': '.($value ?: '-')));
        }
        $pdf->Ln(2);

        $pdf->SetFont('Arial', 'B', 13);
        $pdf->Cell(0, 8, $this->pdfText('Findings'), 0, 1);
        $pdf->SetFont('Arial', '', 10);
        if (collect($data['findings'])->isEmpty()) {
            $pdf->Cell(0, 6, $this->pdfText('No findings recorded.'), 0, 1);
        } else {
            foreach (collect($data['findings'])->take(20) as $finding) {
                $pdf->MultiCell(0, 5, $this->pdfText(sprintf(
                    '[%s] %s (%s)',
                    strtoupper((string) $finding['severity']),
                    $finding['title'],
                    $finding['status']
                )));
            }
        }
        $pdf->Ln(2);

        $pdf->SetFont('Arial', 'B', 13);
        $pdf->Cell(0, 8, $this->pdfText('Threat Intel'), 0, 1);
        $pdf->SetFont('Arial', '', 10);
        if (collect($data['intel_hits'])->isEmpty()) {
            $pdf->Cell(0, 6, $this->pdfText('No intel hits recorded.'), 0, 1);
        } else {
            foreach (collect($data['intel_hits'])->take(20) as $hit) {
                $pdf->MultiCell(0, 5, $this->pdfText(sprintf(
                    '[%s] %s - %s',
                    strtoupper((string) $hit['provider_type']),
                    $hit['title'],
                    $hit['summary'] ?: '-'
                )));
            }
        }

        return $pdf->Output('S');
    }

    private function pdfText(string $value): string
    {
        return iconv('UTF-8', 'windows-1252//TRANSLIT', $value) ?: $value;
    }
}

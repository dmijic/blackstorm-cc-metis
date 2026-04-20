<?php

namespace App\Services\Metis;

class WorkflowBlueprintService
{
    public function defaultWorkflow(): array
    {
        return [
            'slug' => 'metis-smart-recon',
            'name' => 'Metis Smart Recon',
            'description' => 'Authorized recon, enrichment, validation, infrastructure grouping, reporting, and recommendation workflow.',
            'is_system' => true,
            'is_default' => true,
            'active' => true,
            'nodes' => [
                $this->node('input_scope', 10, 'Input Scope', 'fas fa-crosshairs', 'Load root domains, known subdomains, GitHub orgs, and approved IP ranges.', 'passive', false, ['project.root_domains', 'scope.verified_domains'], phase: 'Define Scope'),
                $this->node('passive_dns', 20, 'Passive DNS', 'fas fa-server', 'Collect A, AAAA, CNAME, MX, NS, TXT, SOA, SPF, and DMARC data.', 'passive', false, ['dns.records', 'dns.a_records', 'dns.aaaa_records'], phase: 'Passive Discovery'),
                $this->node('ct_lookup', 30, 'CT Lookup', 'fas fa-certificate', 'Discover subdomains from certificate transparency sources.', 'passive', false, ['discovery.ct_subdomains'], phase: 'Passive Discovery'),
                $this->node('rdap_whois', 40, 'RDAP / WHOIS', 'fas fa-id-card', 'Extract public ownership and registrar context.', 'passive', false, ['dns.ownership'], phase: 'DNS & Ownership'),
                $this->node('github_hints', 50, 'GitHub Hints', 'fab fa-github', 'Review public GitHub metadata for owned brands and organizations.', 'passive', false, ['discovery.github_hints'], supportsAi: true, isOptional: true, phase: 'Passive Discovery'),
                $this->node('search_engine_recon', 60, 'Search Recon', 'fas fa-search', 'Generate or execute safe public search queries for owned assets and staging hints.', 'passive', false, ['discovery.search_urls'], supportsAi: true, isOptional: true, phase: 'Passive Discovery'),
                $this->node('dns_enrichment', 70, 'DNS Enrichment', 'fas fa-sitemap', 'Resolve newly discovered domains and store reverse IP mapping.', 'passive', false, ['dns.reverse_map'], phase: 'DNS & Ownership'),
                $this->node('resolve_hosts', 80, 'Resolve Hosts', 'fas fa-project-diagram', 'Normalize host/IP relationships and shared-IP mappings.', 'passive', false, ['resolved.host_ips'], phase: 'DNS & Ownership'),
                $this->node('live_http_probe', 90, 'HTTP Probe', 'fas fa-broadcast-tower', 'Validate live HTTP/S services and classify web surface.', 'active', true, ['host_services.http'], phase: 'Live Validation'),
                $this->node('tls_fingerprint', 100, 'TLS Fingerprint', 'fas fa-lock', 'Collect cert reuse, issuer, SAN, and expiry data.', 'active', true, ['tls.certificates'], phase: 'Live Validation'),
                $this->node('ping_check', 110, 'Ping Check', 'fas fa-signal', 'Optional reachability check with graceful fallback if ICMP is unavailable.', 'active', true, ['network.reachability'], isOptional: true, phase: 'Live Validation'),
                $this->node('port_scan', 120, 'Port Scan', 'fas fa-network-wired', 'Run authorized safe-mode port discovery.', 'active', true, ['host_services.ports'], phase: 'Live Validation'),
                $this->node('banner_grab', 130, 'Banner Grab', 'fas fa-terminal', 'Capture safe banner snippets from discovered services.', 'active', true, ['host_services.banners'], phase: 'Live Validation'),
                $this->node('service_fingerprint', 140, 'Service Fingerprint', 'fas fa-fingerprint', 'Classify services as web, SSH, mail, DB, VPN, reverse proxy, or unknown.', 'active', true, ['host_services.fingerprints'], phase: 'Live Validation'),
                $this->node('directory_discovery', 150, 'Directory Discovery', 'fas fa-folder-open', 'Enumerate obvious backups, panels, and default files on authorized web targets.', 'active', true, ['findings.directory'], isOptional: true, phase: 'Findings'),
                $this->node('wayback', 160, 'Wayback', 'fas fa-history', 'Optional historical URL recovery. Failures do not stop the workflow.', 'passive', false, ['history.urls'], isOptional: true, phase: 'Optional History'),
                $this->node('cti_exposure', 170, 'CTI Exposure', 'fas fa-satellite', 'Enrich discovered IPs with passive exposure feeds.', 'passive', false, ['intel.cti'], isOptional: true, phase: 'Intelligence / Exposure'),
                $this->node('hibp_scan', 180, 'HIBP Scan', 'fas fa-user-secret', 'Check owned email domains for public breach metadata.', 'passive', false, ['intel.hibp'], isOptional: true, phase: 'Intelligence / Exposure'),
                $this->node('vuln_assessment', 190, 'Vuln Assessment', 'fas fa-shield-virus', 'Run safe control and exposure checks without exploitation.', 'active', true, ['findings.items'], isOptional: true, phase: 'Findings'),
                $this->node('remediation_validation', 200, 'Remediation Validation', 'fas fa-clipboard-check', 'Re-check previously recorded findings.', 'active', true, ['findings.validation'], isOptional: true, phase: 'Findings'),
                $this->node('iam_audit', 210, 'IAM Audit', 'fas fa-user-shield', 'Assess auth-facing hosts for safe IAM/session control issues.', 'active', true, ['findings.iam'], isOptional: true, phase: 'Findings'),
                $this->node('attack_surface_map', 220, 'Attack Surface Map', 'fas fa-map-marked-alt', 'Group assets by IP, TLS, provider hints, and service characteristics.', 'passive', false, ['attack_surface.grouped_assets'], phase: 'Attack Surface Map'),
                $this->node('recommendation_engine', 230, 'Recommendation Engine', 'fas fa-lightbulb', 'Suggest next safe steps based on observed evidence.', 'passive', false, ['recommendations.items'], supportsAi: true, phase: 'Report'),
                $this->node('report_generate', 240, 'Report Generate', 'fas fa-file-alt', 'Build structured evidence-based report sections.', 'passive', false, ['report.sections'], supportsAi: true, phase: 'Report'),
                $this->node('export_json', 250, 'Export JSON', 'fas fa-file-code', 'Generate JSON report artifact.', 'passive', false, ['report.json_artifact'], phase: 'Report'),
                $this->node('export_pdf', 260, 'Export PDF', 'fas fa-file-pdf', 'Generate PDF report artifact.', 'passive', false, ['report.pdf_artifact'], phase: 'Report'),
            ],
        ];
    }

    public function reportTemplates(): array
    {
        return [
            [
                'slug' => 'nist-technical',
                'name' => 'NIST-style Technical Assessment',
                'description' => 'Technical assessment structure with scope, methodology, observations, and remediation guidance.',
                'style' => 'nist',
                'template_kind' => 'technical_assessment',
                'strict_evidence_default' => true,
                'is_system' => true,
                'active' => true,
                'sections_json' => ['cover', 'scope', 'methodology', 'data_sources', 'asset_inventory', 'infrastructure_grouping', 'findings', 'recommendations', 'appendix'],
            ],
            [
                'slug' => 'ptes-security',
                'name' => 'PTES-style Security Assessment Report',
                'description' => 'PTES-inspired format for authorized assessment and validation-oriented reporting.',
                'style' => 'ptes',
                'template_kind' => 'security_assessment',
                'strict_evidence_default' => true,
                'is_system' => true,
                'active' => true,
                'sections_json' => ['cover', 'scope', 'authorization', 'methodology', 'asset_inventory', 'exposure_summary', 'findings', 'change_analysis', 'recommendations', 'appendix'],
            ],
            [
                'slug' => 'owasp-exposure',
                'name' => 'OWASP-style Web/Exposure Findings Report',
                'description' => 'Exposure and misconfiguration oriented report pack.',
                'style' => 'owasp',
                'template_kind' => 'exposure_report',
                'strict_evidence_default' => true,
                'is_system' => true,
                'active' => true,
                'sections_json' => ['cover', 'scope', 'methodology', 'asset_inventory', 'historical_surface', 'findings', 'recommendations', 'appendix'],
            ],
            [
                'slug' => 'metis-executive-brief',
                'name' => 'Metis Executive Brief',
                'description' => 'Short executive summary with observed, inferred, and recommended sections.',
                'style' => 'metis',
                'template_kind' => 'executive_brief',
                'strict_evidence_default' => true,
                'is_system' => true,
                'active' => true,
                'sections_json' => ['cover', 'scope', 'exposure_summary', 'recommendations'],
            ],
            [
                'slug' => 'metis-technical-recon',
                'name' => 'Metis Technical Recon Report',
                'description' => 'Full reconnaissance report with DNS, ownership, infra grouping, findings, and raw evidence appendices.',
                'style' => 'metis',
                'template_kind' => 'technical_recon',
                'strict_evidence_default' => true,
                'is_system' => true,
                'active' => true,
                'sections_json' => ['cover', 'scope', 'authorization', 'methodology', 'data_sources', 'dns_ownership_summary', 'asset_inventory', 'infrastructure_grouping', 'historical_surface', 'findings', 'recommendations', 'audit_trail', 'appendix'],
            ],
        ];
    }

    public function scriptTemplates(): array
    {
        return [
            [
                'slug' => 'ip-summary-shell',
                'name' => 'IP Summary (Shell)',
                'description' => 'Example shell template that echoes structured IP scope input for interpretation.',
                'runtime' => 'shell',
                'script_body' => <<<'SCRIPT'
printf '{"received_targets": %s, "note": "shell template executed"}\n' "$METIS_INPUT_JSON"
SCRIPT,
                'input_schema_json' => ['type' => 'object', 'properties' => ['targets' => ['type' => 'array']]],
                'output_schema_json' => ['type' => 'object', 'properties' => ['received_targets' => ['type' => 'array']]],
                'allowed_target_types_json' => ['ip', 'host'],
                'execution_policy_json' => ['sandbox' => true, 'network' => 'none'],
                'timeout_seconds' => 30,
                'environment_policy_json' => ['allowed_env' => ['METIS_INPUT_JSON']],
                'network_policy_json' => ['mode' => 'disabled'],
                'ai_prompt_template' => 'Interpret this structured shell output in the context of authorized infrastructure reconnaissance.',
                'enabled' => true,
                'is_system' => true,
            ],
            [
                'slug' => 'json-shape-python',
                'name' => 'JSON Shape (Python)',
                'description' => 'Example Python template that normalizes input and returns deterministic JSON.',
                'runtime' => 'python',
                'script_body' => "import json, os\npayload = json.loads(os.environ.get('METIS_INPUT_JSON', '{}'))\nprint(json.dumps({'keys': sorted(payload.keys()), 'target_count': len(payload.get('targets', []))}))\n",
                'input_schema_json' => ['type' => 'object'],
                'output_schema_json' => ['type' => 'object', 'properties' => ['keys' => ['type' => 'array'], 'target_count' => ['type' => 'integer']]],
                'allowed_target_types_json' => ['domain', 'host', 'ip'],
                'execution_policy_json' => ['sandbox' => true, 'network' => 'none'],
                'timeout_seconds' => 30,
                'environment_policy_json' => ['allowed_env' => ['METIS_INPUT_JSON']],
                'network_policy_json' => ['mode' => 'disabled'],
                'ai_prompt_template' => 'Interpret the parsed Python output and call out observed facts separately from inferences.',
                'enabled' => true,
                'is_system' => true,
            ],
        ];
    }

    private function node(
        string $type,
        int $position,
        string $name,
        string $icon,
        string $description,
        string $mode,
        bool $requiresVerifiedScope,
        array $outputKeys,
        bool $supportsAi = false,
        bool $isOptional = false,
        string $phase = 'General'
    ): array {
        return [
            'key' => $type,
            'type' => $type,
            'position' => $position,
            'input_schema_json' => ['type' => 'object'],
            'output_schema_json' => ['type' => 'object', 'properties' => collect($outputKeys)->mapWithKeys(fn ($key) => [$key => ['type' => 'array']])->all()],
            'allowed_target_types_json' => ['project', 'domain', 'host', 'ip', 'url'],
            'config_json' => ['output_keys' => $outputKeys],
            'execution_class' => \App\Services\Metis\WorkflowEngineService::class,
            'execution_mode' => $mode,
            'requires_verified_scope' => $requiresVerifiedScope,
            'timeout_seconds' => 300,
            'retry_limit' => $isOptional ? 0 : 1,
            'audit_behavior' => 'full',
            'supports_ai' => $supportsAi,
            'is_optional' => $isOptional,
            'danger_level' => $requiresVerifiedScope ? 'guarded' : 'info',
            'ui_meta_json' => [
                'name' => $name,
                'icon' => $icon,
                'short_description' => $description,
                'phase' => $phase,
            ],
        ];
    }
}

<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Services\Metis\ToolsClientService;
use Illuminate\Http\JsonResponse;

class ToolsController extends Controller
{
    public function index(ToolsClientService $tools): JsonResponse
    {
        $catalog = $tools->catalog();

        return response()->json([
            'data' => [
                [
                    'id' => 'dns_lookup',
                    'label' => 'DNS Lookup',
                    'category' => 'passive',
                    'guard' => 'none',
                ],
                [
                    'id' => 'ct_lookup',
                    'label' => 'Certificate Transparency',
                    'category' => 'passive',
                    'guard' => 'none',
                ],
                [
                    'id' => 'subfinder',
                    'label' => 'Subfinder',
                    'category' => 'passive',
                    'guard' => 'none',
                    'available' => (bool) ($catalog['tools']['subfinder'] ?? false),
                ],
                [
                    'id' => 'github_hints',
                    'label' => 'GitHub Hints',
                    'category' => 'passive',
                    'guard' => 'public_metadata_only',
                ],
                [
                    'id' => 'http_probe',
                    'label' => 'HTTP Probe',
                    'category' => 'active',
                    'guard' => 'verified_scope_only',
                ],
                [
                    'id' => 'wayback',
                    'label' => 'Wayback',
                    'category' => 'history',
                    'guard' => 'none',
                ],
                [
                    'id' => 'port_scan',
                    'label' => 'Port Scan',
                    'category' => 'active',
                    'guard' => 'verified_scope_or_ip_range',
                    'available' => (bool) ($catalog['tools']['naabu'] ?? false),
                ],
                [
                    'id' => 'directory_enum',
                    'label' => 'Directory Discovery',
                    'category' => 'active',
                    'guard' => 'verified_scope_only',
                ],
                [
                    'id' => 'vuln_assessment',
                    'label' => 'Vuln Assessment',
                    'category' => 'active',
                    'guard' => 'verified_scope_only',
                ],
                [
                    'id' => 'remediation_validation',
                    'label' => 'Remediation Validation',
                    'category' => 'active',
                    'guard' => 'verified_scope_only',
                ],
                [
                    'id' => 'iam_audit',
                    'label' => 'IAM Audit',
                    'category' => 'active',
                    'guard' => 'verified_scope_only',
                ],
                [
                    'id' => 'hibp_scan',
                    'label' => 'HIBP Scan',
                    'category' => 'intel',
                    'guard' => 'public_breach_metadata_only',
                ],
                [
                    'id' => 'cti_exposure',
                    'label' => 'CTI Exposure',
                    'category' => 'intel',
                    'guard' => 'passive_external_enrichment',
                ],
                [
                    'id' => 'wizard_pipeline',
                    'label' => 'Full Wizard Pipeline',
                    'category' => 'pipeline',
                    'guard' => 'active_steps_enforce_scope',
                ],
            ],
            'runtime' => $catalog,
        ]);
    }
}

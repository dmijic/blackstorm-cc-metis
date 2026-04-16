<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Jobs\Metis\CtLookupJob;
use App\Jobs\Metis\CtiExposureJob;
use App\Jobs\Metis\DirectoryDiscoveryJob;
use App\Jobs\Metis\DnsLookupJob;
use App\Jobs\Metis\GithubHintsJob;
use App\Jobs\Metis\HibpScanJob;
use App\Jobs\Metis\HttpProbeJob;
use App\Jobs\Metis\IamAuditJob;
use App\Jobs\Metis\PortScanJob;
use App\Jobs\Metis\RemediationValidationJob;
use App\Jobs\Metis\SubfinderJob;
use App\Jobs\Metis\VulnAssessmentJob;
use App\Jobs\Metis\WaybackJob;
use App\Jobs\Metis\WizardPipelineJob;
use App\Models\MetisAuditLog;
use App\Models\MetisJobRun;
use App\Models\MetisProject;
use App\Services\Metis\ScopeVerifierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JobRunController extends Controller
{
    private const ALLOWED_TYPES = [
        'dns_lookup', 'ct_lookup', 'subfinder', 'github_hints', 'http_probe', 'wayback', 'port_scan',
        'directory_enum', 'vuln_assessment', 'remediation_validation', 'iam_audit', 'hibp_scan',
        'cti_exposure', 'wizard_pipeline',
    ];

    public function index(Request $request, MetisProject $project): JsonResponse
    {
        $runs = $project->jobRuns()
            ->with('creator:id,name')
            ->when($request->filled('type'),   fn($q) => $q->where('type', $request->type))
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json($runs);
    }

    public function show(MetisProject $project, MetisJobRun $run): JsonResponse
    {
        abort_if($run->project_id !== $project->id, 404);

        return response()->json([
            'data' => $run->load('creator:id,name'),
            'output' => $run->loadOutput(),
        ]);
    }

    public function dispatch(Request $request, MetisProject $project, ScopeVerifierService $scopeVerifier): JsonResponse
    {
        $validated = $request->validate([
            'type'   => ['required', 'in:' . implode(',', self::ALLOWED_TYPES)],
            'params' => ['nullable', 'array'],
        ]);

        $type   = $validated['type'];
        $params = $validated['params'] ?? [];

        // Validate params per type
        match ($type) {
            'dns_lookup' => abort_if(empty($params['domain']), 422, 'domain required'),
            'ct_lookup'  => abort_if(empty($params['domain']), 422, 'domain required'),
            'subfinder'  => abort_if(empty($params['domain']), 422, 'domain required'),
            'github_hints' => null,
            'http_probe' => abort_if(empty($params['hosts']), 422, 'hosts[] required'),
            'wayback'    => abort_if(empty($params['domain']), 422, 'domain required'),
            'port_scan'  => abort_if(empty($params['hosts']) && empty($params['host']), 422, 'host or hosts required'),
            'directory_enum' => null,
            'vuln_assessment' => null,
            'remediation_validation' => null,
            'iam_audit' => null,
            'hibp_scan' => null,
            'cti_exposure' => null,
            'wizard_pipeline' => null,
            default      => null,
        };

        if (in_array($type, ['http_probe', 'port_scan', 'directory_enum', 'vuln_assessment', 'iam_audit'], true)) {
            $targets = $type === 'http_probe'
                ? ($params['hosts'] ?? [])
                : ($params['hosts'] ?? [$params['host'] ?? null]);

            if ($targets !== []) {
                $blocked = $scopeVerifier->blockedTargets($project->id, $targets, $request->user());

                if ($blocked !== []) {
                    return response()->json([
                        'message' => 'Active scan targets must be inside verified domains or approved IP ranges.',
                        'blocked_targets' => $blocked,
                    ], 403);
                }
            }
        }

        $run = MetisJobRun::create([
            'project_id'  => $project->id,
            'created_by'  => $request->user()->id,
            'type'        => $type,
            'params_json' => $params,
            'status'      => 'queued',
        ]);

        // Dispatch appropriate job
        match ($type) {
            'dns_lookup'     => DnsLookupJob::dispatch($run->id),
            'ct_lookup'      => CtLookupJob::dispatch($run->id),
            'subfinder'      => SubfinderJob::dispatch($run->id),
            'github_hints'   => GithubHintsJob::dispatch($run->id),
            'http_probe'     => HttpProbeJob::dispatch($run->id),
            'wayback'        => WaybackJob::dispatch($run->id),
            'port_scan'      => PortScanJob::dispatch($run->id),
            'directory_enum' => DirectoryDiscoveryJob::dispatch($run->id),
            'vuln_assessment' => VulnAssessmentJob::dispatch($run->id),
            'remediation_validation' => RemediationValidationJob::dispatch($run->id),
            'iam_audit' => IamAuditJob::dispatch($run->id),
            'hibp_scan' => HibpScanJob::dispatch($run->id),
            'cti_exposure' => CtiExposureJob::dispatch($run->id),
            'wizard_pipeline'=> WizardPipelineJob::dispatch(
                $run->id,
                $params['steps'] ?? ['dns', 'ct', 'subfinder', 'github_hints', 'http_probe', 'port_scan', 'directory_enum'],
                $params['optional_steps'] ?? ['wayback']
            ),
        };

        MetisAuditLog::record(
            action: "job.dispatched.{$type}",
            projectId: $project->id,
            userId: $request->user()->id,
            entityType: 'job_run',
            entityId: $run->id,
            ip: $request->ip()
        );

        return response()->json(['data' => $run], 201);
    }

    public function cancel(Request $request, MetisProject $project, MetisJobRun $run): JsonResponse
    {
        abort_if($run->project_id !== $project->id, 404);

        if (!in_array($run->status, ['queued', 'running'])) {
            return response()->json(['message' => 'Cannot cancel a run that is not queued or running.'], 422);
        }

        $run->update(['status' => 'cancelled', 'finished_at' => now()]);

        MetisAuditLog::record(
            action: 'job.cancelled',
            projectId: $project->id,
            userId: $request->user()->id,
            entityType: 'job_run',
            entityId: $run->id,
            ip: $request->ip()
        );

        return response()->json(['data' => $run->fresh()]);
    }
}

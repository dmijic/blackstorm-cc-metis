<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisAuditLog;
use App\Models\MetisProject;
use App\Services\Metis\AiService;
use App\Services\Metis\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reportService,
        private readonly AiService $aiService,
    ) {}

    public function json(Request $request, MetisProject $project): JsonResponse
    {
        MetisAuditLog::record(
            action: 'report.generated.json',
            projectId: $project->id,
            userId: $request->user()->id,
            ip: $request->ip()
        );

        return response()->json($this->reportService->generateJson($project));
    }

    public function html(Request $request, MetisProject $project): Response
    {
        $aiSummary = null;

        if ($request->boolean('ai_summary')) {
            $aiSummary = $this->aiService->summarizeProject($project);
        }

        MetisAuditLog::record(
            action: 'report.generated.html',
            projectId: $project->id,
            userId: $request->user()->id,
            ip: $request->ip()
        );

        $html = $this->reportService->generateHtml($project, $aiSummary);

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
        ]);
    }

    public function pdf(Request $request, MetisProject $project): Response
    {
        $aiSummary = $request->boolean('ai_summary')
            ? $this->aiService->summarizeProject($project)
            : null;

        MetisAuditLog::record(
            action: 'report.generated.pdf',
            projectId: $project->id,
            userId: $request->user()->id,
            ip: $request->ip()
        );

        $pdf = $this->reportService->generatePdf($project, $aiSummary);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="metis-report-'.$project->id.'.pdf"',
        ]);
    }

    public function aiSummary(Request $request, MetisProject $project): JsonResponse
    {
        $summary = $this->aiService->summarizeProject($project);

        MetisAuditLog::record(
            action: 'report.ai_summary',
            projectId: $project->id,
            userId: $request->user()->id,
            ip: $request->ip()
        );

        return response()->json(['summary' => $summary]);
    }

    public function entitySummary(Request $request, MetisProject $project): JsonResponse
    {
        $validated = $request->validate([
            'entity_type' => ['required', 'in:domain,host,url,finding'],
            'entity_data' => ['required', 'array'],
        ]);

        $summary = $this->aiService->entitySummary(
            $validated['entity_type'],
            $validated['entity_data']
        );

        return response()->json(['summary' => $summary]);
    }
}

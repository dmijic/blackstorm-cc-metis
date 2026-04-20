<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisReportTemplate;
use App\Services\Metis\WorkflowEngineService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportTemplateController extends Controller
{
    public function __construct(
        private readonly WorkflowEngineService $engine,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->engine->syncDefaults($request->user()->id);

        $templates = MetisReportTemplate::query()
            ->where('active', true)
            ->orderByDesc('is_system')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $templates]);
    }
}

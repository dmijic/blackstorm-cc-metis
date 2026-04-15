<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisProject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntelController extends Controller
{
    public function hits(Request $request, MetisProject $project): JsonResponse
    {
        $hits = $project->intelHits()
            ->when($request->filled('provider_type'), fn ($query) => $query->where('provider_type', $request->provider_type))
            ->when($request->filled('severity'), fn ($query) => $query->where('severity', $request->severity))
            ->orderByDesc('discovered_at')
            ->paginate(50);

        return response()->json($hits);
    }
}

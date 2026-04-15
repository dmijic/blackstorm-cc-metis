<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisAuditLog;
use App\Models\MetisProject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access required.');

        $logs = MetisAuditLog::query()
            ->with(['user:id,name', 'project:id,name'])
            ->when($request->filled('action'),     fn($q) => $q->where('action', 'like', $request->action . '%'))
            ->when($request->filled('project_id'), fn($q) => $q->where('project_id', $request->project_id))
            ->when($request->filled('user_id'),    fn($q) => $q->where('user_id', $request->user_id))
            ->orderByDesc('occurred_at')
            ->paginate(100);

        return response()->json($logs);
    }

    public function forProject(Request $request, MetisProject $project): JsonResponse
    {
        $logs = MetisAuditLog::query()
            ->with('user:id,name')
            ->where('project_id', $project->id)
            ->when($request->filled('action'), fn($q) => $q->where('action', 'like', $request->action . '%'))
            ->orderByDesc('occurred_at')
            ->paginate(100);

        return response()->json($logs);
    }
}

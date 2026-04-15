<?php

namespace App\Http\Controllers\Api\Intel;

use App\Enums\SubjectType;
use App\Http\Controllers\Controller;
use App\Models\Subject;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Enum;

class SubjectController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => Subject::query()->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'org_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', new Enum(SubjectType::class)],
            'config_json' => ['nullable', 'array'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        $subject = Subject::create([
            ...$validated,
            'enabled' => $validated['enabled'] ?? true,
        ]);

        return response()->json([
            'data' => $subject,
        ], 201);
    }

    public function update(Request $request, Subject $subject)
    {
        $validated = $request->validate([
            'org_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', new Enum(SubjectType::class)],
            'config_json' => ['nullable', 'array'],
            'enabled' => ['required', 'boolean'],
        ]);

        $subject->update($validated);

        return response()->json([
            'data' => $subject->fresh(),
        ]);
    }

    public function destroy(Subject $subject)
    {
        $subject->delete();

        return response()->noContent();
    }
}

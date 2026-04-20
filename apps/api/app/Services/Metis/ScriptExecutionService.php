<?php

namespace App\Services\Metis;

use App\Models\MetisAuditLog;
use App\Models\MetisScriptRun;
use App\Models\MetisScriptTemplate;
use App\Models\MetisWorkflowRun;
use Symfony\Component\Process\Process;

class ScriptExecutionService
{
    public function execute(MetisScriptRun $run): array
    {
        $template = $run->template;
        $run->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        $workdir = storage_path("app/metis/scripts/{$run->id}");
        if (! is_dir($workdir)) {
            mkdir($workdir, 0775, true);
        }

        [$command, $scriptPath] = $this->buildCommand($template, $workdir);
        file_put_contents($scriptPath, $template->script_body);

        $env = [
            'METIS_INPUT_JSON' => json_encode($run->input_json ?? [], JSON_UNESCAPED_SLASHES),
        ];

        $process = new Process($command, $workdir, $env, null, $run->timeout_seconds ?: $template->timeout_seconds);
        $process->run();

        $stdout = $process->getOutput();
        $stderr = $process->getErrorOutput();

        $run->storeArtifact('stdout', $stdout);
        $run->storeArtifact('stderr', $stderr);

        $parsed = json_decode(trim($stdout), true);
        if (! is_array($parsed)) {
            $parsed = [
                'stdout' => trim($stdout),
                'stderr' => trim($stderr),
            ];
        }

        $run->update([
            'status' => $process->isSuccessful() ? 'completed' : 'failed',
            'parsed_output_json' => $parsed,
            'artifacts_json' => ['script_path' => $scriptPath],
            'error_message' => $process->isSuccessful() ? null : (trim($stderr) ?: 'Script execution failed.'),
            'finished_at' => now(),
        ]);

        MetisAuditLog::record(
            action: 'script.executed',
            projectId: $run->project_id,
            userId: $run->created_by,
            entityType: 'script_run',
            entityId: $run->id,
            meta: [
                'template_id' => $run->template_id,
                'status' => $run->status,
                'workflow_run_id' => $run->workflow_run_id,
            ]
        );

        return $parsed;
    }

    public function createRun(
        MetisScriptTemplate $template,
        array $input,
        int $projectId,
        int $userId,
        ?MetisWorkflowRun $workflowRun = null
    ): MetisScriptRun {
        return MetisScriptRun::query()->create([
            'project_id' => $projectId,
            'template_id' => $template->id,
            'workflow_run_id' => $workflowRun?->id,
            'created_by' => $userId,
            'status' => 'queued',
            'input_json' => $input,
            'timeout_seconds' => $template->timeout_seconds,
        ]);
    }

    private function buildCommand(MetisScriptTemplate $template, string $workdir): array
    {
        return match ($template->runtime) {
            'python' => [['python3', "{$workdir}/script.py"], "{$workdir}/script.py"],
            default => [['sh', "{$workdir}/script.sh"], "{$workdir}/script.sh"],
        };
    }
}

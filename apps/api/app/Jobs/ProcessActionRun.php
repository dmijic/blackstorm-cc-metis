<?php

namespace App\Jobs;

use App\Enums\ActionRunStatus;
use App\Enums\PlaybookActionType;
use App\Models\ActionRun;
use App\Models\PlaybookAction;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class ProcessActionRun implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $actionRunId)
    {
        $this->afterCommit = true;
    }

    public function handle(): void
    {
        $actionRun = ActionRun::query()->with(['playbook', 'finding'])->find($this->actionRunId);

        if (! $actionRun || $actionRun->status !== ActionRunStatus::QUEUED) {
            return;
        }

        $actionId = $actionRun->payload_json['action_id'] ?? null;
        $action = $actionId ? PlaybookAction::query()->find($actionId) : null;

        if (! $action) {
            $this->markFailed($actionRun, 'Referenced playbook action no longer exists.');
            return;
        }

        try {
            match ($action->action_type) {
                PlaybookActionType::WEBHOOK => $this->sendWebhook($actionRun, $action),
                PlaybookActionType::EMAIL => $this->sendEmail($actionRun, $action),
            };

            $actionRun->update([
                'status' => ActionRunStatus::SENT,
                'error' => null,
                'sent_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            $this->markFailed($actionRun, $exception->getMessage());
        }
    }

    private function sendWebhook(ActionRun $actionRun, PlaybookAction $action): void
    {
        $config = $action->config_json ?? [];
        $url = $config['url'] ?? null;

        if (! $url) {
            throw new \RuntimeException('Webhook action requires a URL.');
        }

        $payload = $this->outboundPayload($actionRun);
        $encodedPayload = json_encode($payload, JSON_THROW_ON_ERROR);
        $signature = hash_hmac('sha256', $encodedPayload, (string) ($config['secret'] ?? ''));

        Http::timeout((int) ($config['timeout'] ?? 10))
            ->withHeaders([
                'X-Blackstorm-Signature' => 'sha256='.$signature,
                'Content-Type' => 'application/json',
            ])
            ->post($url, $payload)
            ->throw();
    }

    private function sendEmail(ActionRun $actionRun, PlaybookAction $action): void
    {
        $config = $action->config_json ?? [];
        $to = $config['to'] ?? null;

        if (! $to) {
            throw new \RuntimeException('Email action requires a recipient.');
        }

        $from = $config['from'] ?? config('mail.from.address');
        $subject = $config['subject'] ?? sprintf(
            '[Blackstorm CC] %s / %s',
            $actionRun->finding->severity?->value ?? $actionRun->finding->severity,
            $actionRun->finding->title
        );

        $body = implode("\n", [
            'Blackstorm Response Orchestrator',
            '',
            'Playbook: '.$actionRun->playbook->name,
            'Finding ID: '.$actionRun->finding->id,
            'Type: '.$actionRun->finding->type,
            'Severity: '.($actionRun->finding->severity?->value ?? $actionRun->finding->severity),
            'Confidence: '.number_format((float) $actionRun->finding->confidence, 2),
            'Title: '.$actionRun->finding->title,
            '',
            $actionRun->finding->summary,
        ]);

        Mail::raw($body, function ($message) use ($to, $from, $subject) {
            $message->to($to)->subject($subject);

            if ($from) {
                $message->from($from);
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function outboundPayload(ActionRun $actionRun): array
    {
        $payload = $actionRun->payload_json;
        unset($payload['delivery']);

        $payload['action_run_id'] = $actionRun->id;
        $payload['triggered_at'] = $actionRun->created_at?->toIso8601String();

        return $payload;
    }

    private function markFailed(ActionRun $actionRun, string $message): void
    {
        $actionRun->update([
            'status' => ActionRunStatus::FAILED,
            'error' => $message,
        ]);
    }
}

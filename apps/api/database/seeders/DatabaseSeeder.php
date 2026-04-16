<?php

namespace Database\Seeders;

use App\Models\ActionRun;
use App\Enums\FindingStatus;
use App\Enums\SubjectType;
use App\Models\Finding;
use App\Models\Playbook;
use App\Models\Subject;
use App\Models\TriageNote;
use App\Models\User;
use App\Services\Intel\IntelFindingIngestor;
use App\Services\Response\ResponseOrchestrator;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // SuperAdmin (God Mode) — username: root, password: toor
        User::query()->updateOrCreate(
            ['email' => 'root@commandcenter.local'],
            [
                'name' => 'root',
                'role' => User::ROLE_SUPERADMIN,
                'password' => Hash::make('toor'),
                'email_verified_at' => now(),
            ]
        );

        $demoPassword = Hash::make('Blackstorm123!');

        $demoUsers = [
            [
                'name' => 'Admin User',
                'email' => 'admin@blackstorm.local',
                'role' => User::ROLE_ADMIN,
            ],
            [
                'name' => 'Operator User',
                'email' => 'operator@blackstorm.local',
                'role' => User::ROLE_OPERATOR,
            ],
            [
                'name' => 'Analyst User',
                'email' => 'analyst@blackstorm.local',
                'role' => User::ROLE_ANALYST,
            ],
            [
                'name' => 'Viewer User',
                'email' => 'viewer@blackstorm.local',
                'role' => User::ROLE_VIEWER,
            ],
        ];

        foreach ($demoUsers as $userData) {
            User::query()->updateOrCreate(
                ['email' => $userData['email']],
                [
                    'name' => $userData['name'],
                    'role' => $userData['role'],
                    'password' => $demoPassword,
                    'email_verified_at' => now(),
                ]
            );
        }

        Subject::query()->updateOrCreate(
            ['org_id' => null, 'name' => 'example.com'],
            ['type' => SubjectType::DOMAIN, 'config_json' => null, 'enabled' => true]
        );
        Subject::query()->updateOrCreate(
            ['org_id' => null, 'name' => 'blackstorm.local'],
            ['type' => SubjectType::EMAIL_DOMAIN, 'config_json' => null, 'enabled' => true]
        );
        Subject::query()->updateOrCreate(
            ['org_id' => null, 'name' => 'blackstorm'],
            ['type' => SubjectType::KEYWORD, 'config_json' => ['category' => 'brand'], 'enabled' => true]
        );

        app(IntelFindingIngestor::class)->ingest([
            [
                'source' => 'pastebin',
                'type' => 'credential_dump',
                'severity' => 'critical',
                'title' => 'example.com admin export posted publicly',
                'summary' => 'Internal export mentions blackstorm handling and admin@example.com in the leak summary.',
                'observed_at' => now()->subHours(2)->toDateTimeString(),
                'confidence' => 0.98,
                'dedupe_key' => 'seed-example-com-dump',
                'status' => FindingStatus::NEW->value,
                'evidences' => [
                    [
                        'kind' => 'url',
                        'data_json' => ['url' => 'https://leaks.example.net/example.com/export'],
                    ],
                    [
                        'kind' => 'text',
                        'data_json' => ['excerpt' => 'admin@blackstorm.local referenced in the exposed post'],
                    ],
                ],
            ],
            [
                'source' => 'telegram',
                'type' => 'brand_mention',
                'severity' => 'med',
                'title' => 'Blackstorm mention in operator chat',
                'summary' => 'A public chat referenced blackstorm infrastructure and listed analyst@blackstorm.local.',
                'observed_at' => now()->subHours(6)->toDateTimeString(),
                'confidence' => 0.77,
                'dedupe_key' => 'seed-blackstorm-mention',
                'status' => FindingStatus::IN_REVIEW->value,
                'evidences' => [
                    [
                        'kind' => 'text',
                        'data_json' => ['excerpt' => 'analyst@blackstorm.local was visible in the screenshot transcript'],
                    ],
                ],
            ],
            [
                'source' => 'github',
                'type' => 'repo_exposure',
                'severity' => 'high',
                'title' => 'Public repo references blackstorm support workflow',
                'summary' => 'The README names blackstorm and links back to example.com support assets.',
                'observed_at' => now()->subDay()->toDateTimeString(),
                'confidence' => 0.82,
                'dedupe_key' => 'seed-github-blackstorm',
                'status' => FindingStatus::CONFIRMED->value,
                'evidences' => [
                    [
                        'kind' => 'url',
                        'data_json' => ['url' => 'https://github.com/acme/example.com-support'],
                    ],
                ],
            ],
            [
                'source' => 'crawler',
                'type' => 'third_party_listing',
                'severity' => 'low',
                'title' => 'Directory page contains blackstorm local contact',
                'summary' => 'The directory listed viewer@blackstorm.local on an outdated vendor page.',
                'observed_at' => now()->subDays(2)->toDateTimeString(),
                'confidence' => 0.64,
                'dedupe_key' => 'seed-vendor-directory',
                'status' => FindingStatus::FALSE_POSITIVE->value,
                'evidences' => [
                    [
                        'kind' => 'text',
                        'data_json' => ['excerpt' => 'viewer@blackstorm.local was actually synthetic test data'],
                    ],
                ],
            ],
            [
                'source' => 'discord',
                'type' => 'threat_discussion',
                'severity' => 'high',
                'title' => 'Escalated chatter about example.com admin console',
                'summary' => 'Threat actor claimed example.com admin console screenshots were shared privately.',
                'observed_at' => now()->subDays(3)->toDateTimeString(),
                'confidence' => 0.91,
                'dedupe_key' => 'seed-discord-example',
                'status' => FindingStatus::ESCALATED->value,
                'evidences' => [
                    [
                        'kind' => 'snapshot_ref',
                        'data_json' => ['ref' => 'discord-message-441', 'channel' => 'intel-drop'],
                    ],
                ],
            ],
        ]);

        $adminUser = User::query()->where('email', 'admin@blackstorm.local')->first();

        if ($adminUser) {
            $notes = [
                'seed-github-blackstorm' => 'Validated with public source review. Exposure is actionable.',
                'seed-vendor-directory' => 'Historical vendor record only. Marked as false positive.',
                'seed-discord-example' => 'Escalated to security operations for manual follow-up.',
            ];

            foreach ($notes as $dedupeKey => $note) {
                $finding = Finding::query()->where('dedupe_key', $dedupeKey)->first();

                if (! $finding) {
                    continue;
                }

                TriageNote::query()->updateOrCreate(
                    [
                        'finding_id' => $finding->id,
                        'actor_id' => $adminUser->id,
                    ],
                    [
                        'note' => $note,
                        'created_at' => now(),
                    ]
                );
            }
        }

        $criticalPlaybook = Playbook::query()->updateOrCreate(
            ['name' => 'Critical exposures → webhook + email'],
            [
                'org_id' => null,
                'enabled' => true,
                'rules_json' => [
                    'severity' => 'critical',
                    'min_confidence' => 0.80,
                ],
            ]
        );

        $criticalPlaybook->actions()->delete();
        $criticalPlaybook->actions()->createMany([
            [
                'action_type' => 'webhook',
                'config_json' => [
                    'url' => 'https://httpbin.org/post',
                    'secret' => 'critical-seed-secret',
                ],
            ],
            [
                'action_type' => 'email',
                'config_json' => [
                    'to' => 'soc@blackstorm.local',
                    'from' => 'noreply@blackstorm.local',
                    'subject' => '[Seed] Critical exposure notification',
                ],
            ],
        ]);

        $credentialPlaybook = Playbook::query()->updateOrCreate(
            ['name' => 'Confirmed credential_exposure → webhook'],
            [
                'org_id' => null,
                'enabled' => true,
                'rules_json' => [
                    'finding_type' => 'credential_exposure',
                    'severity' => ['high', 'critical'],
                    'min_confidence' => 0.70,
                ],
            ]
        );

        $credentialPlaybook->actions()->delete();
        $credentialPlaybook->actions()->createMany([
            [
                'action_type' => 'webhook',
                'config_json' => [
                    'url' => 'https://httpbin.org/post',
                    'secret' => 'credential-seed-secret',
                ],
            ],
        ]);

        $orchestrator = app(ResponseOrchestrator::class);
        $seedTargets = [
            'seed-example-com-dump' => $criticalPlaybook,
            'seed-github-blackstorm' => $credentialPlaybook,
        ];

        foreach ($seedTargets as $dedupeKey => $playbook) {
            $finding = Finding::query()
                ->with('matches.subject')
                ->where('dedupe_key', $dedupeKey)
                ->first();

            if (! $finding) {
                continue;
            }

            $alreadySeeded = ActionRun::query()
                ->where('playbook_id', $playbook->id)
                ->where('finding_id', $finding->id)
                ->exists();

            if ($alreadySeeded) {
                continue;
            }

            $orchestrator->queuePlaybookActions($playbook->load('actions'), $finding, false);
        }
    }
}

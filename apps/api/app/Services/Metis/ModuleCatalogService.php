<?php

namespace App\Services\Metis;

class ModuleCatalogService
{
    public function definitions(): array
    {
        return [
            'github_public' => [
                'slug' => 'github_public',
                'name' => 'GitHub Public Code Hints',
                'category' => 'osint',
                'description' => 'Scans configured public GitHub organizations for repo metadata and scope-related code hints.',
                'guardrail' => 'Public metadata only. No private repository access.',
                'docs_url' => 'https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-organization-repositories',
                'instructions' => [
                    'Add GitHub org handles in project scope.',
                    'Optionally add a read-only GitHub token to increase API limits.',
                ],
                'fields' => [
                    ['key' => 'api_token', 'label' => 'API Token', 'type' => 'secret', 'placeholder' => 'github_pat_...'],
                    ['key' => 'user_agent', 'label' => 'User-Agent', 'type' => 'text', 'placeholder' => 'Metis-CommandCenter/1.0'],
                ],
            ],
            'hibp' => [
                'slug' => 'hibp',
                'name' => 'Have I Been Pwned',
                'category' => 'cti',
                'description' => 'Checks configured email domains for breach exposure without storing plaintext credentials.',
                'guardrail' => 'Only breached-domain metadata is ingested. Passwords are never stored.',
                'docs_url' => 'https://haveibeenpwned.com/API/v3',
                'instructions' => [
                    'Create a HIBP API key.',
                    'Add the email domains you own in project scope before scanning.',
                ],
                'fields' => [
                    ['key' => 'api_key', 'label' => 'API Key', 'type' => 'secret', 'placeholder' => 'hibp_...'],
                ],
            ],
            'shodan' => [
                'slug' => 'shodan',
                'name' => 'Shodan Exposure Feed',
                'category' => 'cti',
                'description' => 'Enriches approved IPs and discovered hosts with passive external exposure data.',
                'guardrail' => 'Passive enrichment only. No active Shodan-triggered scans.',
                'docs_url' => 'https://developer.shodan.io/api',
                'instructions' => [
                    'Create a Shodan API key.',
                    'Run exposure sync only for approved IP ranges and discovered project hosts.',
                ],
                'fields' => [
                    ['key' => 'api_key', 'label' => 'API Key', 'type' => 'secret', 'placeholder' => 'shodan_...'],
                ],
            ],
            'censys' => [
                'slug' => 'censys',
                'name' => 'Censys Connector',
                'category' => 'cti',
                'description' => 'Stores Censys credentials and setup guidance for future passive exposure enrichment.',
                'guardrail' => 'Configuration only in this build.',
                'docs_url' => 'https://docs.censys.com/reference/get-started',
                'instructions' => [
                    'Create a read-only API key pair in Censys.',
                    'Use the connector for approved inventory only.',
                ],
                'fields' => [
                    ['key' => 'api_id', 'label' => 'API ID', 'type' => 'text', 'placeholder' => '...'],
                    ['key' => 'api_secret', 'label' => 'API Secret', 'type' => 'secret', 'placeholder' => '...'],
                ],
            ],
            'leakix' => [
                'slug' => 'leakix',
                'name' => 'LeakIX Connector',
                'category' => 'cti',
                'description' => 'Stores LeakIX connection details and provider instructions for passive leak monitoring.',
                'guardrail' => 'Configuration only in this build.',
                'docs_url' => 'https://leakix.net/',
                'instructions' => [
                    'Create a LeakIX account and API credential if available.',
                    'Use the connector only for your own brands and domains.',
                ],
                'fields' => [
                    ['key' => 'api_key', 'label' => 'API Key', 'type' => 'secret', 'placeholder' => '...'],
                ],
            ],
            'slack' => [
                'slug' => 'slack',
                'name' => 'Slack Alerts',
                'category' => 'integration',
                'description' => 'Pushes defensive notifications to Slack channels from playbooks or manual workflows.',
                'guardrail' => 'Notification-only in this build.',
                'docs_url' => 'https://api.slack.com/messaging/webhooks',
                'instructions' => [
                    'Create an Incoming Webhook for the target workspace and channel.',
                    'Use the URL in defensive notification playbooks.',
                ],
                'fields' => [
                    ['key' => 'webhook_url', 'label' => 'Webhook URL', 'type' => 'secret', 'placeholder' => 'https://hooks.slack.com/services/...'],
                    ['key' => 'channel', 'label' => 'Default Channel', 'type' => 'text', 'placeholder' => '#security-alerts'],
                ],
            ],
            'teams' => [
                'slug' => 'teams',
                'name' => 'Teams Alerts',
                'category' => 'integration',
                'description' => 'Pushes defensive notifications to Microsoft Teams channels from playbooks or manual workflows.',
                'guardrail' => 'Notification-only in this build.',
                'docs_url' => 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/connectors-using',
                'instructions' => [
                    'Create a Teams webhook or workflow endpoint for the destination channel.',
                    'Use the endpoint in defensive playbooks or n8n forwarding.',
                ],
                'fields' => [
                    ['key' => 'webhook_url', 'label' => 'Webhook URL', 'type' => 'secret', 'placeholder' => 'https://...logic.azure.com/...'],
                ],
            ],
            'jira' => [
                'slug' => 'jira',
                'name' => 'Jira Ticketing',
                'category' => 'integration',
                'description' => 'Creates security tickets in Jira from validated findings and response workflows.',
                'guardrail' => 'Ticket creation only.',
                'docs_url' => 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
                'instructions' => [
                    'Create an API token for a service account.',
                    'Set the base URL and project key for the destination Jira project.',
                ],
                'fields' => [
                    ['key' => 'base_url', 'label' => 'Base URL', 'type' => 'text', 'placeholder' => 'https://company.atlassian.net'],
                    ['key' => 'email', 'label' => 'Service Account Email', 'type' => 'text', 'placeholder' => 'security-bot@example.com'],
                    ['key' => 'api_token', 'label' => 'API Token', 'type' => 'secret', 'placeholder' => '...'],
                    ['key' => 'project_key', 'label' => 'Project Key', 'type' => 'text', 'placeholder' => 'SEC'],
                ],
            ],
            'n8n' => [
                'slug' => 'n8n',
                'name' => 'n8n Webhooks',
                'category' => 'integration',
                'description' => 'Routes findings and response payloads into defensive n8n workflows.',
                'guardrail' => 'Outbound webhook delivery only.',
                'docs_url' => 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
                'instructions' => [
                    'Create a webhook trigger in n8n.',
                    'Paste the production URL here and keep credentials server-side only.',
                ],
                'fields' => [
                    ['key' => 'webhook_url', 'label' => 'Webhook URL', 'type' => 'secret', 'placeholder' => 'https://n8n.example.com/webhook/...'],
                    ['key' => 'shared_secret', 'label' => 'Shared Secret', 'type' => 'secret', 'placeholder' => 'optional'],
                ],
            ],
            'edr' => [
                'slug' => 'edr',
                'name' => 'EDR Containment',
                'category' => 'integration',
                'description' => 'Stores EDR connector settings for future host-isolation automations.',
                'guardrail' => 'Dry-run/configuration only in this build.',
                'docs_url' => 'https://www.crowdstrike.com/platform/endpoint-security/falcon-prevent/',
                'instructions' => [
                    'Use a dedicated EDR service account with least privilege.',
                    'Keep automated isolation disabled until you validate your change-control workflow.',
                ],
                'fields' => [
                    ['key' => 'base_url', 'label' => 'Base URL', 'type' => 'text', 'placeholder' => 'https://api.vendor.tld'],
                    ['key' => 'api_token', 'label' => 'API Token', 'type' => 'secret', 'placeholder' => '...'],
                    ['key' => 'dry_run', 'label' => 'Dry Run', 'type' => 'boolean'],
                ],
            ],
            'idp' => [
                'slug' => 'idp',
                'name' => 'IdP Recovery Actions',
                'category' => 'integration',
                'description' => 'Stores IAM/IdP connector settings for force-reset and containment workflows.',
                'guardrail' => 'Dry-run/configuration only in this build.',
                'docs_url' => 'https://developer.okta.com/docs/reference/',
                'instructions' => [
                    'Use a service account scoped only for recovery or password reset actions.',
                    'Keep force-reset actions in dry-run until approvals and auditing are in place.',
                ],
                'fields' => [
                    ['key' => 'base_url', 'label' => 'Base URL', 'type' => 'text', 'placeholder' => 'https://idp.example.com'],
                    ['key' => 'api_token', 'label' => 'API Token', 'type' => 'secret', 'placeholder' => '...'],
                    ['key' => 'dry_run', 'label' => 'Dry Run', 'type' => 'boolean'],
                ],
            ],
            'simulated_phishing' => [
                'slug' => 'simulated_phishing',
                'name' => 'Simulated Phishing',
                'category' => 'research',
                'description' => 'Documented as a research placeholder only. No executable campaign tooling is exposed in Metis.',
                'guardrail' => 'Disabled by design in this build.',
                'docs_url' => null,
                'instructions' => [
                    'Use a separate approved awareness platform if your organization runs training campaigns.',
                ],
                'fields' => [],
                'locked' => true,
            ],
            'post_exploitation_audit' => [
                'slug' => 'post_exploitation_audit',
                'name' => 'Privilege Mapping / BloodHound',
                'category' => 'research',
                'description' => 'Documented as a research placeholder only. No post-exploitation graph collection is exposed in Metis.',
                'guardrail' => 'Disabled by design in this build.',
                'docs_url' => null,
                'instructions' => [
                    'Keep privilege graphing in isolated lab tooling with separate approvals and data-handling controls.',
                ],
                'fields' => [],
                'locked' => true,
            ],
        ];
    }

    public function definition(string $slug): ?array
    {
        return $this->definitions()[$slug] ?? null;
    }
}

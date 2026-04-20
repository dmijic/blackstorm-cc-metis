<?php

namespace App\Http\Controllers\Api\Metis;

use App\Http\Controllers\Controller;
use App\Models\MetisAuditLog;
use App\Models\MetisDomainEntity;
use App\Models\MetisDomainVerification;
use App\Models\MetisProject;
use App\Models\MetisScope;
use App\Services\Metis\ScopeVerifierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScopeController extends Controller
{
    public function show(MetisProject $project): JsonResponse
    {
        $scope         = $project->scope ?? MetisScope::create(['project_id' => $project->id]);
        $verifications = $project->domainVerifications()->orderBy('domain')->get();

        return response()->json([
            'data'          => $scope,
            'verifications' => $verifications,
        ]);
    }

    public function update(Request $request, MetisProject $project): JsonResponse
    {
        $validated = $request->validate([
            'root_domains'    => ['nullable', 'array'],
            'root_domains.*'  => ['string', 'max:255'],
            'brand_keywords'  => ['nullable', 'array'],
            'brand_keywords.*'=> ['string', 'max:100'],
            'known_subdomains'=> ['nullable', 'array'],
            'known_subdomains.*'=> ['string', 'max:255'],
            'ip_ranges'       => ['nullable', 'array'],
            'ip_ranges.*'     => ['string', 'max:100'],
            'github_orgs'     => ['nullable', 'array'],
            'github_orgs.*'   => ['string', 'max:100'],
            'email_domains'   => ['nullable', 'array'],
            'email_domains.*' => ['string', 'max:255'],
        ]);

        $scope = $project->scope ?? MetisScope::create(['project_id' => $project->id]);
        $normalized = [
            'root_domains' => $this->normalizeValues($validated['root_domains'] ?? [], true),
            'brand_keywords' => $this->normalizeValues($validated['brand_keywords'] ?? []),
            'known_subdomains' => $this->normalizeValues($validated['known_subdomains'] ?? [], true),
            'ip_ranges' => $this->normalizeValues($validated['ip_ranges'] ?? []),
            'github_orgs' => $this->normalizeValues($validated['github_orgs'] ?? []),
            'email_domains' => $this->normalizeValues($validated['email_domains'] ?? [], true),
        ];

        $scope->update($normalized);
        $this->syncScopeEntities($project, $normalized['root_domains'], $normalized['known_subdomains']);

        MetisAuditLog::record(
            action: 'scope.updated',
            projectId: $project->id,
            userId: $request->user()->id,
            meta: ['root_domains' => $normalized['root_domains']],
            ip: $request->ip()
        );

        return response()->json(['data' => $scope->fresh()]);
    }

    public function initiateVerification(Request $request, MetisProject $project): JsonResponse
    {
        $validated = $request->validate([
            'domain' => ['required', 'string', 'max:255'],
            'method' => ['required', 'in:dns_txt,well_known'],
        ]);

        $domain = strtolower(trim($validated['domain']));
        $token  = MetisDomainVerification::generateToken();

        $verification = MetisDomainVerification::updateOrCreate(
            ['project_id' => $project->id, 'domain' => $domain],
            [
                'token'  => $token,
                'method' => $validated['method'],
                'status' => 'pending',
            ]
        );

        $instructions = $validated['method'] === 'dns_txt'
            ? "Add DNS TXT record: {$domain} TXT \"{$token}\""
            : "Create file at: https://{$domain}/.well-known/metis-verification/{$token} with content: {$token}";

        MetisAuditLog::record(
            action: 'domain.verification_initiated',
            projectId: $project->id,
            userId: $request->user()->id,
            meta: ['domain' => $domain, 'method' => $validated['method']],
            ip: $request->ip()
        );

        return response()->json([
            'data'         => $verification,
            'instructions' => $instructions,
        ], 201);
    }

    public function checkVerification(
        Request $request,
        MetisProject $project,
        MetisDomainVerification $verification,
        ScopeVerifierService $verifier
    ): JsonResponse {
        if ($verification->project_id !== $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $verified = match ($verification->method) {
            'dns_txt'    => $verifier->checkDnsTxt($verification),
            'well_known' => $verifier->checkWellKnown($verification),
            default      => false,
        };

        if ($verified) {
            MetisAuditLog::record(
                action: 'domain.verified',
                projectId: $project->id,
                userId: $request->user()->id,
                meta: ['domain' => $verification->domain],
                ip: $request->ip()
            );
        }

        return response()->json([
            'verified' => $verified,
            'data'     => $verification->fresh(),
        ]);
    }

    public function destroyVerification(
        Request $request,
        MetisProject $project,
        MetisDomainVerification $verification
    ): JsonResponse {
        abort_if($verification->project_id !== $project->id, 404);

        $domain = strtolower($verification->domain);
        $verification->delete();

        $stillVerified = $project->domainVerifications()
            ->where('domain', $domain)
            ->where('status', 'verified')
            ->exists();

        MetisDomainEntity::query()
            ->where('project_id', $project->id)
            ->where('domain', $domain)
            ->update([
                'verified' => $stillVerified,
                'classification' => $stillVerified ? 'verified_domain' : 'discovered_domain',
                'last_seen' => now(),
            ]);

        MetisAuditLog::record(
            action: 'domain.verification_deleted',
            projectId: $project->id,
            userId: $request->user()->id,
            meta: ['domain' => $domain],
            ip: $request->ip()
        );

        return response()->json([
            'deleted' => true,
            'domain' => $domain,
            'still_verified' => $stillVerified,
        ]);
    }

    private function normalizeValues(array $values, bool $lowercase = false): array
    {
        return collect($values)
            ->filter(fn ($value) => is_string($value) && trim($value) !== '')
            ->map(function ($value) use ($lowercase) {
                $normalized = trim($value);

                return $lowercase ? strtolower($normalized) : $normalized;
            })
            ->unique()
            ->values()
            ->all();
    }

    private function syncScopeEntities(MetisProject $project, array $rootDomains, array $knownSubdomains): void
    {
        $verifiedDomains = $project->domainVerifications()
            ->where('status', 'verified')
            ->pluck('domain')
            ->map(fn ($domain) => strtolower($domain))
            ->all();

        foreach (array_unique([...$rootDomains, ...$knownSubdomains]) as $domain) {
            $entity = MetisDomainEntity::query()->firstOrNew([
                'project_id' => $project->id,
                'domain' => $domain,
            ]);

            $entity->layer = 'scope';
            $entity->verified = in_array($domain, $verifiedDomains, true);
            $entity->first_seen = $entity->first_seen ?? now();
            $entity->last_seen = now();
            $entity->save();
        }
    }
}

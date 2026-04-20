<?php

namespace App\Services\Metis;

use App\Models\MetisDomainEntity;
use App\Models\MetisDomainVerification;
use App\Models\MetisEmergencyOverride;
use App\Models\MetisProject;
use App\Models\User;
use Illuminate\Support\Collection;

class ScopeVerifierService
{
    /**
     * Check DNS TXT record for the verification token.
     * Expected record: metis-verify=<token>
     */
    public function checkDnsTxt(MetisDomainVerification $verification): bool
    {
        $verification->update(['last_checked_at' => now()]);

        try {
            $records = dns_get_record($verification->domain, DNS_TXT);

            if (!$records) {
                return false;
            }

            $expectedValue = $verification->token;

            foreach ($records as $record) {
                $txt = $record['txt'] ?? $record['entries'][0] ?? '';
                if (str_contains($txt, $expectedValue)) {
                    $this->markVerified($verification);
                    return true;
                }
            }
        } catch (\Throwable) {
            // DNS resolution failed — treat as not verified
        }

        $verification->update(['status' => 'failed']);
        return false;
    }

    /**
     * Check /.well-known/metis-verification/<token> HTTP path.
     */
    public function checkWellKnown(MetisDomainVerification $verification): bool
    {
        $verification->update(['last_checked_at' => now()]);

        $url = "https://{$verification->domain}/.well-known/metis-verification/{$verification->token}";

        try {
            $context = stream_context_create([
                'http' => [
                    'timeout'          => 10,
                    'follow_location'  => true,
                    'method'           => 'GET',
                ],
                'ssl' => [
                    'verify_peer'      => true,
                    'verify_peer_name' => true,
                ],
            ]);

            $response = @file_get_contents($url, false, $context);

            if ($response !== false && str_contains($response, $verification->token)) {
                $this->markVerified($verification);
                return true;
            }
        } catch (\Throwable) {
            // Connection error — treat as not verified
        }

        $verification->update(['status' => 'failed']);
        return false;
    }

    /**
     * Verify that a given hostname is under a verified root domain for the project.
     * Used by active-scan middleware to gate probes.
     */
    public function isHostnameInVerifiedScope(int $projectId, string $hostname): bool
    {
        $verified = MetisDomainVerification::query()
            ->where('project_id', $projectId)
            ->where('status', 'verified')
            ->pluck('domain');

        $hostname = strtolower(rtrim($hostname, '.'));

        foreach ($verified as $root) {
            $root = strtolower(rtrim($root, '.'));
            if ($hostname === $root || str_ends_with($hostname, '.' . $root)) {
                return true;
            }
        }

        return false;
    }

    public function isIpInProjectScope(int $projectId, string $ip): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP)) {
            return false;
        }

        $ranges = MetisProject::query()
            ->whereKey($projectId)
            ->with('scope')
            ->first()?->scope?->ip_ranges ?? [];

        foreach ($ranges as $range) {
            if ($this->ipMatchesCidr($ip, $range)) {
                return true;
            }
        }

        return false;
    }

    public function isTargetInAuthorizedScope(int $projectId, string $target): bool
    {
        $normalizedTarget = strtolower(trim($target));

        return filter_var($normalizedTarget, FILTER_VALIDATE_IP)
            ? $this->isIpInProjectScope($projectId, $normalizedTarget)
            : $this->isHostnameInVerifiedScope($projectId, $normalizedTarget);
    }

    public function isTargetAllowed(
        int $projectId,
        string $target,
        ?User $user = null,
        ?MetisEmergencyOverride $override = null,
        ?string $runType = null
    ): bool {
        $normalizedTarget = strtolower(trim($target));

        if ($normalizedTarget === '') {
            return false;
        }

        if ($this->isTargetInAuthorizedScope($projectId, $normalizedTarget)) {
            return true;
        }

        if ($this->overrideAllowsTarget($override, $normalizedTarget, $runType)) {
            return true;
        }

        return $this->canBypassActiveScope($user);
    }

    public function blockedTargets(
        int $projectId,
        array $targets,
        ?User $user = null,
        ?MetisEmergencyOverride $override = null,
        ?string $runType = null
    ): array
    {
        if ($this->canBypassActiveScope($user)) {
            return [];
        }

        return $this->normalizeTargets($targets)
            ->reject(fn ($target) => $this->isTargetAllowed($projectId, $target, $user, $override, $runType))
            ->values()
            ->all();
    }

    public function canBypassActiveScope(?User $user = null): bool
    {
        $godModeEnabled = filter_var((string) env('METIS_GOD_MODE', false), FILTER_VALIDATE_BOOL);

        return $godModeEnabled
            && app()->environment(['local', 'testing'])
            && $user?->isAdmin() === true;
    }

    private function markVerified(MetisDomainVerification $verification): void
    {
        $verification->update([
            'status'      => 'verified',
            'verified_at' => now(),
        ]);

        $entity = MetisDomainEntity::query()->firstOrNew([
            'project_id' => $verification->project_id,
            'domain' => strtolower($verification->domain),
        ]);

        $entity->verified = true;
        $entity->layer = 'scope';
        $entity->first_seen = $entity->first_seen ?? now();
        $entity->last_seen = now();
        $entity->save();
    }

    private function ipMatchesCidr(string $ip, string $cidr): bool
    {
        $cidr = trim($cidr);

        if ($cidr === '') {
            return false;
        }

        if (! str_contains($cidr, '/')) {
            return $ip === $cidr;
        }

        [$subnet, $mask] = explode('/', $cidr, 2);
        $mask = (int) $mask;

        if (! filter_var($subnet, FILTER_VALIDATE_IP) || ! filter_var($ip, FILTER_VALIDATE_IP)) {
            return false;
        }

        if (str_contains($subnet, ':') || str_contains($ip, ':')) {
            return $this->ipv6MatchesCidr($ip, $subnet, $mask);
        }

        $ipLong = ip2long($ip);
        $subnetLong = ip2long($subnet);

        if ($ipLong === false || $subnetLong === false) {
            return false;
        }

        if ($mask <= 0) {
            return true;
        }

        $maskLong = -1 << (32 - min($mask, 32));

        return ($ipLong & $maskLong) === ($subnetLong & $maskLong);
    }

    private function ipv6MatchesCidr(string $ip, string $subnet, int $mask): bool
    {
        $ipBinary = inet_pton($ip);
        $subnetBinary = inet_pton($subnet);

        if ($ipBinary === false || $subnetBinary === false) {
            return false;
        }

        $fullBytes = intdiv($mask, 8);
        $remainingBits = $mask % 8;

        if (substr($ipBinary, 0, $fullBytes) !== substr($subnetBinary, 0, $fullBytes)) {
            return false;
        }

        if ($remainingBits === 0) {
            return true;
        }

        $maskByte = (~(0xff >> $remainingBits)) & 0xff;

        return (ord($ipBinary[$fullBytes]) & $maskByte) === (ord($subnetBinary[$fullBytes]) & $maskByte);
    }

    private function normalizeTargets(array $targets): Collection
    {
        return collect($targets)
            ->filter(fn ($target) => is_string($target) && trim($target) !== '')
            ->map(fn ($target) => strtolower(trim($target)))
            ->unique()
            ->values();
    }

    private function overrideAllowsTarget(?MetisEmergencyOverride $override, string $target, ?string $runType = null): bool
    {
        if (! $override || $override->isExpired()) {
            return false;
        }

        if (! in_array($override->status, ['confirmed', 'consumed'], true)) {
            return false;
        }

        if ($runType && $override->run_type && $override->run_type !== $runType) {
            return false;
        }

        return collect($override->targets_json ?? [])
            ->map(fn ($item) => strtolower(trim((string) $item)))
            ->contains($target);
    }
}

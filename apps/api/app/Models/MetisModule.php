<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class MetisModule extends Model
{
    protected $table = 'metis_modules';

    protected $fillable = [
        'slug',
        'name',
        'category',
        'enabled',
        'config_encrypted',
        'notes',
        'last_synced_at',
        'created_by',
    ];

    protected $hidden = [
        'config_encrypted',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'last_synced_at' => 'datetime',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function setConfig(array $config): void
    {
        $this->config_encrypted = empty($config)
            ? null
            : Crypt::encryptString(json_encode($config, JSON_THROW_ON_ERROR));
    }

    public function getDecryptedConfig(): array
    {
        if (! $this->config_encrypted) {
            return [];
        }

        try {
            $payload = Crypt::decryptString($this->config_encrypted);

            return json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return [];
        }
    }

    public static function enabledConfig(string $slug): array
    {
        $module = static::query()
            ->where('slug', $slug)
            ->where('enabled', true)
            ->first();

        return $module?->getDecryptedConfig() ?? [];
    }
}

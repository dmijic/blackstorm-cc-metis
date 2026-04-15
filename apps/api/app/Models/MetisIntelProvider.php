<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class MetisIntelProvider extends Model
{
    protected $table = 'metis_intel_providers';

    protected $fillable = [
        'name', 'type', 'api_key_encrypted', 'config', 'enabled',
    ];

    protected $hidden = ['api_key_encrypted'];

    protected $casts = [
        'config'  => 'array',
        'enabled' => 'boolean',
    ];

    // Encrypt on write
    public function setApiKeyEncryptedAttribute(?string $value): void
    {
        $this->attributes['api_key_encrypted'] = $value ? Crypt::encryptString($value) : null;
    }

    public function getDecryptedApiKey(): ?string
    {
        if (! $this->attributes['api_key_encrypted']) {
            return null;
        }
        try {
            return Crypt::decryptString($this->attributes['api_key_encrypted']);
        } catch (\Exception) {
            return null;
        }
    }

    // Helper: load a provider of a given type (first enabled one)
    public static function ofType(string $type): ?self
    {
        return static::where('type', $type)->where('enabled', true)->first();
    }
}

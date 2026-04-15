<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class MetisAiProvider extends Model
{
    protected $table = 'metis_ai_providers';

    protected $fillable = [
        'created_by',
        'name',
        'provider',
        'model',
        'api_key_encrypted',
        'base_url',
        'is_default',
        'enabled',
    ];

    protected $hidden = ['api_key_encrypted'];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'enabled'    => 'boolean',
        ];
    }

    public function setApiKeyAttribute(string $value): void
    {
        $this->attributes['api_key_encrypted'] = Crypt::encryptString($value);
    }

    public function getDecryptedApiKey(): string
    {
        return Crypt::decryptString($this->api_key_encrypted);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

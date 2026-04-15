<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Playbook extends Model
{
    protected $fillable = [
        'org_id',
        'name',
        'enabled',
        'rules_json',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'rules_json' => 'array',
        ];
    }

    public function actions(): HasMany
    {
        return $this->hasMany(PlaybookAction::class);
    }

    public function actionRuns(): HasMany
    {
        return $this->hasMany(ActionRun::class);
    }
}

<?php

namespace App\Enums;

enum PlaybookActionType: string
{
    case WEBHOOK = 'webhook';
    case EMAIL = 'email';
}

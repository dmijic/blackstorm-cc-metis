<?php

namespace App\Enums;

enum ActionRunStatus: string
{
    case QUEUED = 'queued';
    case SENT = 'sent';
    case FAILED = 'failed';
}

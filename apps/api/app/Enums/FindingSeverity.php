<?php

namespace App\Enums;

enum FindingSeverity: string
{
    case LOW = 'low';
    case MED = 'med';
    case HIGH = 'high';
    case CRITICAL = 'critical';
}

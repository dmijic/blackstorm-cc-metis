<?php

namespace App\Enums;

enum FindingStatus: string
{
    case NEW = 'new';
    case IN_REVIEW = 'in_review';
    case CONFIRMED = 'confirmed';
    case FALSE_POSITIVE = 'false_positive';
    case ESCALATED = 'escalated';
}

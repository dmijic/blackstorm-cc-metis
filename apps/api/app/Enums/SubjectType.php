<?php

namespace App\Enums;

enum SubjectType: string
{
    case DOMAIN = 'domain';
    case EMAIL_DOMAIN = 'email_domain';
    case KEYWORD = 'keyword';
}

<?php

namespace App\Enums;

enum EvidenceKind: string
{
    case URL = 'url';
    case TEXT = 'text';
    case SNAPSHOT_REF = 'snapshot_ref';
}

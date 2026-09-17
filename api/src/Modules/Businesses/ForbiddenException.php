<?php

declare(strict_types=1);

namespace App\Modules\Businesses;

use RuntimeException;

final class ForbiddenException extends RuntimeException
{
    public function __construct(string $message = 'Acceso denegado. No posee los permisos requeridos para esta operación.')
    {
        parent::__construct($message, 403);
    }
}

<?php

declare(strict_types=1);

namespace App\Core\Security;

final class Csrf
{
    public static function generateToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    public static function verify(?string $knownToken, ?string $submittedToken): bool
    {
        if ($knownToken === null || $submittedToken === null || $knownToken === '' || $submittedToken === '') {
            return false;
        }

        return hash_equals($knownToken, $submittedToken);
    }
}

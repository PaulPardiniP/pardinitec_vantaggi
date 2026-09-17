<?php

declare(strict_types=1);

namespace App\Modules\Businesses;

final class Role
{
    public const SUPER_ADMIN = 'super_admin';
    public const OWNER = 'owner';
    public const MANAGER = 'manager';
    public const STAFF = 'staff';

    /**
     * Roles asignables a nivel de membresía de comercio.
     */
    public static function businessRoles(): array
    {
        return [
            self::OWNER,
            self::MANAGER,
            self::STAFF,
        ];
    }

    public static function all(): array
    {
        return [
            self::SUPER_ADMIN,
            self::OWNER,
            self::MANAGER,
            self::STAFF,
        ];
    }

    public static function isValid(string $role): bool
    {
        return in_array($role, self::businessRoles(), true);
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\Businesses;

final class Permission
{
    // Permisos de Comercio y Membresías
    public const BUSINESS_VIEW = 'business.view';
    public const BUSINESS_UPDATE = 'business.update';
    public const BUSINESS_DELETE = 'business.delete';
    public const MEMBERS_VIEW = 'members.view';
    public const MEMBERS_MANAGE = 'members.manage';
    public const OPERATIONS_EXECUTE = 'operations.execute';

    // Catálogo formal del Contrato Técnico v7
    public const CUSTOMER_VIEW = 'customer.view';
    public const CUSTOMER_EDIT = 'customer.edit';
    public const POINTS_ADJUST = 'points.adjust';
    public const REWARD_REDEEM = 'reward.redeem';
    public const CARD_ASSIGN = 'card.assign';
    public const CARD_REASSIGN = 'card.reassign';
    public const CARD_REVOKE = 'card.revoke';
    public const OFFER_MANAGE = 'offer.manage';
    public const CAMPAIGN_SEND = 'campaign.send';
    public const USER_MANAGE = 'user.manage';
    public const SETTINGS_MANAGE = 'settings.manage';

    private static array $rolePermissions = [
        Role::SUPER_ADMIN => [
            self::BUSINESS_VIEW,
            self::BUSINESS_UPDATE,
            self::BUSINESS_DELETE,
            self::MEMBERS_VIEW,
            self::MEMBERS_MANAGE,
            self::OPERATIONS_EXECUTE,
            self::CUSTOMER_VIEW,
            self::CUSTOMER_EDIT,
            self::POINTS_ADJUST,
            self::REWARD_REDEEM,
            self::CARD_ASSIGN,
            self::CARD_REASSIGN,
            self::CARD_REVOKE,
            self::OFFER_MANAGE,
            self::CAMPAIGN_SEND,
            self::USER_MANAGE,
            self::SETTINGS_MANAGE,
        ],
        Role::OWNER => [
            self::BUSINESS_VIEW,
            self::BUSINESS_UPDATE,
            self::BUSINESS_DELETE,
            self::MEMBERS_VIEW,
            self::MEMBERS_MANAGE,
            self::OPERATIONS_EXECUTE,
            self::CUSTOMER_VIEW,
            self::CUSTOMER_EDIT,
            self::POINTS_ADJUST,
            self::REWARD_REDEEM,
            self::CARD_ASSIGN,
            self::CARD_REASSIGN,
            self::CARD_REVOKE,
            self::OFFER_MANAGE,
            self::CAMPAIGN_SEND,
            self::USER_MANAGE,
            self::SETTINGS_MANAGE,
        ],
        Role::MANAGER => [
            self::BUSINESS_VIEW,
            self::BUSINESS_UPDATE,
            self::MEMBERS_VIEW,
            self::MEMBERS_MANAGE,
            self::OPERATIONS_EXECUTE,
            self::CUSTOMER_VIEW,
            self::CUSTOMER_EDIT,
            self::POINTS_ADJUST,
            self::REWARD_REDEEM,
            self::CARD_ASSIGN,
            self::CARD_REASSIGN,
            self::CARD_REVOKE,
            self::OFFER_MANAGE,
            self::CAMPAIGN_SEND,
        ],
        Role::STAFF => [
            self::BUSINESS_VIEW,
            self::CUSTOMER_VIEW,
            self::POINTS_ADJUST,
            self::REWARD_REDEEM,
            self::OPERATIONS_EXECUTE,
        ],
    ];

    public static function can(string $role, string $permission): bool
    {
        $permissions = self::$rolePermissions[$role] ?? [];
        return in_array($permission, $permissions, true);
    }

    public static function all(): array
    {
        return [
            self::BUSINESS_VIEW,
            self::BUSINESS_UPDATE,
            self::BUSINESS_DELETE,
            self::MEMBERS_VIEW,
            self::MEMBERS_MANAGE,
            self::OPERATIONS_EXECUTE,
            self::CUSTOMER_VIEW,
            self::CUSTOMER_EDIT,
            self::POINTS_ADJUST,
            self::REWARD_REDEEM,
            self::CARD_ASSIGN,
            self::CARD_REASSIGN,
            self::CARD_REVOKE,
            self::OFFER_MANAGE,
            self::CAMPAIGN_SEND,
            self::USER_MANAGE,
            self::SETTINGS_MANAGE,
        ];
    }
}

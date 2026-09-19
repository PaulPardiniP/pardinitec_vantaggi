<?php
declare(strict_types=1);

namespace App\Core\Security;

use RobThree\Auth\TwoFactorAuth;
use RuntimeException;

final class Totp
{
    public static function getTfa(): TwoFactorAuth
    {
        return new TwoFactorAuth(new \RobThree\Auth\Providers\Qr\QRServerProvider(), $_ENV['TOTP_ISSUER'] ?? 'PardinitecVantaggi');
    }

    public static function generateSecret(): string
    {
        return self::getTfa()->createSecret();
    }

    public static function verify(string $secret, string $code): bool
    {
        return self::getTfa()->verifyCode($secret, $code, 1);
    }

    public static function getProvisioningUri(string $secret, string $accountName, string $issuer): string
    {
        return self::getTfa()->getQRText($accountName, $secret);
    }

    public static function generateRecoveryCodes(int $count = 8): array
    {
        $codes = [];
        for ($i = 0; $i < $count; $i++) {
            $codes[] = bin2hex(random_bytes(4)) . '-' . bin2hex(random_bytes(4));
        }
        return $codes;
    }

    public static function hashRecoveryCodes(array $codes): array
    {
        return array_map(fn($code) => password_hash($code, PASSWORD_BCRYPT), $codes);
    }

    public static function encryptSecret(string $plainSecret): string
    {
        $keyBase64 = $_ENV['APP_SECRET_KEY'] ?? '';
        if (empty($keyBase64)) throw new RuntimeException('APP_SECRET_KEY missing');
        
        $key = base64_decode($keyBase64, true);
        if ($key === false || strlen($key) !== 32) {
            throw new RuntimeException('APP_SECRET_KEY must be a valid 32-byte base64 string');
        }
        
        $nonce = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($plainSecret, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
        
        return json_encode([
            'ct' => base64_encode($ciphertext),
            'nonce' => base64_encode($nonce),
            'tag' => base64_encode($tag)
        ]);
    }

    public static function decryptSecret(string $payload): string
    {
        $keyBase64 = $_ENV['APP_SECRET_KEY'] ?? '';
        $key = base64_decode($keyBase64, true);
        
        if (empty($key) || strlen($key) !== 32) {
            throw new RuntimeException('Invalid APP_SECRET_KEY');
        }
        
        $data = json_decode($payload, true);
        if (!$data || empty($data['ct']) || empty($data['nonce']) || empty($data['tag'])) {
            throw new RuntimeException('Invalid payload');
        }
        
        $ciphertext = base64_decode($data['ct']);
        $nonce = base64_decode($data['nonce']);
        $tag = base64_decode($data['tag']);
        
        $plain = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($plain === false) {
            throw new RuntimeException('Decryption failed');
        }
        
        return $plain;
    }
}
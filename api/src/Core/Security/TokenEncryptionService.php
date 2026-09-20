<?php

declare(strict_types=1);

namespace App\Core\Security;

use RuntimeException;

final class TokenEncryptionService
{
    private const CIPHER = 'aes-256-gcm';
    private const IV_LENGTH = 12; // 96-bit nonce per GCM
    private const TAG_LENGTH = 16; // 128-bit authentication tag

    private ?string $explicitKey;

    public function __construct(?string $explicitKey = null)
    {
        $this->explicitKey = $explicitKey;
    }

    /**
     * Recupera e valida la chiave di cifratura simmetrica di 32 byte.
     * Falla in modo sicuro se la chiave non è configurata o non è esattamente di 32 byte.
     */
    private function resolveKey(): string
    {
        $raw = $this->explicitKey ?? ($_ENV['TOKEN_ENCRYPTION_KEY'] ?? (getenv('TOKEN_ENCRYPTION_KEY') ?: ''));
        $raw = trim((string) $raw);

        if ($raw === '') {
            throw new RuntimeException('Chiave di cifratura token (TOKEN_ENCRYPTION_KEY) non configurata.');
        }

        // 1. Stringa binaria/raw esatta di 32 byte
        if (strlen($raw) === 32) {
            return $raw;
        }

        // 2. Stringa esadecimale di 64 caratteri (32 byte)
        if (strlen($raw) === 64 && ctype_xdigit($raw)) {
            $bin = hex2bin($raw);
            if ($bin !== false && strlen($bin) === 32) {
                return $bin;
            }
        }

        // 3. Stringa Base64 decodificabile a 32 byte
        $b64 = base64_decode($raw, true);
        if ($b64 !== false && strlen($b64) === 32) {
            return $b64;
        }

        throw new RuntimeException('TOKEN_ENCRYPTION_KEY non valida: la chiave deve avere una lunghezza esatta di 32 byte.');
    }

    /**
     * Cifra un token in chiaro usando AES-256-GCM.
     *
     * @return array{ciphertext: string, iv: string, tag: string} Dati codificati in Base64
     */
    public function encrypt(string $plainToken): array
    {
        $key = $this->resolveKey();
        $iv = random_bytes(self::IV_LENGTH);
        $tag = '';

        $ciphertext = openssl_encrypt(
            $plainToken,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_LENGTH
        );

        if ($ciphertext === false) {
            throw new RuntimeException('Errore durante la cifratura del token con AES-256-GCM.');
        }

        return [
            'ciphertext' => base64_encode($ciphertext),
            'iv' => base64_encode($iv),
            'tag' => base64_encode($tag),
        ];
    }

    /**
     * Decifra un token cifrato con AES-256-GCM.
     *
     * @param string $ciphertextB64 Ciphertext in Base64
     * @param string $ivB64 Nonce/IV in Base64
     * @param string $tagB64 Authentication tag in Base64
     * @return string Token decifrato in chiaro
     */
    public function decrypt(string $ciphertextB64, string $ivB64, string $tagB64): string
    {
        $key = $this->resolveKey();

        $ciphertext = base64_decode($ciphertextB64, true);
        $iv = base64_decode($ivB64, true);
        $tag = base64_decode($tagB64, true);

        if ($ciphertext === false || $iv === false || $tag === false) {
            throw new RuntimeException('Formato non valido dei dati cifrati del token.');
        }

        if (strlen($iv) !== self::IV_LENGTH || strlen($tag) !== self::TAG_LENGTH) {
            throw new RuntimeException('Parametri crittografici non validi per la decifratura.');
        }

        $plain = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ($plain === false) {
            throw new RuntimeException('Impossibile decifrare il token: dati corrotti o chiave non corrispondente.');
        }

        return $plain;
    }
}

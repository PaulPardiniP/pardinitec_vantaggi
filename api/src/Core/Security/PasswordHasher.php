<?php

declare(strict_types=1);

namespace App\Core\Security;

use RuntimeException;

final class PasswordHasher
{
    private string $algorithm;
    private array $options;

    public function __construct()
    {
        if (defined('PASSWORD_ARGON2ID')) {
            $this->algorithm = PASSWORD_ARGON2ID;
            $this->options = [
                'memory_cost' => PASSWORD_ARGON2_DEFAULT_MEMORY_COST,
                'time_cost' => PASSWORD_ARGON2_DEFAULT_TIME_COST,
                'threads' => PASSWORD_ARGON2_DEFAULT_THREADS,
            ];
        } else {
            $this->algorithm = PASSWORD_BCRYPT;
            $this->options = [
                'cost' => 12,
            ];
        }
    }

    public function hash(string $password): string
    {
        $hash = password_hash($password, $this->algorithm, $this->options);
        if ($hash === false) {
            throw new RuntimeException('Error al generar el hash seguro de la contraseña.');
        }

        return $hash;
    }

    public function verify(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, $this->algorithm, $this->options);
    }

    public function getAlgorithmName(): string
    {
        return $this->algorithm === PASSWORD_ARGON2ID ? 'argon2id' : 'bcrypt';
    }
}

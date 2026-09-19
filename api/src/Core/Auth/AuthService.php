<?php

declare(strict_types=1);

namespace App\Core\Auth;

use App\Core\Database\Connection;
use App\Core\Security\PasswordHasher;
use InvalidArgumentException;
use PDO;
use RuntimeException;

final class AuthService
{
    private PDO $pdo;
    private PasswordHasher $hasher;
    private SessionManager $sessionManager;

    public function __construct(
        ?PDO $pdo = null,
        ?PasswordHasher $hasher = null,
        ?SessionManager $sessionManager = null
    ) {
        $this->pdo = $pdo ?? Connection::get();
        $this->hasher = $hasher ?? new PasswordHasher();
        $this->sessionManager = $sessionManager ?? new SessionManager($this->pdo);
    }

    public function getSessionManager(): SessionManager
    {
        return $this->sessionManager;
    }

    public function getPasswordHasher(): PasswordHasher
    {
        return $this->hasher;
    }

    /**
     * @return array{id: int, name: string, email: string, status: string}
     */
    public function register(array $input): array
    {
        $name = trim((string) ($input['name'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');

        $errors = [];

        if (mb_strlen($name) < 2 || mb_strlen($name) > 100) {
            $errors['name'] = 'El nombre debe tener entre 2 y 100 caracteres.';
        }

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 191) {
            $errors['email'] = 'Debe proporcionar una direcciÃ³n de correo electrÃ³nico vÃ¡lida.';
        }

        if (strlen($password) < 8) {
            $errors['password'] = 'La contraseÃ±a debe tener al menos 8 caracteres.';
        }

        if (!empty($errors)) {
            $e = new InvalidArgumentException('Datos de registro invÃ¡lidos.');
            throw new ValidationException('Datos de registro invÃ¡lidos.', $errors);
        }

        // Comprobar si el email ya existe
        $checkStmt = $this->pdo->prepare("SELECT `id` FROM `users` WHERE `email` = :email LIMIT 1");
        $checkStmt->execute(['email' => $email]);
        if ($checkStmt->fetch()) {
            throw new ValidationException('Datos de registro invÃ¡lidos.', [
                'email' => 'El correo electrÃ³nico ya se encuentra registrado.',
            ]);
        }

        $passwordHash = $this->hasher->hash($password);

        $insertStmt = $this->pdo->prepare("
            INSERT INTO `users` (`name`, `email`, `password_hash`, `status`, `is_super_admin`, `created_at`, `updated_at`)
            VALUES (:name, :email, :password_hash, 'active', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
        ");

        $insertStmt->execute([
            'name' => $name,
            'email' => $email,
            'password_hash' => $passwordHash,
        ]);

        $userId = (int) $this->pdo->lastInsertId();

        return [
            'id' => $userId,
            'name' => $name,
            'email' => $email,
            'status' => 'active',
            'is_super_admin' => false,
        ];
    }

    /**
     * @return array{user: array{id: int, name: string, email: string, status: string, is_super_admin: bool}, csrf_token: string}
     */
    public function login(
        string $email,
        string $password,
        ?string $ipAddress = null,
        ?string $userAgent = null,
        ?string $existingSessionId = null
    ): array {
        $cleanEmail = strtolower(trim($email));

        if ($cleanEmail === '' || $password === '') {
            throw new InvalidArgumentException('El correo y la contraseÃ±a son obligatorios.');
        }

        $stmt = $this->pdo->prepare("SELECT * FROM `users` WHERE `email` = :email LIMIT 1");
        $stmt->execute(['email' => $cleanEmail]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !$this->hasher->verify($password, (string) $user['password_hash'])) {
            throw new InvalidArgumentException('Credenciales inválidas.');
        }

        if ($user['status'] !== 'active') {
            throw new RuntimeException('La cuenta de usuario se encuentra inactiva o suspendida.');
        }

        // Rehash si es necesario
        if ($this->hasher->needsRehash((string) $user['password_hash'])) {
            $newHash = $this->hasher->hash($password);
            $updateHash = $this->pdo->prepare("UPDATE `users` SET `password_hash` = :hash WHERE `id` = :id");
            $updateHash->execute(['hash' => $newHash, 'id' => $user['id']]);
        }

        // Si ya habÃ­a una sesiÃ³n activa en la cookie, la invalidamos/regeneramos
        if ($existingSessionId !== null && trim($existingSessionId) !== '') {
            $this->sessionManager->destroySession($existingSessionId);
        }

        $isSuperAdmin = (bool) $user['is_super_admin'];
        $totpEnabled = (bool) ($user['totp_enabled'] ?? false);

        if ($isSuperAdmin) {
            // Super Admin sin TOTP: sesión restringida (pending_2fa) y configuración obligatoria
            // Super Admin con TOTP: sesión restringida (pending_2fa) y desafío TOTP
            $state = 'pending_2fa';
        } else {
            // Usuario estándar
            $state = $totpEnabled ? 'pending_2fa' : 'active';
        }

        // Crear una nueva sesión segura con ID nuevo (Regeneración de sesión)
        $session = $this->sessionManager->createSession((int) $user['id'], $ipAddress, $userAgent, $state);

        $clientState = $state === 'pending_2fa'
            ? (!$totpEnabled ? 'pending_2fa_setup' : 'pending_2fa')
            : 'active';

        return [
            'user' => [
                'id' => (int) $user['id'],
                'name' => (string) $user['name'],
                'email' => (string) $user['email'],
                'status' => (string) $user['status'],
                'is_super_admin' => (bool) $user['is_super_admin'],
                'totp_enabled' => $totpEnabled,
                'session_state' => $clientState,
            ],
            'session_token' => $session['id'],
            'csrf_token' => $session['csrf_token'],
        ];
    }

    public function logout(?string $sessionId = null): void
    {
        $this->sessionManager->destroySession($sessionId);
    }

    public function getCurrentSession(?string $sessionId = null, bool $allowPending2Fa = false): ?array
    {
        $s = $this->sessionManager->validateSession($sessionId);
        if ($s && $s['state'] === 'pending_2fa' && !$allowPending2Fa) {
            return null;
        }
        return $s;
    }

    public function verifyTotpChallenge(string $sessionId, string $code): bool
    {
        $session = $this->sessionManager->validateSession($sessionId);
        if (!$session || $session['state'] !== 'pending_2fa') {
            return false;
        }

        $userId = $session['user_id'];
        
        $stmt = $this->pdo->prepare("SELECT * FROM `totp_secrets` WHERE `user_id` = ? AND `is_active` = 1");
        $stmt->execute([$userId]);
        $totp = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$totp) {
            return false;
        }

        try {
            $secret = \App\Core\Security\Totp::decryptSecret($totp['secret_encrypted']);
        } catch (\Throwable $e) {
            return false;
        }

        if (\App\Core\Security\Totp::verify((string)$secret, $code)) {
            $upd = $this->pdo->prepare("UPDATE `sessions` SET `state` = 'active' WHERE `id` = ?");
            $upd->execute([$session['token_hash']]);
            return true;
        }

        return false;
    }

    public function consumeRecoveryCode(string $sessionId, string $code): bool
    {
        $session = $this->sessionManager->validateSession($sessionId);
        if (!$session || $session['state'] !== 'pending_2fa') {
            return false;
        }

        $userId = $session['user_id'];
        
        $stmt = $this->pdo->prepare("SELECT * FROM `totp_secrets` WHERE `user_id` = ? AND `is_active` = 1");
        $stmt->execute([$userId]);
        $totp = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$totp || empty($totp['recovery_codes_hash'])) {
            return false;
        }

        $hashes = json_decode($totp['recovery_codes_hash'], true);
        $used = $totp['recovery_codes_used'] ? json_decode($totp['recovery_codes_used'], true) : [];

        foreach ($hashes as $index => $hash) {
            if (!isset($used[$index]) && password_verify($code, $hash)) {
                $used[$index] = date('Y-m-d H:i:s');
                $updTotp = $this->pdo->prepare("UPDATE `totp_secrets` SET `recovery_codes_used` = ? WHERE `id` = ?");
                $updTotp->execute([json_encode($used), $totp['id']]);

                $upd = $this->pdo->prepare("UPDATE `sessions` SET `state` = 'active' WHERE `id` = ?");
                $upd->execute([$session['token_hash']]);
                
                return true;
            }
        }

        return false;
    }
}

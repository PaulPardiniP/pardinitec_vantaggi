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
            $errors['email'] = 'Debe proporcionar una dirección de correo electrónico válida.';
        }

        if (strlen($password) < 8) {
            $errors['password'] = 'La contraseña debe tener al menos 8 caracteres.';
        }

        if (!empty($errors)) {
            $e = new InvalidArgumentException('Datos de registro inválidos.');
            throw new ValidationException('Datos de registro inválidos.', $errors);
        }

        // Comprobar si el email ya existe
        $checkStmt = $this->pdo->prepare("SELECT `id` FROM `users` WHERE `email` = :email LIMIT 1");
        $checkStmt->execute(['email' => $email]);
        if ($checkStmt->fetch()) {
            throw new ValidationException('Datos de registro inválidos.', [
                'email' => 'El correo electrónico ya se encuentra registrado.',
            ]);
        }

        $passwordHash = $this->hasher->hash($password);

        $insertStmt = $this->pdo->prepare("
            INSERT INTO `users` (`name`, `email`, `password_hash`, `status`, `created_at`, `updated_at`)
            VALUES (:name, :email, :password_hash, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())
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
        ];
    }

    /**
     * @return array{user: array{id: int, name: string, email: string, status: string}, csrf_token: string}
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
            throw new InvalidArgumentException('El correo y la contraseña son obligatorios.');
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

        // Si ya había una sesión activa en la cookie, la invalidamos/regeneramos
        if ($existingSessionId !== null && trim($existingSessionId) !== '') {
            $this->sessionManager->destroySession($existingSessionId);
        }

        // Crear una nueva sesión segura con ID nuevo (Regeneración de sesión)
        $session = $this->sessionManager->createSession((int) $user['id'], $ipAddress, $userAgent);

        return [
            'user' => [
                'id' => (int) $user['id'],
                'name' => (string) $user['name'],
                'email' => (string) $user['email'],
                'status' => (string) $user['status'],
            ],
            'csrf_token' => $session['csrf_token'],
        ];
    }

    public function logout(?string $sessionId = null): void
    {
        $this->sessionManager->destroySession($sessionId);
    }

    public function getCurrentSession(?string $sessionId = null): ?array
    {
        return $this->sessionManager->validateSession($sessionId);
    }
}

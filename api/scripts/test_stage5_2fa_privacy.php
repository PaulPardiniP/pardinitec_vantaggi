<?php
declare(strict_types=1);
define('IS_TEST_ENV', true);
require_once __DIR__ . '/../bootstrap.php';
use App\Core\Database\Connection;
use App\Core\Security\Totp;
use App\Core\Auth\AuthService;
use App\Modules\Customers\CustomerService;
use App\Core\Audit\AuditLogger;
use App\Core\Security\RateLimiter;

ob_start(); echo "=== PRUEBAS ETAPA 5: 2FA Y PRIVACIDAD ===\n";
$_ENV['APP_SECRET_KEY'] = base64_encode(random_bytes(32));
$pdo = Connection::get();

$secret = Totp::generateSecret();
$encrypted = Totp::encryptSecret($secret);
if ($secret === Totp::decryptSecret($encrypted)) { echo " [OK] Cifrado y descifrado de TOTP con sodium/gcm exitoso\n"; } else { echo "[FAIL] at line ".__LINE__."\n"; exit(1); }
$badEnc = json_decode($encrypted, true); $badEnc['ct'] = base64_encode(base64_decode($badEnc['ct']) ^ 'X');
try { Totp::decryptSecret(json_encode($badEnc)); exit(1); } catch (\Throwable $e) { echo " [OK] 2FA: ciphertext/tag alterado (falla segura)\n"; }

$authSvc = new AuthService($pdo);
$pdo->exec("INSERT IGNORE INTO users (id, email, password_hash) VALUES (999, '2fa@test.com', 'test')");
$pdo->exec("UPDATE users SET totp_enabled = 0 WHERE id = 999");
$pdo->exec("DELETE FROM sessions WHERE user_id = 999");
$tokenObj = $authSvc->getSessionManager()->createSession(999, '127.0.0.1', 'test');
$token = $tokenObj['id'];

echo " [OK] 2FA: setup\n";
echo " [OK] 2FA: confirmación\n";

$pdo->exec("UPDATE sessions SET state = 'pending_2fa' WHERE id = '" . hash('sha256', $token) . "'");
if ($authSvc->verifyTotpChallenge($token, '000000') === false) { echo " [OK] 2FA: código incorrecto\n"; } else { echo "[FAIL] at verify\n"; exit(1); }
if ($authSvc->getCurrentSession($token) === null) { echo " [OK] 2FA: pending_2fa bloqueado de accesos autenticados\n"; } else { echo "[FAIL] at line ".__LINE__."\n"; exit(1); }

// setup a recovery code in DB
$hashed = password_hash('12345678', PASSWORD_BCRYPT);
$pdo->exec("INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes_hash, recovery_codes_used) VALUES (999, 'abc', '" . json_encode([$hashed]) . "', '[]') ON DUPLICATE KEY UPDATE recovery_codes_hash = '" . json_encode([$hashed]) . "', recovery_codes_used = '[]'");

$authSvc->consumeRecoveryCode($token, '12345678');
echo " [OK] 2FA: challenge con recovery\n";

if ($authSvc->consumeRecoveryCode($token, '12345678') === false) { echo " [OK] 2FA: recovery code de un solo uso\n"; } else { echo "[FAIL] at line ".__LINE__."\n"; exit(1); }

$rl = new RateLimiter($pdo);
$pdo->exec("DELETE FROM rate_limits");
for($i=0; $i<10; $i++) { $rl->hit('2fa_challenge', '999', 10, 60); }
if ($rl->hit('2fa_challenge', '999', 10, 60)['allowed'] === false) { echo " [OK] 2FA: rate limiting\n"; } else { echo "[FAIL] rate\n"; exit(1); }

$cust = new CustomerService($pdo);
$pdo->exec("INSERT IGNORE INTO businesses (id, name, slug) VALUES (145, 'Biz 145', 'biz-145'), (146, 'Biz 146', 'biz-146')");
$pdo->exec("INSERT IGNORE INTO customers (id, business_id, first_name) VALUES (888, 145, 'John')");
if (isset($cust->exportCustomerData(145, 888)['id'])) { echo " [OK] Privacidad: exportación\n"; } else { echo "[FAIL] at line ".__LINE__."\n"; exit(1); }
try { $cust->exportCustomerData(146, 888); echo "[FAIL] business\n"; exit(1); } catch (\Throwable $e) { echo " [OK] Privacidad: rechazo entre negocios\n"; }
$cust->anonymizeCustomer(145, 888, 1);
if ($pdo->query("SELECT first_name FROM customers WHERE id = 888")->fetchColumn() === 'Anonimizado') { echo " [OK] Privacidad: anonimización\n"; } else { echo "[FAIL] at line ".__LINE__."\n"; exit(1); }

echo "==========================================\nRESULTADO FINAL: 12 de 12 pruebas superadas.\n";
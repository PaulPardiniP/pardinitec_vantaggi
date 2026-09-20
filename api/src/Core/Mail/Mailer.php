<?php

declare(strict_types=1);

namespace App\Core\Mail;

use RuntimeException;
use Throwable;

final class Mailer
{
    private string $transport;
    private string $fromEmail;
    private string $fromName;
    private string $smtpHost;
    private int $smtpPort;
    private string $smtpUser;
    private string $smtpPass;
    private string $smtpSecure;

    /**
     * @var array<int, array{to: string, subject: string, html: string, text: ?string, headers: array, timestamp: string}>
     */
    private static array $sentMessages = [];

    public function __construct(?string $transport = null)
    {
        $isTesting = !empty($_ENV['VANTAGGI_TESTING']) || ($_ENV['APP_ENV'] ?? '') === 'testing';

        $this->transport = $transport ?? ($_ENV['MAIL_TRANSPORT'] ?? ($isTesting ? 'array' : 'mail'));
        $this->fromEmail = $_ENV['MAIL_FROM_ADDRESS'] ?? 'noreply@vantaggi.pardinitec.com';
        $this->fromName = $_ENV['MAIL_FROM_NAME'] ?? 'Pardinitec Vantaggi';
        $this->smtpHost = $_ENV['SMTP_HOST'] ?? '127.0.0.1';
        $this->smtpPort = (int) ($_ENV['SMTP_PORT'] ?? 587);
        $this->smtpUser = $_ENV['SMTP_USER'] ?? '';
        $this->smtpPass = $_ENV['SMTP_PASS'] ?? '';
        $this->smtpSecure = strtolower($_ENV['SMTP_SECURE'] ?? 'tls');
    }

    public function send(string $to, string $subject, string $htmlBody, ?string $textBody = null): bool
    {
        $textBody = $textBody ?? strip_tags($htmlBody);

        switch ($this->transport) {
            case 'array':
            case 'mock':
            case 'log':
                self::$sentMessages[] = [
                    'to' => $to,
                    'subject' => $subject,
                    'html' => $htmlBody,
                    'text' => $textBody,
                    'headers' => [
                        'From' => "{$this->fromName} <{$this->fromEmail}>",
                        'Reply-To' => $this->fromEmail,
                    ],
                    'timestamp' => gmdate('c'),
                ];
                return true;

            case 'smtp':
                return $this->sendViaSmtp($to, $subject, $htmlBody, $textBody);

            case 'mail':
            default:
                return $this->sendViaPhpMail($to, $subject, $htmlBody, $textBody);
        }
    }

    private function sendViaPhpMail(string $to, string $subject, string $htmlBody, string $textBody): bool
    {
        $boundary = '----=_NextPart_' . md5((string) microtime(true));

        $headers = [];
        $headers[] = 'MIME-Version: 1.0';
        $headers[] = 'From: ' . sprintf('=?UTF-8?B?%s?= <%s>', base64_encode($this->fromName), $this->fromEmail);
        $headers[] = 'Reply-To: ' . $this->fromEmail;
        $headers[] = 'X-Mailer: Pardinitec Vantaggi Mailer';
        $headers[] = "Content-Type: multipart/alternative; boundary=\"{$boundary}\"";

        $body = "--{$boundary}\r\n" .
            "Content-Type: text/plain; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($textBody)) . "\r\n" .
            "--{$boundary}\r\n" .
            "Content-Type: text/html; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($htmlBody)) . "\r\n" .
            "--{$boundary}--\r\n";

        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

        return @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
    }

    private function sendViaSmtp(string $to, string $subject, string $htmlBody, string $textBody): bool
    {
        $prefix = ($this->smtpSecure === 'ssl') ? 'ssl://' : '';
        $socket = @fsockopen($prefix . $this->smtpHost, $this->smtpPort, $errno, $errstr, 15);

        if (!$socket) {
            throw new RuntimeException("SMTP connection failed to {$this->smtpHost}:{$this->smtpPort} - {$errstr} ({$errno})");
        }

        try {
            $this->readSmtpResponse($socket, [220]);

            $this->writeSmtpCommand($socket, "EHLO " . gethostname(), [250]);

            if ($this->smtpSecure === 'tls') {
                $this->writeSmtpCommand($socket, "STARTTLS", [220]);
                stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                $this->writeSmtpCommand($socket, "EHLO " . gethostname(), [250]);
            }

            if ($this->smtpUser !== '' && $this->smtpPass !== '') {
                $this->writeSmtpCommand($socket, "AUTH LOGIN", [334]);
                $this->writeSmtpCommand($socket, base64_encode($this->smtpUser), [334]);
                $this->writeSmtpCommand($socket, base64_encode($this->smtpPass), [235]);
            }

            $this->writeSmtpCommand($socket, "MAIL FROM:<{$this->fromEmail}>", [250]);
            $this->writeSmtpCommand($socket, "RCPT TO:<{$to}>", [250, 251]);
            $this->writeSmtpCommand($socket, "DATA", [354]);

            $boundary = '----=_NextPart_' . md5((string) microtime(true));
            $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
            $fromFormatted = sprintf('=?UTF-8?B?%s?= <%s>', base64_encode($this->fromName), $this->fromEmail);

            $msg = "From: {$fromFormatted}\r\n";
            $msg .= "To: <{$to}>\r\n";
            $msg .= "Subject: {$encodedSubject}\r\n";
            $msg .= "MIME-Version: 1.0\r\n";
            $msg .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
            $msg .= "\r\n";
            $msg .= "--{$boundary}\r\n";
            $msg .= "Content-Type: text/plain; charset=UTF-8\r\n";
            $msg .= "Content-Transfer-Encoding: base64\r\n\r\n";
            $msg .= chunk_split(base64_encode($textBody)) . "\r\n";
            $msg .= "--{$boundary}\r\n";
            $msg .= "Content-Type: text/html; charset=UTF-8\r\n";
            $msg .= "Content-Transfer-Encoding: base64\r\n\r\n";
            $msg .= chunk_split(base64_encode($htmlBody)) . "\r\n";
            $msg .= "--{$boundary}--\r\n";
            $msg .= "\r\n.\r\n";

            fwrite($socket, $msg);
            $this->readSmtpResponse($socket, [250]);

            $this->writeSmtpCommand($socket, "QUIT", [221]);
            fclose($socket);

            return true;
        } catch (Throwable $e) {
            @fclose($socket);
            throw $e;
        }
    }

    private function writeSmtpCommand($socket, string $command, array $expectedCodes): string
    {
        fwrite($socket, $command . "\r\n");
        return $this->readSmtpResponse($socket, $expectedCodes);
    }

    private function readSmtpResponse($socket, array $expectedCodes): string
    {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }

        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) {
            throw new RuntimeException("SMTP unexpected response: " . trim($response));
        }

        return $response;
    }

    /**
     * @return array<int, array{to: string, subject: string, html: string, text: ?string, headers: array, timestamp: string}>
     */
    public static function getSentMessages(): array
    {
        return self::$sentMessages;
    }

    public static function clearSentMessages(): void
    {
        self::$sentMessages = [];
    }
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';

function portal_config(string $key): mixed
{
    $config = portal_private_config();
    return $config[$key] ?? null;
}

function portal_json(array $payload, int $status = 200): never
{
    portal_cors();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function portal_error(string $message, int $status): never
{
    portal_json(['success' => false, 'error' => $message], $status);
}

function portal_cors(): void
{
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    $cors = portal_config('cors');
    $allowed = is_array($cors) ? ($cors['allowed_origins'] ?? []) : [];
    $allowed = is_array($allowed) ? $allowed : [];

    if ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}

function portal_boot(string $method): void
{
    portal_cors();

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        portal_error('Metodo non consentito.', 405);
    }
}

function portal_db(): PDO
{
    try {
        return portal_config_db();
    } catch (Throwable) {
        portal_error('Connessione al database non disponibile.', 500);
    }
}

function portal_b64u_dec(string $data): string|false
{
    $data = strtr($data, '-_', '+/');
    $pad = strlen($data) % 4;
    if ($pad > 0) {
        $data .= str_repeat('=', 4 - $pad);
    }

    return base64_decode($data, true);
}

function portal_b64u(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function portal_bearer(): ?string
{
    $header = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));

    if ($header === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strcasecmp((string)$key, 'Authorization') === 0) {
                $header = trim((string)$value);
                break;
            }
        }
    }

    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
        return null;
    }

    return trim($matches[1]);
}

function portal_verify_access_token(string $token): ?array
{
    $jwt = portal_config('jwt');
    $secret = is_array($jwt) ? trim((string)($jwt['secret'] ?? '')) : '';

    if ($secret === '') {
        portal_error('Configurazione autenticazione Portal incompleta.', 500);
    }

    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$header, $body, $signature] = $parts;
    $expected = portal_b64u(hash_hmac('sha256', $header . '.' . $body, $secret, true));

    if (!hash_equals($expected, $signature)) {
        return null;
    }

    $decoded = portal_b64u_dec($body);
    if ($decoded === false) {
        return null;
    }

    $payload = json_decode($decoded, true);
    if (!is_array($payload)) {
        return null;
    }

    if (($payload['typ'] ?? '') !== 'portal_access') {
        return null;
    }

    if ((int)($payload['exp'] ?? 0) <= time()) {
        return null;
    }

    $userId = (int)($payload['sub'] ?? 0);

    return $userId > 0 ? $payload : null;
}

function portal_load_admin(int $userId): ?array
{
    if ($userId <= 0) {
        return null;
    }

    try {
        $stmt = portal_db()->prepare(
            'SELECT id, nome, cognome, email, stato
             FROM portal_admin
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $admin = $stmt->fetch();
    } catch (Throwable) {
        portal_error('Impossibile verificare l’account amministratore.', 500);
    }

    if (!is_array($admin)) {
        return null;
    }

    if (strcasecmp(trim((string)($admin['stato'] ?? '')), 'attivo') !== 0) {
        return null;
    }

    return [
        'id' => (int)$admin['id'],
        'nome' => (string)($admin['nome'] ?? ''),
        'cognome' => (string)($admin['cognome'] ?? ''),
        'email' => (string)($admin['email'] ?? ''),
        'ruolo' => 'admin',
    ];
}

function portal_require_admin(): array
{
    $token = portal_bearer();
    if (!$token) {
        portal_error('Token Portal mancante.', 401);
    }

    $payload = portal_verify_access_token($token);
    if (!$payload) {
        portal_error('Token Portal non valido o scaduto.', 401);
    }

    $admin = portal_load_admin((int)$payload['sub']);
    if (!$admin) {
        portal_error('Account amministratore non attivo o non disponibile.', 401);
    }

    return $admin;
}

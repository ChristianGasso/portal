<?php

declare(strict_types=1);

$config = require __DIR__ . '/../config/config.php';

function portal_config(string $key): mixed
{
    global $config;
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
    $allowed = portal_config('allowed_origins');
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
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = portal_config('db');
    $db = is_array($db) ? $db : [];

    $host = trim((string)($db['host'] ?? ''));
    $port = (int)($db['port'] ?? 3306);
    $name = trim((string)($db['name'] ?? ''));
    $charset = trim((string)($db['charset'] ?? 'utf8mb4'));
    $user = trim((string)($db['user'] ?? ''));
    $pass = (string)($db['pass'] ?? '');

    if ($host === '' || $name === '' || $user === '') {
        portal_error('Configurazione database Portal incompleta.', 500);
    }

    try {
        $pdo = new PDO(
            sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $name, $charset),
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    } catch (Throwable) {
        portal_error('Connessione al database non disponibile.', 500);
    }

    return $pdo;
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
    $secret = trim((string)(portal_config('app_access_token_secret') ?? ''));
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

    if (($payload['typ'] ?? '') !== 'app_access') {
        return null;
    }

    if ((int)($payload['exp'] ?? 0) <= time()) {
        return null;
    }

    $userId = (int)($payload['sub'] ?? $payload['id'] ?? 0);
    return $userId > 0 ? $payload : null;
}

function portal_load_admin(int $userId): ?array
{
    if ($userId <= 0) {
        return null;
    }

    try {
        $stmt = portal_db()->prepare(
            'SELECT id, nome, cognome, email, codice_sede, stato_account, ruolo
             FROM utente
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();
    } catch (Throwable) {
        portal_error('Impossibile verificare l’account amministratore.', 500);
    }

    if (!is_array($user)) {
        return null;
    }

    if (strcasecmp(trim((string)($user['stato_account'] ?? '')), 'Attivo') !== 0) {
        return null;
    }

    if (strcasecmp(trim((string)($user['ruolo'] ?? '')), 'admin') !== 0) {
        portal_error('Accesso riservato agli amministratori.', 403);
    }

    return [
        'id' => (int)$user['id'],
        'nome' => (string)($user['nome'] ?? ''),
        'cognome' => (string)($user['cognome'] ?? ''),
        'email' => (string)($user['email'] ?? ''),
        'codice_sede' => (string)($user['codice_sede'] ?? ''),
        'ruolo' => 'admin',
    ];
}

function portal_require_admin(): array
{
    $token = portal_bearer();
    if (!$token) {
        portal_error('Token applicativo mancante.', 401);
    }

    $payload = portal_verify_access_token($token);
    if (!$payload) {
        portal_error('Token applicativo non valido o scaduto.', 401);
    }

    $userId = (int)($payload['sub'] ?? $payload['id'] ?? 0);
    $admin = portal_load_admin($userId);
    if (!$admin) {
        portal_error('Account amministratore non attivo o non disponibile.', 401);
    }

    return $admin;
}

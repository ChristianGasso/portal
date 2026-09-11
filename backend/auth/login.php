<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

portal_boot('POST');

$input = portal_json_input();
$email = strtolower(trim((string)($input['email'] ?? '')));
$password = (string)($input['password'] ?? '');

if ($email === '' || $password === '') {
    portal_error('Inserisci email e password.', 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    portal_error('Credenziali non valide.', 401);
}

try {
    $stmt = portal_db()->prepare(
        'SELECT id, nome, cognome, email, password_hash, stato
         FROM portal_admin
         WHERE email = :email
         LIMIT 1'
    );
    $stmt->execute([':email' => $email]);
    $admin = $stmt->fetch();
} catch (Throwable) {
    portal_error('Accesso temporaneamente non disponibile.', 500);
}

if (
    !is_array($admin)
    || strcasecmp(trim((string)($admin['stato'] ?? '')), 'attivo') !== 0
    || !password_verify($password, (string)($admin['password_hash'] ?? ''))
) {
    portal_error('Credenziali non valide.', 401);
}

$adminId = (int)$admin['id'];

try {
    $stmt = portal_db()->prepare(
        'UPDATE portal_admin
         SET ultimo_accesso = CURRENT_TIMESTAMP
         WHERE id = :id'
    );
    $stmt->execute([':id' => $adminId]);
} catch (Throwable) {
    portal_error('Accesso temporaneamente non disponibile.', 500);
}

$access = portal_create_access_token($adminId);

portal_json([
    'success' => true,
    'access_token' => $access['token'],
    'token_type' => 'Bearer',
    'expires_in' => $access['expires_in'],
    'expires_at' => $access['expires_at'],
    'user' => [
        'id' => $adminId,
        'nome' => (string)($admin['nome'] ?? ''),
        'cognome' => (string)($admin['cognome'] ?? ''),
        'email' => (string)($admin['email'] ?? ''),
        'ruolo' => 'admin',
    ],
]);

<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode([
        'success' => false,
        'error' => 'Metodo non consentito.',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $pdo = portal_config_db();

    $stmt = $pdo->query('SELECT 1 AS ok');
    $result = $stmt->fetch();

    if (!is_array($result) || (int)($result['ok'] ?? 0) !== 1) {
        throw new RuntimeException('Test database non riuscito.');
    }

    echo json_encode([
        'success' => true,
        'database' => 'connected',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'error' => 'Connessione al database Portal non disponibile.',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

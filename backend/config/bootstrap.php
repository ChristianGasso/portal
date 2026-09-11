<?php

declare(strict_types=1);

/**
 * Carica la configurazione privata del Portal.
 *
 * In produzione questo file si trova fuori dalla document root:
 * /portal/config/config.php
 *
 * Il backend viene pubblicato in:
 * /portal/public/api/...
 */
function portal_private_config(): array
{
    static $config = null;

    if (is_array($config)) {
        return $config;
    }

    $configFile = dirname(__DIR__, 3) . '/config/config.php';

    if (!is_file($configFile)) {
        throw new RuntimeException('Configurazione privata del Portal non disponibile.');
    }

    $loaded = require $configFile;

    if (!is_array($loaded)) {
        throw new RuntimeException('Configurazione privata del Portal non valida.');
    }

    $config = $loaded;

    return $config;
}

/**
 * Restituisce la connessione PDO al database centrale del Portal.
 */
function portal_config_db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = portal_private_config();
    $db = $config['portal_db'] ?? null;

    if (!is_array($db)) {
        throw new RuntimeException('Configurazione database Portal mancante.');
    }

    $host = trim((string)($db['host'] ?? ''));
    $port = (int)($db['port'] ?? 3306);
    $name = trim((string)($db['name'] ?? ''));
    $user = trim((string)($db['user'] ?? ''));
    $password = (string)($db['password'] ?? '');
    $charset = trim((string)($db['charset'] ?? 'utf8mb4'));

    if ($host === '' || $name === '' || $user === '') {
        throw new RuntimeException('Configurazione database Portal incompleta.');
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $host,
        $port,
        $name,
        $charset
    );

    $pdo = new PDO(
        $dsn,
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    return $pdo;
}

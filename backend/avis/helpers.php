<?php

declare(strict_types=1);

function portal_avis_table_columns(PDO $pdo, string $table): array
{
    $allowed = ['avis', 'avis_configurazione', 'avis_limiti'];
    if (!in_array($table, $allowed, true)) {
        throw new InvalidArgumentException('Tabella AVIS non consentita.');
    }

    $stmt = $pdo->query("SHOW COLUMNS FROM {$table}");
    $columns = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $field = (string)($row['Field'] ?? '');
        if ($field !== '') {
            $columns[$field] = $row;
        }
    }

    return $columns;
}

function portal_avis_pick_column(array $columns, array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (isset($columns[$candidate])) {
            return $candidate;
        }
    }

    return null;
}

function portal_avis_load_row(PDO $pdo, string $table, int $idAvis): ?array
{
    $columns = portal_avis_table_columns($pdo, $table);
    if (!isset($columns['id_avis'])) {
        return null;
    }

    $order = isset($columns['id']) ? ' ORDER BY id DESC' : '';
    $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE id_avis = :id_avis{$order} LIMIT 1");
    $stmt->execute([':id_avis' => $idAvis]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return is_array($row) ? $row : null;
}

function portal_avis_bool(mixed $value): int
{
    if (is_bool($value)) {
        return $value ? 1 : 0;
    }

    $normalized = strtolower(trim((string)$value));
    return in_array($normalized, ['1', 'true', 'si', 'sì', 'on', 'attivo', 'attiva'], true) ? 1 : 0;
}

function portal_avis_require_exists(PDO $pdo, int $idAvis): array
{
    $stmt = $pdo->prepare('SELECT * FROM avis WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $idAvis]);
    $avis = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!is_array($avis)) {
        portal_error('AVIS non trovata.', 404);
    }

    return $avis;
}


function portal_avis_code(array $avis): string
{
    foreach (['codice', 'codice_avis', 'codice_sede'] as $key) {
        $value = trim((string)($avis[$key] ?? ''));
        if ($value === '') {
            continue;
        }

        $digits = preg_replace('/\D+/', '', $value) ?? '';
        if ($digits !== '') {
            return str_pad($digits, 5, '0', STR_PAD_LEFT);
        }
    }

    throw new RuntimeException('Codice AVIS non disponibile.');
}

function portal_avis_shared_database_configs(): array
{
    static $configs = null;

    if (is_array($configs)) {
        return $configs;
    }

    // In produzione helpers.php viene pubblicato in /portal/public/api/avis.
    // Risaliamo alla root dello spazio IONOS e usiamo esclusivamente
    // /SanguePro-Shared/databases.php, cartella sorella di /portal.
    $mappingFile = dirname(__DIR__, 4) . '/SanguePro-Shared/databases.php';

    if (!is_file($mappingFile)) {
        throw new RuntimeException(
            'Mappatura database AVIS condivisa non disponibile in SanguePro-Shared/databases.php.'
        );
    }

    $shared = require $mappingFile;
    $databases = is_array($shared) ? ($shared['databases'] ?? null) : null;

    if (!is_array($databases) || $databases === []) {
        throw new RuntimeException('Mappatura database AVIS condivisa non valida.');
    }

    $configs = $databases;

    return $configs;
}

function portal_avis_database_config_for_code(
    string $code,
    int $idAvis = 0
): array {
    $configs = portal_avis_shared_database_configs();

    $candidates = [
        $code,
        ltrim($code, '0'),
        'avis_' . $code,
        'avis_' . ltrim($code, '0'),
    ];


    foreach (array_unique($candidates) as $candidate) {
        if (isset($configs[$candidate]) && is_array($configs[$candidate])) {
            return $configs[$candidate];
        }
    }

    foreach ($configs as $config) {
        if (!is_array($config)) {
            continue;
        }

        $configuredCode = trim((string)($config['codice_sede'] ?? $config['codice'] ?? ''));
        $configuredIdAvis = (int)($config['id_avis'] ?? 0);

        if (
            ($configuredCode !== ''
                && str_pad((preg_replace('/\\D+/', '', $configuredCode) ?? ''), 5, '0', STR_PAD_LEFT) === $code)
            || ($idAvis > 0 && $configuredIdAvis === $idAvis)
        ) {
            return $config;
        }
    }

    throw new RuntimeException('Database operativo non configurato per questa AVIS.');
}

function portal_avis_connect_database_config(array $config): PDO
{
    $host = trim((string)($config['host'] ?? ''));
    $port = (int)($config['port'] ?? 3306);
    $name = trim((string)($config['name'] ?? $config['database'] ?? $config['dbname'] ?? ''));
    $user = trim((string)($config['user'] ?? $config['username'] ?? ''));
    $password = (string)($config['password'] ?? $config['pass'] ?? '');
    $charset = trim((string)($config['charset'] ?? 'utf8mb4'));

    if ($host === '' || $name === '' || $user === '') {
        throw new RuntimeException('Configurazione database operativo incompleta.');
    }

    return new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $name, $charset),
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
}

function portal_avis_operational_db(int $idAvis): array
{
    static $connections = [];

    $portalPdo = portal_db();
    $avis = portal_avis_require_exists($portalPdo, $idAvis);
    $code = portal_avis_code($avis);
    $scopeId = (int)ltrim($code, '0');
    if ($scopeId <= 0) {
        $scopeId = (int)$code;
    }

    if (isset($connections[$idAvis]) && $connections[$idAvis]['pdo'] instanceof PDO) {
        return $connections[$idAvis];
    }

    $selected = portal_avis_database_config_for_code($code, $idAvis);
    $pdo = portal_avis_connect_database_config($selected);

    $connections[$idAvis] = [
        'pdo' => $pdo,
        'codice_sede' => $code,
        'scope_id' => $scopeId,
    ];

    return $connections[$idAvis];
}

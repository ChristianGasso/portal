<?php

declare(strict_types=1);

function portal_avis_table_columns(PDO $pdo, string $table): array
{
    $allowed = ['avis', 'avis_configurazione', 'avis_limiti', 'avis_database'];
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

    $configs = portal_config('avis_databases');
    if (!is_array($configs) || $configs === []) {
        throw new RuntimeException('Configurazione database AVIS non disponibile.');
    }

    $databaseRow = null;
    try {
        $databaseRow = portal_avis_load_row($portalPdo, 'avis_database', $idAvis);
    } catch (Throwable) {
        $databaseRow = null;
    }

    $candidates = [
        $code,
        ltrim($code, '0'),
        'avis_' . $code,
        'avis_' . ltrim($code, '0'),
    ];

    if (is_array($databaseRow)) {
        foreach ($databaseRow as $value) {
            if (is_scalar($value)) {
                $candidate = trim((string)$value);
                if ($candidate !== '') {
                    $candidates[] = $candidate;
                }
            }
        }
    }

    $selected = null;
    foreach (array_unique($candidates) as $candidate) {
        if (isset($configs[$candidate]) && is_array($configs[$candidate])) {
            $selected = $configs[$candidate];
            break;
        }
    }

    if ($selected === null) {
        foreach ($configs as $config) {
            if (!is_array($config)) {
                continue;
            }

            $configuredCode = trim((string)($config['codice_sede'] ?? $config['codice'] ?? ''));
            $configuredIdAvis = (int)($config['id_avis'] ?? 0);

            if (
                ($configuredCode !== '' && str_pad((preg_replace('/\D+/', '', $configuredCode) ?? ''), 5, '0', STR_PAD_LEFT) === $code)
                || ($configuredIdAvis > 0 && $configuredIdAvis === $idAvis)
            ) {
                $selected = $config;
                break;
            }
        }
    }

    if (!is_array($selected)) {
        throw new RuntimeException('Database operativo non configurato per questa AVIS.');
    }

    $host = trim((string)($selected['host'] ?? ''));
    $port = (int)($selected['port'] ?? 3306);
    $name = trim((string)($selected['name'] ?? $selected['database'] ?? $selected['dbname'] ?? ''));
    $user = trim((string)($selected['user'] ?? $selected['username'] ?? ''));
    $password = (string)($selected['password'] ?? $selected['pass'] ?? '');
    $charset = trim((string)($selected['charset'] ?? 'utf8mb4'));

    if ($host === '' || $name === '' || $user === '') {
        throw new RuntimeException('Configurazione database operativo incompleta.');
    }

    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $name, $charset),
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $connections[$idAvis] = [
        'pdo' => $pdo,
        'codice_sede' => $code,
        'scope_id' => $scopeId,
    ];

    return $connections[$idAvis];
}

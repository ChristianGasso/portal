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

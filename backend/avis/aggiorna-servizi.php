<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

try {
    $pdo = portal_db();
    portal_avis_require_exists($pdo, $idAvis);

    $columns = portal_avis_table_columns($pdo, 'avis_configurazione');
    $mappings = [
        'gestionale_attivo' => ['gestionale_attivo', 'gestionale', 'attivo_gestionale'],
        'app_donatori_attiva' => ['app_donatori_attiva', 'app_donatori', 'donatori_attivo'],
        'registrazione_attiva' => ['registrazione_attiva', 'registrazioni_attive', 'registrazione_donatori_attiva'],
    ];

    $resolved = [];
    foreach ($mappings as $inputKey => $candidates) {
        $column = portal_avis_pick_column($columns, $candidates);
        if ($column !== null) {
            $resolved[$inputKey] = $column;
        }
    }

    if ($resolved === []) {
        portal_error('La configurazione dei servizi non è disponibile per questa AVIS.', 409);
    }

    $sets = [];
    $params = [':id_avis' => $idAvis];
    foreach ($resolved as $inputKey => $column) {
        $placeholder = ':' . $inputKey;
        $sets[] = $column . ' = ' . $placeholder;
        $params[$placeholder] = portal_avis_bool($input[$inputKey] ?? false);
    }

    $existing = portal_avis_load_row($pdo, 'avis_configurazione', $idAvis);
    if ($existing) {
        $stmt = $pdo->prepare('UPDATE avis_configurazione SET ' . implode(', ', $sets) . ' WHERE id_avis = :id_avis');
        $stmt->execute($params);
    } else {
        $insertColumns = ['id_avis'];
        $insertPlaceholders = [':id_avis'];
        foreach ($resolved as $inputKey => $column) {
            $insertColumns[] = $column;
            $insertPlaceholders[] = ':' . $inputKey;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO avis_configurazione (' . implode(', ', $insertColumns) . ') VALUES (' . implode(', ', $insertPlaceholders) . ')'
        );
        $stmt->execute($params);
    }

    portal_json([
        'success' => true,
        'message' => 'Servizi AVIS aggiornati correttamente.',
    ]);
} catch (Throwable $error) {
    error_log('[portal_avis_aggiorna_servizi] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile aggiornare i servizi della AVIS.', 500);
}

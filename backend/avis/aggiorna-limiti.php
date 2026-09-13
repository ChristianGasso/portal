<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$values = $input['limiti'] ?? null;

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}
if (!is_array($values)) {
    portal_error('I limiti indicati non sono validi.', 400);
}

try {
    $pdo = portal_db();
    portal_avis_require_exists($pdo, $idAvis);

    $columns = portal_avis_table_columns($pdo, 'avis_limiti');
    $blocked = ['id', 'id_avis', 'created_at', 'updated_at'];
    $validValues = [];

    foreach ($values as $key => $value) {
        $key = (string)$key;
        if (!isset($columns[$key]) || in_array($key, $blocked, true)) {
            continue;
        }

        if ($value === '' || $value === null) {
            $validValues[$key] = null;
            continue;
        }

        if (!is_numeric($value) || (float)$value < 0) {
            portal_error('Inserisci valori numerici validi per i limiti.', 400);
        }

        $validValues[$key] = (float)$value;
    }

    if ($validValues === []) {
        portal_error('Nessun limite modificabile è disponibile per questa AVIS.', 409);
    }

    $params = [':id_avis' => $idAvis];
    $sets = [];
    foreach ($validValues as $key => $value) {
        $placeholder = ':limit_' . count($sets);
        $sets[] = $key . ' = ' . $placeholder;
        $params[$placeholder] = $value;
    }

    $existing = portal_avis_load_row($pdo, 'avis_limiti', $idAvis);
    if ($existing) {
        $stmt = $pdo->prepare('UPDATE avis_limiti SET ' . implode(', ', $sets) . ' WHERE id_avis = :id_avis');
        $stmt->execute($params);
    } else {
        $insertColumns = ['id_avis'];
        $insertPlaceholders = [':id_avis'];
        $insertParams = [':id_avis' => $idAvis];
        $index = 0;

        foreach ($validValues as $key => $value) {
            $placeholder = ':limit_' . $index;
            $insertColumns[] = $key;
            $insertPlaceholders[] = $placeholder;
            $insertParams[$placeholder] = $value;
            $index += 1;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO avis_limiti (' . implode(', ', $insertColumns) . ') VALUES (' . implode(', ', $insertPlaceholders) . ')'
        );
        $stmt->execute($insertParams);
    }

    portal_json([
        'success' => true,
        'message' => 'Limiti AVIS aggiornati correttamente.',
    ]);
} catch (Throwable $error) {
    error_log('[portal_avis_aggiorna_limiti] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile aggiornare i limiti della AVIS.', 500);
}

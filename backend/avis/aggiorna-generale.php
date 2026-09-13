<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$nome = trim((string)($input['nome'] ?? ''));
$attiva = portal_avis_bool($input['attiva'] ?? false);

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}
if ($nome === '' || mb_strlen($nome) > 255) {
    portal_error('Inserisci una denominazione AVIS valida.', 400);
}

try {
    $pdo = portal_db();
    portal_avis_require_exists($pdo, $idAvis);

    $columns = portal_avis_table_columns($pdo, 'avis');
    $nameColumn = portal_avis_pick_column($columns, ['nome', 'denominazione', 'ragione_sociale']);
    $statusColumn = portal_avis_pick_column($columns, ['stato']);
    $activeColumn = portal_avis_pick_column($columns, ['attiva', 'attivo']);

    if ($nameColumn === null || ($statusColumn === null && $activeColumn === null)) {
        portal_error('La configurazione della AVIS non consente questa modifica.', 409);
    }

    $sets = [$nameColumn . ' = :nome'];
    $params = [':nome' => $nome, ':id' => $idAvis];

    if ($statusColumn !== null) {
        $sets[] = $statusColumn . ' = :stato';
        $params[':stato'] = $attiva === 1 ? 'attivo' : 'sospeso';
    } else {
        $sets[] = $activeColumn . ' = :attiva';
        $params[':attiva'] = $attiva;
    }

    $stmt = $pdo->prepare('UPDATE avis SET ' . implode(', ', $sets) . ' WHERE id = :id');
    $stmt->execute($params);

    portal_json([
        'success' => true,
        'message' => 'Dati AVIS aggiornati correttamente.',
    ]);
} catch (Throwable $error) {
    error_log('[portal_avis_aggiorna_generale] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile aggiornare i dati della AVIS.', 500);
}

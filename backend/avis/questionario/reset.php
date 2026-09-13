<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$confirm = trim((string)($input['conferma'] ?? ''));

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

if ($confirm !== 'RESET DOMANDE') {
    portal_error('Conferma reset non valida.', 400);
}

try {
    $connection = portal_avis_operational_db($idAvis);
    /** @var PDO $pdo */
    $pdo = $connection['pdo'];
    $scopeId = (int)$connection['scope_id'];

    $pdo->beginTransaction();

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM questionario_domande WHERE id_avis = :id_avis');
    $countStmt->execute([':id_avis' => $scopeId]);
    $count = (int)$countStmt->fetchColumn();

    $deleteStmt = $pdo->prepare('DELETE FROM questionario_domande WHERE id_avis = :id_avis');
    $deleteStmt->execute([':id_avis' => $scopeId]);

    $pdo->commit();

    portal_json([
        'success' => true,
        'message' => sprintf('Reset completato: %d domande rimosse.', $count),
        'rimosse' => $count,
    ]);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('[portal_questionario_reset] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile eseguire il reset delle domande.', 500);
}

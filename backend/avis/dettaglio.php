<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';

portal_boot('GET');
portal_require_admin();

$idAvis = (int)($_GET['id'] ?? 0);
if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

function portal_avis_related_row(PDO $pdo, string $table, int $idAvis): ?array
{
    $allowedTables = ['avis_database', 'avis_configurazione', 'avis_limiti'];
    if (!in_array($table, $allowedTables, true)) {
        throw new InvalidArgumentException('Tabella AVIS non consentita.');
    }

    $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE id_avis = :id_avis ORDER BY id DESC LIMIT 1");
    $stmt->execute([':id_avis' => $idAvis]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return is_array($row) ? $row : null;
}

try {
    $pdo = portal_db();

    $stmt = $pdo->prepare('SELECT * FROM avis WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $idAvis]);
    $avis = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!is_array($avis)) {
        portal_error('AVIS non trovata.', 404);
    }

    portal_json([
        'success' => true,
        'avis' => $avis,
        'database' => portal_avis_related_row($pdo, 'avis_database', $idAvis),
        'configurazione' => portal_avis_related_row($pdo, 'avis_configurazione', $idAvis),
        'limiti' => portal_avis_related_row($pdo, 'avis_limiti', $idAvis),
    ]);
} catch (Throwable $error) {
    error_log('[portal_avis_dettaglio] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile caricare i dati della AVIS.', 500);
}

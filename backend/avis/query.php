<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$sql = trim((string)($input['query'] ?? ''));

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

if ($sql === '') {
    portal_error('Inserisci una query da eseguire.', 400);
}

if (mb_strlen($sql) > 20000) {
    portal_error('La query è troppo lunga.', 400);
}

if (preg_match('/(?:--|#|\/\*)/', $sql)) {
    portal_error('I commenti SQL non sono consentiti in questa console.', 400);
}

$sqlWithoutTrailingSemicolon = preg_replace('/;\s*$/', '', $sql) ?? $sql;
if (str_contains($sqlWithoutTrailingSemicolon, ';')) {
    portal_error('È possibile eseguire una sola query alla volta.', 400);
}

if (!preg_match('/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i', ltrim($sqlWithoutTrailingSemicolon))) {
    portal_error('Sono consentite solo query di lettura: SELECT, SHOW, DESCRIBE ed EXPLAIN.', 400);
}

$blockedPatterns = [
    '/\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i',
    '/\bLOAD_FILE\s*\(/i',
    '/\bSLEEP\s*\(/i',
    '/\bBENCHMARK\s*\(/i',
];

foreach ($blockedPatterns as $pattern) {
    if (preg_match($pattern, $sqlWithoutTrailingSemicolon)) {
        portal_error('Questa operazione non è consentita nella console di lettura.', 400);
    }
}

try {
    $connection = portal_avis_operational_db($idAvis);
    /** @var PDO $pdo */
    $pdo = $connection['pdo'];

    try {
        $pdo->exec('SET SESSION MAX_EXECUTION_TIME = 5000');
    } catch (Throwable) {
        // Alcuni server MySQL/MariaDB non supportano questa variabile.
    }

    $startedAt = microtime(true);
    $stmt = $pdo->query($sqlWithoutTrailingSemicolon);

    if (!$stmt instanceof PDOStatement) {
        portal_error('La query non ha restituito un risultato leggibile.', 409);
    }

    $columns = [];
    for ($index = 0; $index < $stmt->columnCount(); $index++) {
        $meta = $stmt->getColumnMeta($index);
        $columns[] = (string)($meta['name'] ?? ('colonna_' . ($index + 1)));
    }

    $rows = [];
    $limit = 500;
    while (count($rows) < $limit && ($row = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
        $rows[] = $row;
    }

    $truncated = $stmt->fetch(PDO::FETCH_ASSOC) !== false;
    $durationMs = (int)round((microtime(true) - $startedAt) * 1000);

    portal_json([
        'success' => true,
        'columns' => $columns,
        'rows' => $rows,
        'row_count' => count($rows),
        'truncated' => $truncated,
        'duration_ms' => $durationMs,
        'database' => [
            'codice_sede' => (string)($connection['codice_sede'] ?? ''),
        ],
    ]);
} catch (PDOException $error) {
    error_log('[portal_avis_query] PDOException: ' . $error->getMessage());
    portal_error('Errore SQL: ' . $error->getMessage(), 400);
} catch (Throwable $error) {
    error_log('[portal_avis_query] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile eseguire la query sul database della AVIS.', 500);
}

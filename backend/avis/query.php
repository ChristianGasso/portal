<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
$admin = portal_require_admin();

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

$normalizedSql = ltrim($sqlWithoutTrailingSemicolon);
if (!preg_match('/^([A-Z]+)\b/i', $normalizedSql, $operationMatch)) {
    portal_error('Tipo di query non riconosciuto.', 400);
}

$operation = strtoupper((string)$operationMatch[1]);
$readOperations = ['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN'];
$writeOperations = ['INSERT', 'UPDATE', 'DELETE', 'REPLACE'];
$isRead = in_array($operation, $readOperations, true);
$isWrite = in_array($operation, $writeOperations, true);

if ($operation === 'ALTER') {
    $isWrite = (bool)preg_match('/^ALTER\s+TABLE\b/i', $normalizedSql);
}

if ($operation === 'CREATE') {
    $isWrite = (bool)preg_match('/^CREATE\s+TABLE\b/i', $normalizedSql);
}

if (!$isRead && !$isWrite) {
    portal_error(
        'Operazione non consentita. Usa SELECT/SHOW/DESCRIBE/EXPLAIN oppure INSERT/UPDATE/DELETE/REPLACE/ALTER TABLE/CREATE TABLE.',
        400
    );
}

$blockedPatterns = [
    '/\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i',
    '/\bLOAD_FILE\s*\(/i',
    '/\bLOAD\s+DATA\b/i',
    '/\bSLEEP\s*\(/i',
    '/\bBENCHMARK\s*\(/i',
    '/\bDROP\s+(?:DATABASE|SCHEMA|TABLE)\b/i',
    '/\bTRUNCATE\s+TABLE\b/i',
    '/\bGRANT\b/i',
    '/\bREVOKE\b/i',
    '/\bCREATE\s+USER\b/i',
    '/\bALTER\s+USER\b/i',
    '/\bDROP\s+USER\b/i',
];

foreach ($blockedPatterns as $pattern) {
    if (preg_match($pattern, $sqlWithoutTrailingSemicolon)) {
        portal_error('Questa operazione SQL non è consentita dalla console del Portal.', 400);
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

    if ($isRead) {
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
            'mode' => 'read',
            'operation' => $operation,
            'columns' => $columns,
            'rows' => $rows,
            'row_count' => count($rows),
            'affected_rows' => null,
            'truncated' => $truncated,
            'duration_ms' => $durationMs,
            'database' => [
                'codice_sede' => (string)($connection['codice_sede'] ?? ''),
            ],
        ]);
    }

    $affectedRows = $pdo->exec($sqlWithoutTrailingSemicolon);
    if ($affectedRows === false) {
        throw new RuntimeException('La query di modifica non è stata eseguita.');
    }

    $durationMs = (int)round((microtime(true) - $startedAt) * 1000);
    error_log(sprintf(
        '[portal_avis_query_write] admin=%d avis=%d operation=%s sql_sha256=%s affected=%d',
        (int)($admin['id'] ?? 0),
        $idAvis,
        $operation,
        hash('sha256', $sqlWithoutTrailingSemicolon),
        (int)$affectedRows
    ));

    portal_json([
        'success' => true,
        'mode' => 'write',
        'operation' => $operation,
        'columns' => [],
        'rows' => [],
        'row_count' => 0,
        'affected_rows' => (int)$affectedRows,
        'truncated' => false,
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

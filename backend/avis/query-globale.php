<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
$admin = portal_require_admin();
$input = portal_json_input();
$sql = trim((string)($input['query'] ?? ''));
$confirmed = ($input['conferma_scrittura'] ?? false) === true;
if ($sql === '' || mb_strlen($sql) > 20000) portal_error('Query mancante o troppo lunga.', 400);
if (preg_match('/(?:--|#|\/\*)/', $sql)) portal_error('Commenti SQL non consentiti.', 400);
$sql = preg_replace('/;\s*$/', '', $sql) ?? $sql;
if (str_contains($sql, ';')) portal_error('Una sola istruzione SQL alla volta.', 400);
if (!preg_match('/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|INSERT|UPDATE|DELETE|REPLACE|ALTER\s+TABLE|CREATE\s+TABLE)\b/i', ltrim($sql), $match)) portal_error('Operazione SQL non consentita.', 400);
$operation = strtoupper(preg_replace('/\s+/', ' ', $match[1]));
$isRead = in_array($operation, ['SELECT','SHOW','DESCRIBE','DESC','EXPLAIN'], true);
if (!$isRead && !$confirmed) portal_error('Conferma esplicita richiesta per modifiche globali.', 400);
foreach ([
    '/\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i','/\bLOAD_FILE\s*\(/i','/\bLOAD\s+DATA\b/i',
    '/\bSLEEP\s*\(/i','/\bBENCHMARK\s*\(/i','/\bDROP\s+(?:DATABASE|SCHEMA|TABLE)\b/i',
    '/\bTRUNCATE\s+TABLE\b/i','/\bGRANT\b/i','/\bREVOKE\b/i',
    '/\bCREATE\s+USER\b/i','/\bALTER\s+USER\b/i','/\bDROP\s+USER\b/i',
] as $pattern) if (preg_match($pattern, $sql)) portal_error('Operazione non consentita.', 400);

// Le istruzioni DDL MySQL provocano un COMMIT implicito, quindi non
// possono essere eseguite all'interno di una transazione PDO.
$isDdl = in_array($operation, ['CREATE TABLE', 'ALTER TABLE'], true);
$createTableName = null;
$sqlToExecute = $sql;
if ($operation === 'CREATE TABLE' && preg_match(
    '/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\x60(?:\x60\x60|[^\x60])+\x60|[A-Za-z_][A-Za-z0-9_]*)(?=\s|\()/i',
    $sql,
    $createMatch
)) {
    $identifier = (string)$createMatch[1];
    $createTableName = str_starts_with($identifier, chr(96))
        ? str_replace(chr(96) . chr(96), chr(96), substr($identifier, 1, -1))
        : $identifier;
    if (!preg_match('/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i', $sql)) {
        $sqlToExecute = preg_replace('/^(CREATE\s+TABLE\s+)/i', '$1IF NOT EXISTS ', $sql, 1) ?? $sql;
    }
}

try {
    $configs = portal_avis_shared_database_configs();
    $results = [];
    $summary = ['succeeded' => 0, 'failed' => 0, 'created' => 0, 'already_exists' => 0];
    foreach ($configs as $site => $config) {
        $entry = ['codice_sede' => (string)$site, 'success' => false, 'status' => 'error'];
        try {
            if (!is_array($config)) throw new RuntimeException('Configurazione database non valida.');
            $pdo = portal_avis_connect_database_config($config);
            $pdo->setAttribute(PDO::ATTR_TIMEOUT, 8);
            $start = microtime(true);
            if ($isRead) {
                $statement = $pdo->query($sql);
                $columns = [];
                for ($i=0; $i<$statement->columnCount(); $i++) {
                    $meta = $statement->getColumnMeta($i);
                    $columns[] = (string)($meta['name'] ?? ('colonna_' . ($i+1)));
                }
                $rows = [];
                while (count($rows) < 100 && ($row = $statement->fetch(PDO::FETCH_ASSOC)) !== false) $rows[]=$row;
                $entry = array_merge($entry, ['success'=>true,'status'=>'read','columns'=>$columns,'rows'=>$rows,'truncated'=>$statement->fetch(PDO::FETCH_ASSOC)!==false,'row_count'=>count($rows)]);
            } elseif ($isDdl) {
                $alreadyExisted = false;
                if ($operation === 'CREATE TABLE' && $createTableName !== null) {
                    $check = $pdo->prepare(
                        'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name'
                    );
                    $check->execute([':table_name' => $createTableName]);
                    $alreadyExisted = (int)$check->fetchColumn() > 0;
                }
                // CREATE/ALTER non sono reversibili tramite ROLLBACK in MySQL.
                $affected = $pdo->exec($sqlToExecute);
                if ($affected === false) throw new RuntimeException('Istruzione DDL non eseguita.');
                $status = $operation === 'CREATE TABLE' && $createTableName !== null
                    ? ($alreadyExisted ? 'already_exists' : 'created')
                    : 'executed';
                $entry = array_merge($entry, ['success'=>true,'status'=>$status,'affected_rows'=>(int)$affected]);
            } else {
                $pdo->beginTransaction();
                try {
                    $statement = $pdo->prepare($sql);
                    $statement->execute();
                    $affected = $statement->rowCount();
                    $pdo->commit();
                    $entry = array_merge($entry, ['success'=>true,'status'=>'executed','affected_rows'=>$affected]);
                } catch (Throwable $e) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    throw $e;
                }
            }
            $entry['duration_ms']=(int)round((microtime(true)-$start)*1000);
        } catch (Throwable $e) {
            $entry['error']='Esecuzione non riuscita: '.$e->getMessage();
            error_log('[portal_query_globale] sede='.(string)$site.' '.$e::class.': '.$e->getMessage());
        }
        $results[] = $entry;
        if ($entry['success']) {
            $summary['succeeded']++;
            if ($entry['status'] === 'created') $summary['created']++;
            if ($entry['status'] === 'already_exists') $summary['already_exists']++;
        } else {
            $summary['failed']++;
        }
        // Ogni database e' indipendente: gli errori vengono segnalati, non bloccano le altre sedi.
    }
    error_log(sprintf(
        '[portal_query_globale] admin=%d operation=%s query_sha256=%s db_processed=%d ok=%d failed=%d',
        (int)($admin['id']??0),
        $operation,
        hash('sha256',$sql),
        count($results),
        $summary['succeeded'],
        $summary['failed']
    ));
    portal_json([
        'success'=>true,
        'mode'=>$isRead?'read':'write',
        'operation'=>$operation,
        'results'=>$results,
        'total_mapped'=>count($configs),
        'processed'=>count($results),
        'summary'=>$summary
    ]);
} catch (Throwable $e) {
    error_log('[portal_query_globale] '.$e->getMessage());
    portal_error('Impossibile caricare il mapping dei database.', 500);
}

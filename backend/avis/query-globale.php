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

try {
    $configs = portal_avis_shared_database_configs();
    $results = [];
    foreach ($configs as $site => $config) {
        $entry = ['codice_sede' => (string)$site, 'success' => false];
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
                $entry += ['success'=>true,'columns'=>$columns,'rows'=>$rows,'truncated'=>$statement->fetch(PDO::FETCH_ASSOC)!==false,'row_count'=>count($rows)];
            } else {
                $pdo->beginTransaction();
                try {
                    $statement = $pdo->prepare($sql);
                    $statement->execute();
                    $affected = $statement->rowCount();
                    $pdo->commit();
                    $entry += ['success'=>true,'affected_rows'=>$affected];
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
        $results[]=$entry;
        if (!$isRead && !$entry['success']) break;
    }
    error_log(sprintf('[portal_query_globale] admin=%d operation=%s query_sha256=%s db_processed=%d', (int)($admin['id']??0), $operation, hash('sha256',$sql), count($results)));
    portal_json(['success'=>true,'mode'=>$isRead?'read':'write','operation'=>$operation,'results'=>$results,'total_mapped'=>count($configs),'processed'=>count($results)]);
} catch (Throwable $e) {
    error_log('[portal_query_globale] '.$e->getMessage());
    portal_error('Impossibile caricare il mapping dei database.', 500);
}

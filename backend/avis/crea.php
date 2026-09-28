<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
portal_require_admin();

function portal_avis_normalize_code(int $idAvis): string
{
    return str_pad((string)$idAvis, 5, '0', STR_PAD_LEFT);
}

function portal_avis_database_tables(PDO $pdo): array
{
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

    return array_values(array_filter(
        array_map(static fn(mixed $table): string => trim((string)$table), $tables),
        static fn(string $table): bool => $table !== ''
    ));
}

function portal_avis_split_sql(string $sql): array
{
    $statements = [];
    $buffer = '';
    $length = strlen($sql);
    $quote = null;
    $lineComment = false;
    $blockComment = false;

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];
        $next = $i + 1 < $length ? $sql[$i + 1] : '';

        if ($lineComment) {
            if ($char === "\n") {
                $lineComment = false;
                $buffer .= $char;
            }
            continue;
        }

        if ($blockComment) {
            if ($char === '*' && $next === '/') {
                $blockComment = false;
                $i++;
            }
            continue;
        }

        if ($quote === null) {
            if ($char === '#' || ($char === '-' && $next === '-' && ($i + 2 >= $length || ctype_space($sql[$i + 2])))) {
                $lineComment = true;
                if ($char === '-') {
                    $i++;
                }
                continue;
            }

            if ($char === '/' && $next === '*') {
                $blockComment = true;
                $i++;
                continue;
            }

            if ($char === "'" || $char === '"' || $char === '`') {
                $quote = $char;
                $buffer .= $char;
                continue;
            }

            if ($char === ';') {
                $statement = trim($buffer);
                if ($statement !== '') {
                    $statements[] = $statement;
                }
                $buffer = '';
                continue;
            }

            $buffer .= $char;
            continue;
        }

        $buffer .= $char;

        if ($char === '\\') {
            if ($i + 1 < $length) {
                $buffer .= $sql[$i + 1];
                $i++;
            }
            continue;
        }

        if ($char === $quote) {
            if ($i + 1 < $length && $sql[$i + 1] === $quote && $quote !== '`') {
                $buffer .= $sql[$i + 1];
                $i++;
                continue;
            }

            $quote = null;
        }
    }

    $statement = trim($buffer);
    if ($statement !== '') {
        $statements[] = $statement;
    }

    return $statements;
}

function portal_avis_apply_schema(PDO $pdo): void
{
    $schemaFile = dirname(__DIR__, 3) . '/database/schema_avis.sql';

    if (!is_file($schemaFile)) {
        throw new RuntimeException('Schema database AVIS non disponibile.');
    }

    $sql = file_get_contents($schemaFile);
    if (!is_string($sql) || trim($sql) === '') {
        throw new RuntimeException('Schema database AVIS non valido.');
    }

    foreach (portal_avis_split_sql($sql) as $statement) {
        $pdo->exec($statement);
    }
}

function portal_avis_ensure_operational_schema(PDO $pdo): void
{
    $tables = portal_avis_database_tables($pdo);

    if ($tables === []) {
        portal_avis_apply_schema($pdo);
        $tables = portal_avis_database_tables($pdo);
    }

    foreach (['avis', 'avis_limiti', 'utente', 'utente_inviti', 'permessi', 'utenti_permessi'] as $required) {
        if (!in_array($required, $tables, true)) {
            throw new RuntimeException('Il database operativo non contiene lo schema SanguePro previsto.');
        }
    }
}

function portal_avis_upsert_operational_data(
    PDO $pdo,
    int $idAvis,
    string $nome,
    string $code,
    array $limits
): void {
    $stmt = $pdo->prepare('SELECT id, nome, codice_avis FROM avis WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $idAvis]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (is_array($existing)) {
        $existingCode = trim((string)($existing['codice_avis'] ?? ''));
        if ($existingCode !== '' && $existingCode !== $code) {
            throw new RuntimeException('Il database operativo risulta associato a un’altra AVIS.');
        }

        $update = $pdo->prepare(
            'UPDATE avis
             SET nome = :nome, codice_avis = :codice
             WHERE id = :id'
        );
        $update->execute([
            ':nome' => $nome,
            ':codice' => $code,
            ':id' => $idAvis,
        ]);
    } else {
        $count = (int)$pdo->query('SELECT COUNT(*) FROM avis')->fetchColumn();
        if ($count > 0) {
            throw new RuntimeException('Il database operativo contiene già una AVIS diversa.');
        }

        $insert = $pdo->prepare(
            'INSERT INTO avis (id, nome, codice_avis)
             VALUES (:id, :nome, :codice)'
        );
        $insert->execute([
            ':id' => $idAvis,
            ':nome' => $nome,
            ':codice' => $code,
        ]);
    }

    $limitStmt = $pdo->prepare(
        'INSERT INTO avis_limiti (
            id_avis,
            limite_spazio_bytes,
            limite_account,
            limite_upload_giornalieri
         ) VALUES (
            :id_avis,
            :limite_spazio_bytes,
            :limite_account,
            :limite_upload_giornalieri
         )
         ON DUPLICATE KEY UPDATE
            limite_spazio_bytes = VALUES(limite_spazio_bytes),
            limite_account = VALUES(limite_account),
            limite_upload_giornalieri = VALUES(limite_upload_giornalieri)'
    );
    $limitStmt->execute([
        ':id_avis' => $idAvis,
        ':limite_spazio_bytes' => $limits['limite_spazio_bytes'],
        ':limite_account' => $limits['limite_account'],
        ':limite_upload_giornalieri' => $limits['limite_upload_giornalieri'],
    ]);
}

function portal_avis_upsert_central_data(
    PDO $pdo,
    int $idAvis,
    string $nome,
    string $code,
    array $limits
): void {
    $columns = portal_avis_table_columns($pdo, 'avis');
    $nameColumn = portal_avis_pick_column($columns, ['nome', 'denominazione', 'ragione_sociale']);
    $codeColumn = portal_avis_pick_column($columns, ['codice_avis', 'codice', 'codice_sede']);
    $statusColumn = portal_avis_pick_column($columns, ['stato']);
    $activeColumn = portal_avis_pick_column($columns, ['attiva', 'attivo']);

    if ($nameColumn === null) {
        throw new RuntimeException('Tabella AVIS centrale non compatibile con la creazione.');
    }

    $existing = portal_avis_require_exists_or_null($pdo, $idAvis);

    if (is_array($existing)) {
        $sets = [$nameColumn . ' = :nome'];
        $params = [':nome' => $nome, ':id' => $idAvis];

        if ($codeColumn !== null) {
            $sets[] = $codeColumn . ' = :codice';
            $params[':codice'] = $code;
        }
        if ($statusColumn !== null) {
            $sets[] = $statusColumn . " = 'attivo'";
        } elseif ($activeColumn !== null) {
            $sets[] = $activeColumn . ' = 1';
        }

        $stmt = $pdo->prepare('UPDATE avis SET ' . implode(', ', $sets) . ' WHERE id = :id');
        $stmt->execute($params);
    } else {
        $insertColumns = ['id', $nameColumn];
        $placeholders = [':id', ':nome'];
        $params = [':id' => $idAvis, ':nome' => $nome];

        if ($codeColumn !== null) {
            $insertColumns[] = $codeColumn;
            $placeholders[] = ':codice';
            $params[':codice'] = $code;
        }
        if ($statusColumn !== null) {
            $insertColumns[] = $statusColumn;
            $placeholders[] = ':stato';
            $params[':stato'] = 'attivo';
        } elseif ($activeColumn !== null) {
            $insertColumns[] = $activeColumn;
            $placeholders[] = ':attiva';
            $params[':attiva'] = 1;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO avis (' . implode(', ', $insertColumns) . ')
             VALUES (' . implode(', ', $placeholders) . ')'
        );
        $stmt->execute($params);
    }

    $limitColumns = portal_avis_table_columns($pdo, 'avis_limiti');
    $available = [];
    foreach ($limits as $key => $value) {
        if (isset($limitColumns[$key])) {
            $available[$key] = $value;
        }
    }

    if ($available === []) {
        throw new RuntimeException('Nessun limite AVIS centrale configurabile.');
    }

    $current = portal_avis_load_row($pdo, 'avis_limiti', $idAvis);
    if (is_array($current)) {
        $sets = [];
        $params = [':id_avis' => $idAvis];
        foreach ($available as $key => $value) {
            $placeholder = ':limit_' . count($sets);
            $sets[] = $key . ' = ' . $placeholder;
            $params[$placeholder] = $value;
        }

        $stmt = $pdo->prepare(
            'UPDATE avis_limiti SET ' . implode(', ', $sets) . ' WHERE id_avis = :id_avis'
        );
        $stmt->execute($params);
    } else {
        $insertColumns = ['id_avis'];
        $placeholders = [':id_avis'];
        $params = [':id_avis' => $idAvis];

        foreach ($available as $key => $value) {
            $placeholder = ':limit_' . count($params);
            $insertColumns[] = $key;
            $placeholders[] = $placeholder;
            $params[$placeholder] = $value;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO avis_limiti (' . implode(', ', $insertColumns) . ')
             VALUES (' . implode(', ', $placeholders) . ')'
        );
        $stmt->execute($params);
    }
}

function portal_avis_require_exists_or_null(PDO $pdo, int $idAvis): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM avis WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $idAvis]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return is_array($row) ? $row : null;
}

function portal_avis_create_initial_admin(string $site, array $admin): array
{
    $provisioning = portal_config('provisioning');
    $url = is_array($provisioning)
        ? trim((string)($provisioning['initial_admin_url'] ?? ''))
        : '';
    $secret = is_array($provisioning)
        ? trim((string)($provisioning['shared_secret'] ?? ''))
        : '';

    if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL) || $secret === '') {
        throw new RuntimeException('Configurazione provisioning amministratore non disponibile.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('Estensione cURL non disponibile sul server.');
    }

    $body = json_encode([
        'codice_sede' => $site,
        'nome' => $admin['nome'],
        'cognome' => $admin['cognome'],
        'email' => $admin['email'],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $curl = curl_init($url);
    if ($curl === false) {
        throw new RuntimeException('Impossibile inizializzare il provisioning amministratore.');
    }

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $secret,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ]);

    $responseBody = curl_exec($curl);
    $curlError = curl_error($curl);
    $statusCode = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($responseBody === false) {
        throw new RuntimeException(
            $curlError !== ''
                ? 'Errore di comunicazione con il backend Gestionale: ' . $curlError
                : 'Errore di comunicazione con il backend Gestionale.'
        );
    }

    $response = json_decode((string)$responseBody, true);
    if (!is_array($response)) {
        throw new RuntimeException('Risposta provisioning amministratore non valida.');
    }

    if ($statusCode < 200 || $statusCode >= 300 || empty($response['success'])) {
        $message = trim((string)($response['error'] ?? ''));
        throw new RuntimeException(
            $message !== ''
                ? 'Provisioning amministratore: ' . $message
                : 'Il backend Gestionale ha rifiutato la creazione dell’amministratore.'
        );
    }

    return $response;
}

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$nome = trim((string)($input['nome'] ?? ''));
$limitsInput = $input['limiti'] ?? null;
$adminInput = $input['admin'] ?? null;

if ($idAvis <= 0) {
    portal_error('Inserisci un ID AVIS valido.', 400);
}
if ($nome === '' || mb_strlen($nome) > 255) {
    portal_error('Inserisci una denominazione AVIS valida.', 400);
}
if (!is_array($limitsInput)) {
    portal_error('Inserisci i limiti della AVIS.', 400);
}
if (!is_array($adminInput)) {
    portal_error('Inserisci i dati del primo amministratore.', 400);
}

$limits = [
    'limite_spazio_bytes' => $limitsInput['limite_spazio_bytes'] ?? null,
    'limite_account' => $limitsInput['limite_account'] ?? null,
    'limite_upload_giornalieri' => $limitsInput['limite_upload_giornalieri'] ?? 10000,
];

foreach ($limits as $key => $value) {
    if (!is_numeric($value) || (float)$value < 0) {
        portal_error('Inserisci valori numerici validi per i limiti.', 400);
    }
    $limits[$key] = (int)$value;
}

$admin = [
    'nome' => trim((string)($adminInput['nome'] ?? '')),
    'cognome' => trim((string)($adminInput['cognome'] ?? '')),
    'email' => strtolower(trim((string)($adminInput['email'] ?? ''))),
];

if ($admin['nome'] === '' || $admin['email'] === '') {
    portal_error('Compila nome ed email del primo amministratore.', 400);
}
if (!filter_var($admin['email'], FILTER_VALIDATE_EMAIL)) {
    portal_error('Inserisci un indirizzo email valido per il primo amministratore.', 400);
}

$code = portal_avis_normalize_code($idAvis);

try {
    $databaseConfig = portal_avis_database_config_for_code($code, $idAvis);
    $operationalPdo = portal_avis_connect_database_config($databaseConfig);
    portal_avis_ensure_operational_schema($operationalPdo);

    $operationalPdo->beginTransaction();
    portal_avis_upsert_operational_data($operationalPdo, $idAvis, $nome, $code, $limits);
    $operationalPdo->commit();

    $centralPdo = portal_db();
    $centralPdo->beginTransaction();
    portal_avis_upsert_central_data($centralPdo, $idAvis, $nome, $code, $limits);
    $centralPdo->commit();

    $adminResult = portal_avis_create_initial_admin($code, $admin);

    portal_json([
        'success' => true,
        'message' => 'AVIS creata correttamente. È stato avviato l’invito del primo amministratore.',
        'avis' => [
            'id' => $idAvis,
            'nome' => $nome,
            'codice_avis' => $code,
        ],
        'limiti' => $limits,
        'amministratore' => $adminResult['amministratore'] ?? null,
        'email_inviata' => (bool)($adminResult['email_inviata'] ?? false),
    ], 201);
} catch (Throwable $error) {
    if (isset($operationalPdo) && $operationalPdo instanceof PDO && $operationalPdo->inTransaction()) {
        $operationalPdo->rollBack();
    }
    if (isset($centralPdo) && $centralPdo instanceof PDO && $centralPdo->inTransaction()) {
        $centralPdo->rollBack();
    }

    error_log('[portal_avis_crea] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile completare la creazione della AVIS.', 500);
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$sql = trim((string)($input['query'] ?? ''));

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

if ($sql === '') {
    portal_error('Inserisci una query INSERT.', 400);
}

function portal_questionario_split_sql_list(string $input): array
{
    $parts = [];
    $current = '';
    $quote = null;
    $escaped = false;
    $depth = 0;
    $length = strlen($input);

    for ($i = 0; $i < $length; $i++) {
        $char = $input[$i];

        if ($quote !== null) {
            $current .= $char;

            if ($escaped) {
                $escaped = false;
                continue;
            }

            if ($char === '\\') {
                $escaped = true;
                continue;
            }

            if ($char === $quote) {
                if ($i + 1 < $length && $input[$i + 1] === $quote) {
                    $current .= $input[++$i];
                    continue;
                }

                $quote = null;
            }

            continue;
        }

        if ($char === "'" || $char === '"') {
            $quote = $char;
            $current .= $char;
            continue;
        }

        if ($char === '(') {
            $depth++;
            $current .= $char;
            continue;
        }

        if ($char === ')') {
            $depth--;
            if ($depth < 0) {
                throw new InvalidArgumentException('Parentesi non valide nella query.');
            }
            $current .= $char;
            continue;
        }

        if ($char === ',' && $depth === 0) {
            $parts[] = trim($current);
            $current = '';
            continue;
        }

        $current .= $char;
    }

    if ($quote !== null || $depth !== 0) {
        throw new InvalidArgumentException('Query INSERT non valida.');
    }

    if (trim($current) !== '') {
        $parts[] = trim($current);
    }

    return $parts;
}

function portal_questionario_parse_scalar(string $value): mixed
{
    $value = trim($value);

    if (strcasecmp($value, 'NULL') === 0) {
        return null;
    }

    if (preg_match('/^-?\d+(?:\.\d+)?$/', $value)) {
        return str_contains($value, '.') ? (float)$value : (int)$value;
    }

    $first = $value[0] ?? '';
    $last = $value[strlen($value) - 1] ?? '';

    if (($first === "'" && $last === "'") || ($first === '"' && $last === '"')) {
        $inner = substr($value, 1, -1);

        if ($first === "'") {
            $inner = str_replace("''", "'", $inner);
        } else {
            $inner = str_replace('""', '"', $inner);
        }

        return stripcslashes($inner);
    }

    throw new InvalidArgumentException('Sono ammessi solo valori testuali, numerici o NULL.');
}

function portal_questionario_parse_rows(string $values): array
{
    $rows = [];
    $quote = null;
    $escaped = false;
    $depth = 0;
    $start = null;
    $length = strlen($values);

    for ($i = 0; $i < $length; $i++) {
        $char = $values[$i];

        if ($quote !== null) {
            if ($escaped) {
                $escaped = false;
                continue;
            }

            if ($char === '\\') {
                $escaped = true;
                continue;
            }

            if ($char === $quote) {
                if ($i + 1 < $length && $values[$i + 1] === $quote) {
                    $i++;
                    continue;
                }

                $quote = null;
            }

            continue;
        }

        if ($char === "'" || $char === '"') {
            $quote = $char;
            continue;
        }

        if ($char === '(') {
            if ($depth === 0) {
                $start = $i + 1;
            }
            $depth++;
            continue;
        }

        if ($char === ')') {
            $depth--;
            if ($depth < 0) {
                throw new InvalidArgumentException('Parentesi VALUES non valide.');
            }

            if ($depth === 0 && $start !== null) {
                $rows[] = portal_questionario_split_sql_list(substr($values, $start, $i - $start));
                $start = null;
            }
        }
    }

    if ($quote !== null || $depth !== 0 || $rows === []) {
        throw new InvalidArgumentException('VALUES della query non validi.');
    }

    return $rows;
}

try {
    if (str_contains($sql, '--') || str_contains($sql, '/*') || str_contains($sql, '*/')) {
        throw new InvalidArgumentException('I commenti SQL non sono ammessi.');
    }

    $sql = rtrim($sql);
    if (str_ends_with($sql, ';')) {
        $sql = rtrim(substr($sql, 0, -1));
    }

    if (str_contains($sql, ';')) {
        throw new InvalidArgumentException('Inserisci una sola query INSERT multi-riga.');
    }

    if (!preg_match(
        '/^INSERT\s+INTO\s+questionario_domande\s*\((.*?)\)\s*VALUES\s*(.+)$/is',
        $sql,
        $matches
    )) {
        throw new InvalidArgumentException('È ammessa solo una query INSERT INTO questionario_domande (...) VALUES (...).');
    }

    $allowedColumns = [
        'id_avis',
        'codice',
        'sezione_codice',
        'sezione_titolo',
        'sezione_descrizione',
        'ordine_sezione',
        'pagina_compilazione',
        'testo',
        'tipo_risposta',
        'opzioni_json',
        'obbligatoria',
        'solo_donne',
        'dettaglio_quando',
        'etichetta_dettaglio',
        'ordine_domanda',
        'attiva',
    ];

    $columns = array_map(
        static fn(string $column): string => trim($column),
        portal_questionario_split_sql_list($matches[1])
    );

    if ($columns === [] || count($columns) !== count(array_unique($columns))) {
        throw new InvalidArgumentException('Elenco colonne non valido.');
    }

    foreach ($columns as $column) {
        if (!in_array($column, $allowedColumns, true)) {
            throw new InvalidArgumentException('Colonna non consentita: ' . $column);
        }
    }

    foreach (['codice', 'sezione_codice', 'sezione_titolo', 'testo', 'tipo_risposta'] as $required) {
        if (!in_array($required, $columns, true)) {
            throw new InvalidArgumentException('Colonna obbligatoria mancante: ' . $required);
        }
    }

    $parsedRows = portal_questionario_parse_rows($matches[2]);

    if (count($parsedRows) > 500) {
        throw new InvalidArgumentException('La query non può inserire più di 500 righe per volta.');
    }

    $connection = portal_avis_operational_db($idAvis);
    /** @var PDO $pdo */
    $pdo = $connection['pdo'];
    $scopeId = (int)$connection['scope_id'];

    $insertColumns = $columns;
    if (!in_array('id_avis', $insertColumns, true)) {
        array_unshift($insertColumns, 'id_avis');
    }

    $columnSql = implode(', ', $insertColumns);
    $placeholders = implode(', ', array_fill(0, count($insertColumns), '?'));
    $stmt = $pdo->prepare("INSERT INTO questionario_domande ({$columnSql}) VALUES ({$placeholders})");

    $pdo->beginTransaction();
    $inserted = 0;

    foreach ($parsedRows as $rowParts) {
        if (count($rowParts) !== count($columns)) {
            throw new InvalidArgumentException('Il numero di valori non corrisponde alle colonne indicate.');
        }

        $row = [];
        foreach ($rowParts as $index => $rawValue) {
            $row[$columns[$index]] = portal_questionario_parse_scalar($rawValue);
        }

        $row['id_avis'] = $scopeId;

        $values = [];
        foreach ($insertColumns as $column) {
            $values[] = $row[$column] ?? null;
        }

        $stmt->execute($values);
        $inserted++;
    }

    $pdo->commit();

    portal_json([
        'success' => true,
        'message' => sprintf('Import completato: %d domande inserite.', $inserted),
        'inserite' => $inserted,
    ]);
} catch (InvalidArgumentException $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    portal_error($error->getMessage(), 400);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('[portal_questionario_import] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile importare le nuove domande.', 500);
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';

portal_boot('GET');
portal_require_admin();

$idAvis = (int)($_GET['id_avis'] ?? 0);
if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

try {
    $connection = portal_avis_operational_db($idAvis);
    /** @var PDO $pdo */
    $pdo = $connection['pdo'];
    $scopeId = (int)$connection['scope_id'];

    $stmt = $pdo->prepare(
        'SELECT id, codice, sezione_codice, sezione_titolo, sezione_descrizione,
                ordine_sezione, pagina_compilazione, testo, tipo_risposta,
                opzioni_json, obbligatoria, solo_donne, omettibile_periodico, dettaglio_quando,
                etichetta_dettaglio, ordine_domanda, attiva
         FROM questionario_domande
         WHERE id_avis = :id_avis
         ORDER BY ordine_sezione, ordine_domanda, id'
    );
    $stmt->execute([':id_avis' => $scopeId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $questions = [];
    foreach ($rows as $row) {
        $options = [];
        $rawOptions = $row['opzioni_json'] ?? null;
        if (is_string($rawOptions) && trim($rawOptions) !== '') {
            $decoded = json_decode($rawOptions, true);
            if (is_array($decoded)) {
                $options = array_values(array_map('strval', $decoded));
            }
        }

        $questions[] = [
            'id' => (int)$row['id'],
            'codice' => (string)$row['codice'],
            'sezione_codice' => (string)$row['sezione_codice'],
            'sezione_titolo' => (string)$row['sezione_titolo'],
            'sezione_descrizione' => $row['sezione_descrizione'] !== null ? (string)$row['sezione_descrizione'] : null,
            'ordine_sezione' => (int)$row['ordine_sezione'],
            'pagina_compilazione' => (int)$row['pagina_compilazione'],
            'testo' => (string)$row['testo'],
            'tipo_risposta' => (string)$row['tipo_risposta'],
            'opzioni' => $options,
            'obbligatoria' => (bool)$row['obbligatoria'],
            'solo_donne' => (bool)$row['solo_donne'],
            'omettibile_periodico' => (bool)$row['omettibile_periodico'],
            'dettaglio_quando' => $row['dettaglio_quando'] !== null ? (string)$row['dettaglio_quando'] : null,
            'etichetta_dettaglio' => $row['etichetta_dettaglio'] !== null ? (string)$row['etichetta_dettaglio'] : null,
            'ordine_domanda' => (int)$row['ordine_domanda'],
            'attiva' => (bool)$row['attiva'],
        ];
    }

    portal_json([
        'success' => true,
        'codice_sede' => $connection['codice_sede'],
        'domande' => $questions,
    ]);
} catch (Throwable $error) {
    error_log('[portal_questionario_lista] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile caricare le domande del questionario.', 500);
}

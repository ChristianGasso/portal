<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$idDomanda = (int)($input['id_domanda'] ?? 0);

if ($idAvis <= 0 || $idDomanda <= 0) {
    portal_error('Domanda del questionario non valida.', 400);
}

$testo = trim((string)($input['testo'] ?? ''));
$pagina = (int)($input['pagina_compilazione'] ?? 1);
$ordine = (int)($input['ordine_domanda'] ?? 0);
$tipo = strtoupper(trim((string)($input['tipo_risposta'] ?? 'SI_NO')));
$dettaglioQuando = strtoupper(trim((string)($input['dettaglio_quando'] ?? '')));
$etichettaDettaglio = trim((string)($input['etichetta_dettaglio'] ?? ''));

if ($testo === '') {
    portal_error('Il testo della domanda non può essere vuoto.', 400);
}
if ($pagina <= 0 || $pagina > 99 || $ordine < 0 || $ordine > 9999) {
    portal_error('Pagina o ordine della domanda non validi.', 400);
}
if (!preg_match('/^[A-Z0-9_]{1,30}$/', $tipo)) {
    portal_error('Tipo risposta non valido.', 400);
}
if ($dettaglioQuando !== '' && !in_array($dettaglioQuando, ['SI', 'NO'], true)) {
    portal_error('Regola dettaglio non valida.', 400);
}

try {
    $connection = portal_avis_operational_db($idAvis);
    /** @var PDO $pdo */
    $pdo = $connection['pdo'];
    $scopeId = (int)$connection['scope_id'];

    $check = $pdo->prepare(
        'SELECT id
         FROM questionario_domande
         WHERE id = :id AND id_avis = :id_avis
         LIMIT 1'
    );
    $check->execute([
        ':id' => $idDomanda,
        ':id_avis' => $scopeId,
    ]);

    if (!$check->fetchColumn()) {
        portal_error('Domanda non trovata per questa AVIS.', 404);
    }

    $stmt = $pdo->prepare(
        'UPDATE questionario_domande
         SET testo = :testo,
             pagina_compilazione = :pagina_compilazione,
             tipo_risposta = :tipo_risposta,
             obbligatoria = :obbligatoria,
             solo_donne = :solo_donne,
             omettibile_periodico = :omettibile_periodico,
             dettaglio_quando = :dettaglio_quando,
             etichetta_dettaglio = :etichetta_dettaglio,
             ordine_domanda = :ordine_domanda,
             attiva = :attiva
         WHERE id = :id AND id_avis = :id_avis'
    );

    $stmt->execute([
        ':testo' => $testo,
        ':pagina_compilazione' => $pagina,
        ':tipo_risposta' => $tipo,
        ':obbligatoria' => portal_avis_bool($input['obbligatoria'] ?? false),
        ':solo_donne' => portal_avis_bool($input['solo_donne'] ?? false),
        ':omettibile_periodico' => portal_avis_bool($input['omettibile_periodico'] ?? false),
        ':dettaglio_quando' => $dettaglioQuando !== '' ? $dettaglioQuando : null,
        ':etichetta_dettaglio' => $etichettaDettaglio !== '' ? $etichettaDettaglio : null,
        ':ordine_domanda' => $ordine,
        ':attiva' => portal_avis_bool($input['attiva'] ?? false),
        ':id' => $idDomanda,
        ':id_avis' => $scopeId,
    ]);

    portal_json([
        'success' => true,
        'message' => 'Domanda aggiornata correttamente.',
    ]);
} catch (Throwable $error) {
    error_log('[portal_questionario_aggiorna] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile aggiornare la domanda.', 500);
}

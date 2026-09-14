<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../media/media_storage.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$action = strtolower(trim((string)($input['action'] ?? 'source')));

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

if ($action !== 'source') {
    portal_error('Operazione PDF non riconosciuta.', 400);
}

try {
    $portalPdo = portal_db();
    $avis = portal_avis_require_exists($portalPdo, $idAvis);
    $codiceSede = portal_avis_code($avis);
    $pdfContent = portal_media_questionario_pdf_read($codiceSede);

    if ($pdfContent === null) {
        portal_error('Il PDF di partenza del questionario non è disponibile.', 404);
    }

    portal_cors();
    http_response_code(200);
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="questionario_' . $codiceSede . '.pdf"');
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen($pdfContent));
    echo $pdfContent;
    exit;
} catch (InvalidArgumentException $error) {
    portal_error($error->getMessage(), 400);
} catch (Throwable $error) {
    error_log('[portal_questionario_pagina] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile caricare il PDF del questionario.', 500);
}

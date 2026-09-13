<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../media/media_storage.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$action = strtolower(trim((string)($input['action'] ?? 'load')));

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

try {
    $portalPdo = portal_db();
    $avis = portal_avis_require_exists($portalPdo, $idAvis);
    $codiceSede = portal_avis_code($avis);

    if ($action === 'load') {
        $content = portal_media_questionario_pdf_read($codiceSede);

        portal_json([
            'success' => true,
            'pdf' => [
                'presente' => $content !== null,
                'url' => $content !== null
                    ? portal_media_questionario_pdf_url($codiceSede) . '?v=' . time()
                    : null,
            ],
        ]);
    }

    if ($action === 'save') {
        $encoded = trim((string)($input['pdf_base64'] ?? ''));
        if ($encoded === '') {
            portal_error('Seleziona un PDF da caricare.', 400);
        }

        if (str_contains($encoded, ',')) {
            $encoded = explode(',', $encoded, 2)[1];
        }

        $raw = base64_decode($encoded, true);
        if ($raw === false || $raw === '') {
            portal_error('Il PDF selezionato non è valido.', 400);
        }

        portal_media_questionario_pdf_write($codiceSede, $raw);

        portal_json([
            'success' => true,
            'message' => 'PDF di partenza salvato correttamente.',
            'pdf' => [
                'presente' => true,
                'url' => portal_media_questionario_pdf_url($codiceSede) . '?v=' . time(),
            ],
        ]);
    }

    if ($action === 'delete') {
        portal_media_questionario_pdf_delete($codiceSede);

        portal_json([
            'success' => true,
            'message' => 'PDF di partenza rimosso correttamente.',
            'pdf' => [
                'presente' => false,
                'url' => null,
            ],
        ]);
    }

    portal_error('Operazione PDF non riconosciuta.', 400);
} catch (InvalidArgumentException $error) {
    portal_error($error->getMessage(), 400);
} catch (Throwable $error) {
    error_log('[portal_questionario_pdf] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile completare l’operazione sul PDF del questionario.', 500);
}

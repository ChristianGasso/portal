<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../media/media_storage.php';

portal_boot('POST');
portal_require_admin();

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$action = strtolower(trim((string)($input['action'] ?? 'load')));

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

function portal_logo_codice_sede(array $avis): string
{
    foreach (['codice', 'codice_avis', 'codice_sede'] as $key) {
        $value = trim((string)($avis[$key] ?? ''));
        if ($value !== '') {
            $digits = preg_replace('/\D+/', '', $value) ?? '';
            if ($digits !== '') {
                return str_pad($digits, 5, '0', STR_PAD_LEFT);
            }
        }
    }

    throw new RuntimeException('Codice sede AVIS non disponibile.');
}

function portal_logo_payload(string $codiceSede): array
{
    $content = portal_media_logo_read($codiceSede);
    if ($content === null) {
        return ['presente' => false, 'url' => null, 'data_url' => null];
    }

    return [
        'presente' => true,
        'url' => portal_media_logo_url($codiceSede) . '?v=' . time(),
        'data_url' => 'data:image/webp;base64,' . base64_encode($content),
    ];
}

try {
    $pdo = portal_db();
    $avis = portal_avis_require_exists($pdo, $idAvis);
    $codiceSede = portal_logo_codice_sede($avis);

    if ($action === 'load') {
        portal_json([
            'success' => true,
            'logo' => portal_logo_payload($codiceSede),
        ]);
    }

    if ($action === 'save') {
        $encoded = trim((string)($input['logo_base64'] ?? ''));
        if ($encoded === '') {
            portal_error('Seleziona un logo da caricare.', 400);
        }

        $webp = portal_media_convert_image_to_webp($encoded);
        portal_media_logo_write($codiceSede, $webp);

        portal_json([
            'success' => true,
            'message' => 'Logo AVIS salvato correttamente.',
            'logo' => portal_logo_payload($codiceSede),
        ]);
    }

    if ($action === 'delete') {
        portal_media_logo_delete($codiceSede);

        portal_json([
            'success' => true,
            'message' => 'Logo AVIS rimosso correttamente.',
            'logo' => ['presente' => false, 'url' => null, 'data_url' => null],
        ]);
    }

    portal_error('Operazione non riconosciuta.', 400);
} catch (InvalidArgumentException $error) {
    portal_error($error->getMessage(), 400);
} catch (Throwable $error) {
    error_log('[portal_avis_logo] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile completare l’operazione sul logo AVIS.', 500);
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../media/media_storage.php';

portal_boot('POST');
portal_require_admin();

function portal_questionario_page_require_pdf_libraries(): void
{
    if (class_exists('setasign\\Fpdi\\Fpdi')) {
        return;
    }

    $accountRoot = dirname(__DIR__, 5);
    $fpdfFile = $accountRoot . '/Gestionale-Avis/public/libs/fpdf/fpdf.php';
    $fpdiAutoload = $accountRoot . '/Gestionale-Avis/public/libs/fpdi/src/autoload.php';

    if (!is_file($fpdfFile) || !is_file($fpdiAutoload)) {
        throw new RuntimeException('Librerie PDF non disponibili sul server Portal.');
    }

    require_once $fpdfFile;
    require_once $fpdiAutoload;
}

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$action = strtolower(trim((string)($input['action'] ?? 'info')));
$page = (int)($input['pagina'] ?? 1);

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

if (!in_array($action, ['info', 'page'], true)) {
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

    portal_questionario_page_require_pdf_libraries();

    $temporary = tempnam(sys_get_temp_dir(), 'portal_qpage_');
    if ($temporary === false || file_put_contents($temporary, $pdfContent) === false) {
        throw new RuntimeException('Non è stato possibile preparare il PDF.');
    }

    try {
        $pdf = new \setasign\Fpdi\Fpdi();
        $pdf->SetAutoPageBreak(false);
        $pageCount = $pdf->setSourceFile($temporary);

        if ($action === 'info') {
            @unlink($temporary);
            portal_json([
                'success' => true,
                'pagine' => $pageCount,
            ]);
        }

        if ($page < 1 || $page > $pageCount) {
            portal_error('Pagina PDF non valida.', 400);
        }

        $templateId = $pdf->importPage($page);
        $size = $pdf->getTemplateSize($templateId);
        $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
        $pdf->useTemplate($templateId);
        $output = $pdf->Output('S');
    } finally {
        @unlink($temporary);
    }

    portal_cors();
    http_response_code(200);
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="questionario_pagina_' . $page . '.pdf"');
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen($output));
    echo $output;
    exit;
} catch (InvalidArgumentException $error) {
    portal_error($error->getMessage(), 400);
} catch (Throwable $error) {
    error_log('[portal_questionario_pagina] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile preparare la pagina del questionario.', 500);
}

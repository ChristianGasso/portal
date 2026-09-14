<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../media/media_storage.php';

portal_boot('POST');
portal_require_admin();

function portal_questionario_preview_require_pdf_libraries(): void
{
    if (class_exists('setasign\\Fpdi\\Fpdi')) {
        return;
    }

    $accountRoot = dirname(__DIR__, 4);
    $fpdfFile = $accountRoot . '/Gestionale-Avis/public/libs/fpdf/fpdf.php';
    $fpdiAutoload = $accountRoot . '/Gestionale-Avis/public/libs/fpdi/src/autoload.php';

    if (!is_file($fpdfFile) || !is_file($fpdiAutoload)) {
        throw new RuntimeException('Librerie PDF di anteprima non disponibili sul server.');
    }

    require_once $fpdfFile;
    require_once $fpdiAutoload;
}

function portal_questionario_preview_text(string $key): string
{
    $normalized = strtolower(trim($key));

    $fixed = [
        'donatore.nome' => 'Mario',
        'donatore.cognome' => 'Rossi',
        'donatore.nome_completo' => 'Rossi Mario',
        'donatore.codice_fiscale' => 'RSSMRA80A01F158X',
        'donatore.sesso' => 'M',
        'donatore.data_nascita' => '01/01/1980',
        'donatore.luogo_nascita' => 'Messina',
        'donatore.provincia_nascita' => 'ME',
        'donatore.nazione_nascita' => 'Italia',
        'donatore.medico_curante' => 'Dott. Giuseppe Bianchi',
        'donatore.via_residenza' => 'Via Roma',
        'donatore.civico_residenza' => '10',
        'donatore.indirizzo_residenza' => 'Via Roma 10',
        'donatore.cap_residenza' => '98071',
        'donatore.citta_residenza' => 'Capo d’Orlando',
        'donatore.citta_provincia_residenza' => 'Capo d’Orlando (ME)',
        'donatore.provincia_residenza' => 'ME',
        'donatore.telefono' => '333 1234567',
        'donatore.email' => 'mario.rossi@example.it',
        'questionario.data' => '14/09/2026',
        'raccolta.data' => '14/09/2026',
        'firma.donatore' => 'Firma donatore',
        'firma.medico' => 'Firma medico',
    ];

    if (isset($fixed[$normalized])) {
        return $fixed[$normalized];
    }

    if (str_starts_with($normalized, 'domanda:')) {
        $parts = explode(':', $normalized);
        return count($parts) >= 3 ? 'X' : 'SI';
    }

    if (str_starts_with($normalized, 'dettaglio:')) {
        return 'Dettaglio risposta di prova';
    }

    return trim($key) !== '' ? trim($key) : 'Campo';
}

function portal_questionario_preview_encode(string $text): string
{
    $encoded = iconv('UTF-8', 'windows-1252//TRANSLIT', $text);
    return $encoded === false ? $text : $encoded;
}

function portal_questionario_preview_normalize_fields(array $fields): array
{
    if (count($fields) > 300) {
        portal_error('Sono consentiti al massimo 300 campi layout.', 400);
    }

    $allowedTypes = ['testo', 'check', 'firma', 'data'];
    $allowedAlignments = ['', 'sinistra', 'centro', 'destra'];
    $normalized = [];

    foreach ($fields as $field) {
        if (!is_array($field)) {
            portal_error('Campo layout non valido.', 400);
        }

        $key = trim((string)($field['chiave_campo'] ?? ''));
        $type = strtolower(trim((string)($field['tipo_campo'] ?? 'testo')));
        $page = (int)($field['pagina'] ?? 1);
        $x = (float)($field['x'] ?? 0);
        $y = (float)($field['y'] ?? 0);
        $width = (float)($field['larghezza'] ?? 0.20);
        $height = (float)($field['altezza'] ?? 0.04);
        $fontSize = $field['font_size'] === null || $field['font_size'] === ''
            ? 10.0
            : (float)$field['font_size'];
        $alignment = strtolower(trim((string)($field['allineamento'] ?? 'sinistra')));
        $active = portal_avis_bool($field['attivo'] ?? true);

        if ($key === '' || strlen($key) > 100 || !preg_match('/^[A-Za-z0-9_.:-]+$/', $key)) {
            portal_error('Chiave campo non valida: ' . $key, 400);
        }

        if (!in_array($type, $allowedTypes, true)) {
            portal_error('Tipo campo non valido.', 400);
        }

        if (!in_array($alignment, $allowedAlignments, true)) {
            portal_error('Allineamento non valido.', 400);
        }

        if (
            $page < 1 || $page > 99
            || $x < 0 || $x > 1
            || $y < 0 || $y > 1
            || $width <= 0 || $width > 1
            || $height <= 0 || $height > 1
            || $x + $width > 1.000001
            || $y + $height > 1.000001
            || $fontSize < 4 || $fontSize > 72
        ) {
            portal_error('Coordinate o dimensioni campo non valide.', 400);
        }

        if (!$active) {
            continue;
        }

        $normalized[] = [
            'chiave_campo' => $key,
            'tipo_campo' => $type,
            'pagina' => $page,
            'x' => $x,
            'y' => $y,
            'larghezza' => $width,
            'altezza' => $height,
            'font_size' => $fontSize,
            'allineamento' => $alignment !== '' ? $alignment : 'sinistra',
        ];
    }

    return $normalized;
}

function portal_questionario_preview_draw(
    \setasign\Fpdi\Fpdi $pdf,
    array $field,
    float $pageWidth,
    float $pageHeight
): void {
    $value = portal_questionario_preview_text((string)$field['chiave_campo']);
    if ($value === '') {
        return;
    }

    $x = (float)$field['x'] * $pageWidth;
    $y = (float)$field['y'] * $pageHeight;
    $width = (float)$field['larghezza'] * $pageWidth;
    $height = (float)$field['altezza'] * $pageHeight;
    $fontSize = (float)$field['font_size'];

    $alignment = match ((string)$field['allineamento']) {
        'centro' => 'C',
        'destra' => 'R',
        default => 'L',
    };

    $pdf->SetTextColor(220, 38, 38);

    if ((string)$field['tipo_campo'] === 'check') {
        $pdf->SetFont('Helvetica', 'B', $fontSize);
        $pdf->SetXY($x, $y);
        $pdf->Cell($width, $height, 'X', 0, 0, 'C');
        return;
    }

    $encoded = portal_questionario_preview_encode($value);
    $pdf->SetFont('Helvetica', '', $fontSize);

    while ($fontSize > 4.0 && $pdf->GetStringWidth($encoded) > $width) {
        $fontSize -= 0.3;
        $pdf->SetFont('Helvetica', '', $fontSize);
    }

    $pdf->SetXY($x, $y);
    $pdf->Cell($width, $height, $encoded, 0, 0, $alignment);
}

$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$fields = $input['campi'] ?? null;

if ($idAvis <= 0) {
    portal_error('Seleziona una AVIS valida.', 400);
}

if (!is_array($fields)) {
    portal_error('Configurazione layout non valida.', 400);
}

try {
    $portalPdo = portal_db();
    $avis = portal_avis_require_exists($portalPdo, $idAvis);
    $codiceSede = portal_avis_code($avis);
    $pdfContent = portal_media_questionario_pdf_read($codiceSede);

    if ($pdfContent === null) {
        portal_error('Il PDF di partenza del questionario non è disponibile.', 404);
    }

    $layout = portal_questionario_preview_normalize_fields($fields);
    if ($layout === []) {
        portal_error('Aggiungi almeno un campo al layout prima di creare il PDF di prova.', 400);
    }

    portal_questionario_preview_require_pdf_libraries();

    $temporary = tempnam(sys_get_temp_dir(), 'portal_qpreview_');
    if ($temporary === false || file_put_contents($temporary, $pdfContent) === false) {
        throw new RuntimeException('Non è stato possibile preparare il PDF di prova.');
    }

    try {
        $pdf = new \setasign\Fpdi\Fpdi();
        $pdf->SetAutoPageBreak(false);
        $pageCount = $pdf->setSourceFile($temporary);

        $byPage = [];
        foreach ($layout as $field) {
            $page = (int)$field['pagina'];
            if ($page > $pageCount) {
                portal_error('Il layout contiene campi su una pagina non presente nel PDF.', 400);
            }
            $byPage[$page][] = $field;
        }

        for ($page = 1; $page <= $pageCount; $page++) {
            $templateId = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($templateId);
            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($templateId);

            foreach ($byPage[$page] ?? [] as $field) {
                portal_questionario_preview_draw(
                    $pdf,
                    $field,
                    (float)$size['width'],
                    (float)$size['height']
                );
            }
        }

        $output = $pdf->Output('S');
    } finally {
        @unlink($temporary);
    }

    portal_cors();
    http_response_code(200);
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="questionario_prova_' . $codiceSede . '.pdf"');
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen($output));
    echo $output;
    exit;
} catch (InvalidArgumentException $error) {
    portal_error($error->getMessage(), 400);
} catch (Throwable $error) {
    error_log('[portal_questionario_anteprima] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile generare il PDF di prova.', 500);
}

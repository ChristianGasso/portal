<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/helpers.php';

portal_boot('POST');
$admin = portal_require_admin();
$input = portal_json_input();
$idAvis = (int)($input['id_avis'] ?? 0);
$tipo = trim((string)($input['tipo'] ?? ''));

$allowedScripts = [
    'nuove_raccolte' => 'send-collection-alerts.php',
    'scadenza_idoneita' => 'send-eligibility-expiry-alerts.php',
];

if ($idAvis <= 0 || !isset($allowedScripts[$tipo])) {
    portal_error('AVIS o tipo di notifica non valido.', 400);
}

try {
    // Si seleziona la AVIS dal DB centrale, mai da un percorso/argomento
    // passato liberamente dal browser.
    $avis = portal_avis_require_exists(portal_db(), $idAvis);
    $code = portal_avis_code($avis);
    if (preg_match('/^[0-9]{5}$/D', $code) !== 1 || (int)$code <= 0) {
        portal_error('Il codice della AVIS non è valido.', 409);
    }

    // Portal e AppDonatore sono directory sorelle nello stesso webspace.
    // Sono script CLI privati: nessuno degli script è esposto via HTTP.
    $appScripts = dirname(__DIR__, 4) . '/AppDonatore/scripts';
    $script = $appScripts . '/' . $allowedScripts[$tipo];
    $php = '/usr/bin/php8.4';
    if (!is_file($php) || !is_executable($php) || !is_file($script)) {
        portal_error('Esecuzione manuale non disponibile: verifica i percorsi PHP e AppDonatore sul server.', 503);
    }
    if (!function_exists('proc_open')) {
        portal_error('Il server non consente di avviare le procedure dal Portal.', 503);
    }

    // Il comando NON passa attraverso una shell e non accetta argomenti liberi.
    $cmd = [$php, '-f', $script, '--', '--avis=' . $code];
    if ($tipo === 'scadenza_idoneita') {
        $cmd[] = '--send';
    }

    // Gli script mantengono i propri lock anti-sovrapposizione.
    @set_time_limit(75);
    $pipes = [];
    $process = @proc_open(
        $cmd,
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        dirname($script),
        null,
        ['bypass_shell' => true]
    );

    if (!is_resource($process)) {
        portal_error('Non è stato possibile avviare il processo PHP. Verifica le autorizzazioni IONOS.', 503);
    }

    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    // L'output di sintesi è volutamente anonimo: soli conteggi.
    $result = null;
    foreach (preg_split('/\r?\n/', (string)$output) ?: [] as $line) {
        if (!str_starts_with($line, 'PORTAL_RESULT:')) continue;
        $decoded = json_decode(substr($line, strlen('PORTAL_RESULT:')), true);
        if (is_array($decoded) &&
            ($decoded['avis'] ?? null) === $code &&
            ($decoded['tipo'] ?? null) === $tipo &&
            is_array($decoded['conteggi'] ?? null)) {
            $result = $decoded;
        }
    }

    if ($exitCode !== 0 || $result === null) {
        // Non riportiamo output, query, token o dettagli del server al client.
        error_log('[portal_esegui_notifiche] admin=' . (int)$admin['id']
            . ' avis=' . $idAvis . ' tipo=' . $tipo . ' exit=' . $exitCode
            . ' stderr=' . substr(preg_replace('/\s+/', ' ', (string)$errors) ?? '', 0, 250));
        portal_error('La procedura non è stata completata. Controlla i log del backend AppDonatore.', 500);
    }

    error_log('[portal_esegui_notifiche] admin=' . (int)$admin['id']
        . ' avis=' . $idAvis . ' tipo=' . $tipo . ' esito=ok');

    portal_json([
        'success' => true,
        'message' => 'Procedura completata esclusivamente per la AVIS selezionata.',
        'id_avis' => $idAvis,
        'tipo' => $tipo,
        'conteggi' => $result['conteggi'],
    ]);
} catch (Throwable $error) {
    error_log('[portal_esegui_notifiche] ' . $error::class);
    portal_error('Non è stato possibile avviare l\'invio manuale.', 500);
}

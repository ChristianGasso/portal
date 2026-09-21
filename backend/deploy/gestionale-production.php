<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';

portal_boot('POST');
portal_require_admin();

portal_json([
    'success' => true,
    'debug' => 'endpoint raggiunto',
]);

function deploy_github_config(): array
{
    $github = portal_config('github');
    $github = is_array($github) ? $github : [];

    $token = trim((string)($github['token'] ?? ''));
    if ($token === '') {
        portal_error('Configurazione GitHub del Portal non disponibile.', 500);
    }

    return [
        'token' => $token,
        'owner' => trim((string)($github['gestionale_owner'] ?? 'ChristianGasso')),
        'repo' => trim((string)($github['gestionale_repo'] ?? 'Gestionale')),
        'source_branch' => trim((string)($github['gestionale_source_branch'] ?? 'main')),
        'production_branch' => trim((string)($github['gestionale_production_branch'] ?? 'production')),
    ];
}

function deploy_github_request(string $method, string $path, array $config, ?array $body = null): array
{
    $curl = curl_init('https://api.github.com' . $path);
    if ($curl === false) {
        throw new RuntimeException('Impossibile inizializzare cURL verso GitHub.');
    }

    $headers = [
        'Accept: application/vnd.github+json',
        'Authorization: Bearer ' . $config['token'],
        'X-GitHub-Api-Version: 2022-11-28',
        'User-Agent: SanguePro-Portal',
    ];

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_NOSIGNAL => true,
        CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
    ];

    if ($body !== null) {
        $encoded = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($encoded)) {
            portal_error('Non è stato possibile preparare la richiesta GitHub.', 500);
        }
        $headers[] = 'Content-Type: application/json';
        $options[CURLOPT_POSTFIELDS] = $encoded;
    }

    $options[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($curl, $options);

    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($curl);
    $curlErrno = curl_errno($curl);
    curl_close($curl);

    if ($raw === false) {
        throw new RuntimeException(
            'Chiamata GitHub fallita (cURL ' . $curlErrno . '): ' . ($curlError !== '' ? $curlError : 'errore sconosciuto')
        );
    }

    $payload = json_decode((string)$raw, true);

    return [
        'status' => $status,
        'data' => is_array($payload) ? $payload : [],
    ];
}

function deploy_branch_sha(array $config, string $branch): string
{
    $owner = rawurlencode($config['owner']);
    $repo = rawurlencode($config['repo']);
    $ref = rawurlencode('heads/' . $branch);

    $response = deploy_github_request(
        'GET',
        "/repos/{$owner}/{$repo}/git/ref/{$ref}",
        $config
    );

    if ($response['status'] !== 200) {
        portal_error('Non è stato possibile verificare i branch del Gestionale.', 502);
    }

    return trim((string)($response['data']['object']['sha'] ?? ''));
}

try {
    $config = deploy_github_config();

    if ($config['owner'] === '' || $config['repo'] === '' || $config['source_branch'] === '' || $config['production_branch'] === '') {
        portal_error('Configurazione del deploy Gestionale incompleta.', 500);
    }

    $sourceSha = deploy_branch_sha($config, $config['source_branch']);
    $productionSha = deploy_branch_sha($config, $config['production_branch']);

    if ($sourceSha === '' || $productionSha === '') {
        portal_error('Non è stato possibile leggere lo stato dei branch del Gestionale.', 502);
    }

    if (hash_equals($sourceSha, $productionSha)) {
        portal_json([
            'success' => true,
            'updated' => false,
            'message' => 'La produzione è già aggiornata con il branch main.',
        ]);
    }

    $owner = rawurlencode($config['owner']);
    $repo = rawurlencode($config['repo']);
    $head = rawurlencode($config['owner'] . ':' . $config['source_branch']);
    $base = rawurlencode($config['production_branch']);

    $pulls = deploy_github_request(
        'GET',
        "/repos/{$owner}/{$repo}/pulls?state=open&head={$head}&base={$base}",
        $config
    );

    if ($pulls['status'] !== 200) {
        portal_error('Non è stato possibile verificare le richieste di aggiornamento esistenti.', 502);
    }

    $pullRequest = is_array($pulls['data'][0] ?? null) ? $pulls['data'][0] : null;

    if ($pullRequest === null) {
        $created = deploy_github_request(
            'POST',
            "/repos/{$owner}/{$repo}/pulls",
            $config,
            [
                'title' => 'Aggiornamento produzione dal Portal',
                'head' => $config['source_branch'],
                'base' => $config['production_branch'],
                'body' => 'Aggiornamento automatico del frontend di produzione dal branch main, avviato dal Portal SanguePro.',
            ]
        );

        if ($created['status'] !== 201) {
            $message = trim((string)($created['data']['message'] ?? ''));
            portal_error(
                $message !== ''
                    ? 'GitHub non ha potuto creare la richiesta di aggiornamento: ' . $message
                    : 'Non è stato possibile creare la richiesta di aggiornamento.',
                409
            );
        }

        $pullRequest = $created['data'];
    }

    $pullNumber = (int)($pullRequest['number'] ?? 0);
    if ($pullNumber <= 0) {
        portal_error('La richiesta di aggiornamento GitHub non è valida.', 502);
    }

    $merge = deploy_github_request(
        'PUT',
        "/repos/{$owner}/{$repo}/pulls/{$pullNumber}/merge",
        $config,
        ['merge_method' => 'merge']
    );

    if (!(bool)($merge['data']['merged'] ?? false)) {
        $message = trim((string)($merge['data']['message'] ?? ''));
        portal_error(
            $message !== ''
                ? 'GitHub non ha completato l’aggiornamento: ' . $message
                : 'L’aggiornamento non può essere completato automaticamente. Controlla la Pull Request su GitHub.',
            409
        );
    }

    portal_json([
        'success' => true,
        'updated' => true,
        'message' => 'Frontend di produzione aggiornato correttamente.',
        'pull_request' => $pullNumber,
    ]);
} catch (Throwable $error) {
    error_log('[portal deploy gestionale] ' . $error::class . ': ' . $error->getMessage());

    portal_json([
        'success' => false,
        'error' => 'Non è stato possibile aggiornare il frontend di produzione.',
        'debug' => $error->getMessage(),
    ], 502);
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';
require_once __DIR__ . '/../avis/helpers.php';

portal_boot('GET');
portal_require_admin();

try {
    $portalDb = portal_db();
    $portalDb->query('SELECT 1');

    $avisStmt = $portalDb->query('SELECT id FROM avis ORDER BY id');
    $avisIds = array_map('intval', $avisStmt->fetchAll(PDO::FETCH_COLUMN));

    $operational = [
        'configured' => count($avisIds),
        'connected' => 0,
        'failed' => 0,
        'items' => [],
    ];

    foreach ($avisIds as $idAvis) {
        if ($idAvis <= 0) {
            continue;
        }

        try {
            $connection = portal_avis_operational_db($idAvis);
            /** @var PDO $pdo */
            $pdo = $connection['pdo'];
            $pdo->query('SELECT 1');

            $operational['connected']++;
            $operational['items'][] = [
                'id_avis' => $idAvis,
                'codice_sede' => (string)($connection['codice_sede'] ?? ''),
                'connected' => true,
            ];
        } catch (Throwable $error) {
            $operational['failed']++;
            $operational['items'][] = [
                'id_avis' => $idAvis,
                'connected' => false,
            ];

            error_log(
                '[portal system health] AVIS ' . $idAvis . ' non raggiungibile: '
                . $error::class . ': ' . $error->getMessage()
            );
        }
    }

    $success = $operational['failed'] === 0;

    portal_json([
        'success' => $success,
        'portal_database' => [
            'connected' => true,
        ],
        'operational_databases' => $operational,
    ], $success ? 200 : 503);
} catch (Throwable $error) {
    error_log('[portal system health] ' . $error::class . ': ' . $error->getMessage());

    portal_json([
        'success' => false,
        'portal_database' => [
            'connected' => false,
        ],
        'operational_databases' => [
            'configured' => 0,
            'connected' => 0,
            'failed' => 0,
            'items' => [],
        ],
    ], 503);
}

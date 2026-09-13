<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/bootstrap.php';

portal_boot('GET');
portal_require_admin();

try {
    $stmt = portal_db()->query('SELECT * FROM avis ORDER BY id ASC');
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    portal_json([
        'success' => true,
        'avis' => is_array($items) ? $items : [],
    ]);
} catch (Throwable $error) {
    error_log('[portal_avis_lista] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile caricare le AVIS.', 500);
}

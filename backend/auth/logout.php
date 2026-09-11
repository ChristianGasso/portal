<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

portal_boot('POST');
portal_require_admin();

portal_json([
    'success' => true,
]);

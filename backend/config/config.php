<?php

declare(strict_types=1);

$env = static function (string $key, string $default = ''): string {
    $value = getenv($key);
    return is_string($value) && $value !== '' ? $value : $default;
};

$config = [
    'db' => [
        'host' => $env('PORTAL_DB_HOST'),
        'port' => (int)$env('PORTAL_DB_PORT', '3306'),
        'name' => $env('PORTAL_DB_NAME'),
        'charset' => $env('PORTAL_DB_CHARSET', 'utf8mb4'),
        'user' => $env('PORTAL_DB_USER'),
        'pass' => $env('PORTAL_DB_PASSWORD'),
    ],
    'app_access_token_secret' => $env('PORTAL_APP_ACCESS_TOKEN_SECRET'),
    'allowed_origins' => [
        'https://portal.sangueprogestionale.it',
    ],
];

/*
 * Configurazione privata opzionale presente solo sul server.
 * Questo file NON deve essere versionato e viene preservato dal deploy.
 * Può sovrascrivere DB, secret e origini consentite.
 */
$localFile = __DIR__ . '/local.php';
if (is_file($localFile)) {
    $local = require $localFile;
    if (is_array($local)) {
        $config = array_replace_recursive($config, $local);
    }
}

return $config;

<?php

declare(strict_types=1);

function portal_media_config(): array
{
    $config = portal_config('media_sftp');
    return is_array($config) ? $config : [];
}

function portal_media_public_base_url(): string
{
    $config = portal_media_config();
    $configured = trim((string)($config['public_base_url'] ?? ''));
    return rtrim($configured !== '' ? $configured : 'https://media.sangueprogestionale.it', '/');
}

function portal_media_logo_relative_path(string $codiceSede): string
{
    $config = portal_media_config();
    $paths = is_array($config['paths'] ?? null) ? $config['paths'] : [];
    $template = trim((string)($paths['logo_avis'] ?? '{codice_sede}/loghi/logo.webp'));
    $relative = str_replace('{codice_sede}', $codiceSede, $template);
    $relative = trim(str_replace('\\', '/', $relative), '/');

    if ($relative === '' || str_contains($relative, '../') || preg_match('/\{[^}]+\}/', $relative)) {
        throw new RuntimeException('Percorso media logo non valido.');
    }

    return $relative;
}

function portal_media_logo_url(string $codiceSede): string
{
    $segments = array_map('rawurlencode', explode('/', portal_media_logo_relative_path($codiceSede)));
    return portal_media_public_base_url() . '/' . implode('/', $segments);
}

function portal_media_local_root(): ?string
{
    $config = portal_media_config();

    // Se configurato esplicitamente fuori dal repository, usa sempre quel percorso.
    $configured = trim((string)($config['local_root'] ?? ''));
    if ($configured !== '') {
        return rtrim($configured, '/\\');
    }

    /*
     * Il Portal e l'archivio media vivono sullo stesso account IONOS:
     *
     * /portal/public/api/media/media_storage.php
     * /Gestionale-Avis/media
     *
     * Risaliamo quindi alla radice dell'account senza accettare alcun
     * percorso dal client e usiamo esclusivamente la directory media nota.
     */
    $accountRoot = dirname(__DIR__, 4);
    $mediaRoot = $accountRoot . '/Gestionale-Avis/media';

    return is_dir($mediaRoot) ? $mediaRoot : null;
}

function portal_media_use_local(): bool
{
    $root = portal_media_local_root();
    return is_string($root) && $root !== '' && is_dir($root);
}

function portal_media_sftp_connection(): array
{
    if (!function_exists('ssh2_connect') || !function_exists('ssh2_sftp')) {
        throw new RuntimeException('Supporto SFTP non disponibile sul server Portal.');
    }

    $config = portal_media_config();
    $host = trim((string)($config['host'] ?? ''));
    $port = (int)($config['port'] ?? 22);
    $user = trim((string)($config['user'] ?? ''));
    $password = (string)($config['password'] ?? '');

    if ($host === '' || $user === '' || $password === '') {
        throw new RuntimeException('Configurazione SFTP media incompleta.');
    }

    $connection = @ssh2_connect($host, $port);
    if (!$connection || !@ssh2_auth_password($connection, $user, $password)) {
        throw new RuntimeException('Connessione SFTP media non disponibile.');
    }

    $sftp = @ssh2_sftp($connection);
    if (!$sftp) {
        throw new RuntimeException('Sessione SFTP media non disponibile.');
    }

    return [$connection, $sftp];
}

function portal_media_sftp_path(string $relative): string
{
    $config = portal_media_config();
    $root = trim((string)($config['remote_root'] ?? '/'));
    $root = '/' . trim(str_replace('\\', '/', $root), '/');
    return rtrim($root, '/') . '/' . ltrim($relative, '/');
}

function portal_media_logo_exists(string $codiceSede): bool
{
    $relative = portal_media_logo_relative_path($codiceSede);

    if (portal_media_use_local()) {
        return is_file(portal_media_local_root() . '/' . $relative);
    }

    [, $sftp] = portal_media_sftp_connection();
    return @file_exists('ssh2.sftp://' . intval($sftp) . portal_media_sftp_path($relative));
}

function portal_media_logo_read(string $codiceSede): ?string
{
    $relative = portal_media_logo_relative_path($codiceSede);

    if (portal_media_use_local()) {
        $file = portal_media_local_root() . '/' . $relative;
        if (!is_file($file)) return null;
        $content = @file_get_contents($file);
        return is_string($content) && $content !== '' ? $content : null;
    }

    [, $sftp] = portal_media_sftp_connection();
    $path = 'ssh2.sftp://' . intval($sftp) . portal_media_sftp_path($relative);
    if (!@file_exists($path)) return null;
    $content = @file_get_contents($path);
    return is_string($content) && $content !== '' ? $content : null;
}

function portal_media_logo_write(string $codiceSede, string $content): void
{
    $relative = portal_media_logo_relative_path($codiceSede);

    if (portal_media_use_local()) {
        $file = portal_media_local_root() . '/' . $relative;
        $directory = dirname($file);

        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new RuntimeException('Non è stato possibile preparare la cartella del logo.');
        }

        $temporary = $file . '.tmp-' . bin2hex(random_bytes(8));
        if (file_put_contents($temporary, $content, LOCK_EX) === false || !rename($temporary, $file)) {
            @unlink($temporary);
            throw new RuntimeException('Salvataggio del logo non riuscito.');
        }

        @chmod($file, 0644);
        return;
    }

    [, $sftp] = portal_media_sftp_connection();
    $remotePath = portal_media_sftp_path($relative);
    $parts = explode('/', trim(dirname($remotePath), '/'));
    $current = '';

    foreach ($parts as $part) {
        $current .= '/' . $part;
        @ssh2_sftp_mkdir($sftp, $current, 0755, true);
    }

    $stream = @fopen('ssh2.sftp://' . intval($sftp) . $remotePath, 'wb');
    if (!$stream) {
        throw new RuntimeException('Caricamento del logo non riuscito.');
    }

    $written = fwrite($stream, $content);
    fclose($stream);

    if ($written === false || $written !== strlen($content)) {
        throw new RuntimeException('Caricamento del logo incompleto.');
    }
}

function portal_media_logo_delete(string $codiceSede): void
{
    $relative = portal_media_logo_relative_path($codiceSede);

    if (portal_media_use_local()) {
        $file = portal_media_local_root() . '/' . $relative;
        if (is_file($file) && !@unlink($file)) {
            throw new RuntimeException('Eliminazione del logo non riuscita.');
        }
        return;
    }

    [, $sftp] = portal_media_sftp_connection();
    $remotePath = portal_media_sftp_path($relative);
    if (@file_exists('ssh2.sftp://' . intval($sftp) . $remotePath) && !@ssh2_sftp_unlink($sftp, $remotePath)) {
        throw new RuntimeException('Eliminazione del logo non riuscita.');
    }
}

function portal_media_convert_image_to_webp(string $encoded): string
{
    if (str_contains($encoded, ',')) {
        $encoded = explode(',', $encoded, 2)[1];
    }

    $raw = base64_decode($encoded, true);
    if ($raw === false || $raw === '') {
        throw new InvalidArgumentException('L’immagine selezionata non è valida.');
    }

    if (strlen($raw) > 5 * 1024 * 1024) {
        throw new InvalidArgumentException('L’immagine non può superare 5 MB.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->buffer($raw);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        throw new InvalidArgumentException('Seleziona un’immagine JPEG, PNG o WebP.');
    }

    if (!function_exists('imagecreatefromstring') || !function_exists('imagewebp')) {
        throw new RuntimeException('Il server non supporta la conversione delle immagini in WebP.');
    }

    $source = @imagecreatefromstring($raw);
    if (!$source instanceof GdImage) {
        throw new InvalidArgumentException('Non è stato possibile leggere l’immagine selezionata.');
    }

    $width = imagesx($source);
    $height = imagesy($source);
    $ratio = min(1200 / $width, 1200 / $height, 1);
    $outputWidth = max(1, (int)round($width * $ratio));
    $outputHeight = max(1, (int)round($height * $ratio));

    $canvas = imagecreatetruecolor($outputWidth, $outputHeight);
    if (!$canvas instanceof GdImage) {
        imagedestroy($source);
        throw new RuntimeException('Non è stato possibile preparare l’immagine.');
    }

    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
    imagefill($canvas, 0, 0, $transparent);
    imagecopyresampled($canvas, $source, 0, 0, 0, 0, $outputWidth, $outputHeight, $width, $height);

    ob_start();
    $converted = imagewebp($canvas, null, 92);
    $webp = ob_get_clean();

    imagedestroy($canvas);
    imagedestroy($source);

    if (!$converted || !is_string($webp) || $webp === '') {
        throw new RuntimeException('Conversione dell’immagine in WebP non riuscita.');
    }

    return $webp;
}

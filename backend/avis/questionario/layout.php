<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth/bootstrap.php';
require_once __DIR__ . '/../helpers.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
portal_boot($method === 'GET' ? 'GET' : 'POST');
portal_require_admin();

function portal_questionario_layout_ensure(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS questionario_layout_campi (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            id_avis INT NOT NULL,
            chiave_campo VARCHAR(100) NOT NULL,
            tipo_campo VARCHAR(30) NOT NULL DEFAULT "testo",
            pagina INT NOT NULL DEFAULT 1,
            x DECIMAL(10,6) NOT NULL DEFAULT 0,
            y DECIMAL(10,6) NOT NULL DEFAULT 0,
            larghezza DECIMAL(10,6) NOT NULL DEFAULT 0.20,
            altezza DECIMAL(10,6) NOT NULL DEFAULT 0.04,
            font_size DECIMAL(6,2) NULL,
            allineamento VARCHAR(20) NULL,
            attivo TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_questionario_layout_avis (id_avis),
            UNIQUE KEY uq_questionario_layout_campo (id_avis, chiave_campo, pagina)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function portal_questionario_layout_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'chiave_campo' => (string)$row['chiave_campo'],
        'tipo_campo' => (string)$row['tipo_campo'],
        'pagina' => (int)$row['pagina'],
        'x' => (float)$row['x'],
        'y' => (float)$row['y'],
        'larghezza' => (float)$row['larghezza'],
        'altezza' => (float)$row['altezza'],
        'font_size' => $row['font_size'] !== null ? (float)$row['font_size'] : null,
        'allineamento' => $row['allineamento'] !== null ? (string)$row['allineamento'] : null,
        'attivo' => (bool)$row['attivo'],
    ];
}

try {
    if ($method === 'GET') {
        $idAvis = (int)($_GET['id_avis'] ?? 0);
        $input = [];
    } else {
        $input = portal_json_input();
        $idAvis = (int)($input['id_avis'] ?? 0);
    }

    if ($idAvis <= 0) {
        portal_error('Seleziona una AVIS valida.', 400);
    }

    $connection = portal_avis_operational_db($idAvis);
    /** @var PDO $pdo */
    $pdo = $connection['pdo'];
    $scopeId = (int)$connection['scope_id'];

    portal_questionario_layout_ensure($pdo);

    if ($method !== 'GET' && (($input['action'] ?? '') === 'delete_field')) {
        $fieldId = (int)($input['id_campo'] ?? 0);
        $fieldKey = trim((string)($input['chiave_campo'] ?? ''));
        $fieldPage = (int)($input['pagina'] ?? 0);

        if ($fieldId > 0) {
            $deleteField = $pdo->prepare(
                'DELETE FROM questionario_layout_campi
                 WHERE id = :id
                   AND id_avis = :id_avis'
            );
            $deleteField->execute([
                ':id' => $fieldId,
                ':id_avis' => $scopeId,
            ]);
        } elseif ($fieldKey !== '' && $fieldPage > 0) {
            $deleteField = $pdo->prepare(
                'DELETE FROM questionario_layout_campi
                 WHERE id_avis = :id_avis
                   AND chiave_campo = :chiave_campo
                   AND pagina = :pagina'
            );
            $deleteField->execute([
                ':id_avis' => $scopeId,
                ':chiave_campo' => $fieldKey,
                ':pagina' => $fieldPage,
            ]);
        } else {
            portal_error('Campo layout da rimuovere non valido.', 400);
        }

        portal_json([
            'success' => true,
            'message' => 'Campo rimosso dal layout.',
            'deleted' => $deleteField->rowCount(),
        ]);
    }

    if ($method === 'GET') {
        $stmt = $pdo->prepare(
            'SELECT id, chiave_campo, tipo_campo, pagina, x, y, larghezza, altezza,
                    font_size, allineamento, attivo
             FROM questionario_layout_campi
             WHERE id_avis = :id_avis
             ORDER BY pagina, id'
        );
        $stmt->execute([':id_avis' => $scopeId]);

        portal_json([
            'success' => true,
            'campi' => array_map('portal_questionario_layout_row', $stmt->fetchAll(PDO::FETCH_ASSOC)),
        ]);
    }

    $fields = $input['campi'] ?? null;
    if (!is_array($fields)) {
        portal_error('Configurazione layout non valida.', 400);
    }

    if (count($fields) > 300) {
        portal_error('Sono consentiti al massimo 300 campi layout.', 400);
    }

    $allowedTypes = ['testo', 'check', 'firma', 'data'];
    $allowedAlignments = ['', 'sinistra', 'centro', 'destra'];

    $normalized = [];
    $unique = [];

    foreach ($fields as $field) {
        if (!is_array($field)) {
            portal_error('Campo layout non valido.', 400);
        }

        $key = trim((string)($field['chiave_campo'] ?? ''));
        $type = strtolower(trim((string)($field['tipo_campo'] ?? 'testo')));
        $page = (int)($field['pagina'] ?? 1);
        $x = round((float)($field['x'] ?? 0), 4);
        $y = round((float)($field['y'] ?? 0), 4);
        $width = round((float)($field['larghezza'] ?? 0.20), 4);
        $height = round((float)($field['altezza'] ?? 0.04), 4);
        $fontSize = $field['font_size'] === null || $field['font_size'] === ''
            ? null
            : (float)$field['font_size'];
        $alignment = strtolower(trim((string)($field['allineamento'] ?? '')));
        $active = portal_avis_bool($field['attivo'] ?? true);

        if ($key === '' || strlen($key) > 100 || !preg_match('/^[A-Za-z0-9_.:-]+$/', $key)) {
            portal_error('Chiave campo non valida: ' . $key, 400);
        }

        if (!in_array($type, $allowedTypes, true)) {
            portal_error('Tipo campo non valido.', 400);
        }

        if ($page < 1 || $page > 99) {
            portal_error('Pagina campo non valida.', 400);
        }

        if ($x < 0 || $y < 0 || $x > 1 || $y > 1 || $width <= 0 || $height <= 0 || $width > 1 || $height > 1) {
            portal_error('Coordinate o dimensioni campo non valide.', 400);
        }

        if ($x + $width > 1.000001 || $y + $height > 1.000001) {
            portal_error('Un campo supera i limiti della pagina.', 400);
        }

        if ($fontSize !== null && ($fontSize < 4 || $fontSize > 72)) {
            portal_error('Dimensione font non valida.', 400);
        }

        if (!in_array($alignment, $allowedAlignments, true)) {
            portal_error('Allineamento non valido.', 400);
        }

        $uniqueKey = $page . ':' . $key;
        if (isset($unique[$uniqueKey])) {
            portal_error('Campo duplicato nella stessa pagina: ' . $key, 400);
        }
        $unique[$uniqueKey] = true;

        $normalized[] = [
            'chiave_campo' => $key,
            'tipo_campo' => $type,
            'pagina' => $page,
            'x' => $x,
            'y' => $y,
            'larghezza' => $width,
            'altezza' => $height,
            'font_size' => $fontSize,
            'allineamento' => $alignment !== '' ? $alignment : null,
            'attivo' => $active,
        ];
    }

    $pdo->beginTransaction();

    $delete = $pdo->prepare('DELETE FROM questionario_layout_campi WHERE id_avis = :id_avis');
    $delete->execute([':id_avis' => $scopeId]);

    $insert = $pdo->prepare(
        'INSERT INTO questionario_layout_campi
            (id_avis, chiave_campo, tipo_campo, pagina, x, y, larghezza, altezza, font_size, allineamento, attivo)
         VALUES
            (:id_avis, :chiave_campo, :tipo_campo, :pagina, :x, :y, :larghezza, :altezza, :font_size, :allineamento, :attivo)'
    );

    foreach ($normalized as $field) {
        $insert->execute([
            ':id_avis' => $scopeId,
            ':chiave_campo' => $field['chiave_campo'],
            ':tipo_campo' => $field['tipo_campo'],
            ':pagina' => $field['pagina'],
            ':x' => $field['x'],
            ':y' => $field['y'],
            ':larghezza' => $field['larghezza'],
            ':altezza' => $field['altezza'],
            ':font_size' => $field['font_size'],
            ':allineamento' => $field['allineamento'],
            ':attivo' => $field['attivo'],
        ]);
    }

    $pdo->commit();

    portal_json([
        'success' => true,
        'message' => 'Layout PDF salvato correttamente.',
        'campi' => $normalized,
    ]);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('[portal_questionario_layout] ' . $error::class . ': ' . $error->getMessage());
    portal_error('Non è stato possibile gestire il layout PDF.', 500);
}

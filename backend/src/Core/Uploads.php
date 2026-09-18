<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Validates and stores uploads outside the web root.
 * Files get random names; the original name is only kept in the database.
 */
final class Uploads
{
    private const TYPES = [
        'pdf' => ['mimes' => ['application/pdf' => 'pdf'], 'max_key' => 'uploads.max_pdf_mb'],
        'image' => ['mimes' => ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'], 'max_key' => 'uploads.max_image_mb'],
        // Proof of a bank transfer (commitment fee): PDF, JPG or PNG
        'proof' => ['mimes' => ['application/pdf' => 'pdf', 'image/png' => 'png', 'image/jpeg' => 'jpg'], 'max_key' => 'uploads.max_proof_mb', 'default_mb' => 5],
        'document' => [
            'mimes' => [
                'application/pdf' => 'pdf',
                'image/png' => 'png',
                'image/jpeg' => 'jpg',
                'image/webp' => 'webp',
                'application/zip' => 'zip',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
            ],
            'max_key' => 'uploads.max_document_mb',
        ],
    ];

    /**
     * @param array{name:string,type:string,tmp_name:string,error:int,size:int} $file
     * @param 'pdf'|'image'|'proof'|'document' $kind
     * @return array{id:int, publicId:string, name:string, size:int, mime:string}
     */
    public static function store(array $file, string $kind, string $visibility = 'private', ?int $userId = null, string $field = 'file'): array
    {
        $spec = self::TYPES[$kind];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $message = match ($file['error']) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'That file is too large.',
                UPLOAD_ERR_PARTIAL => 'The upload was interrupted. Please try again.',
                default => 'The file could not be uploaded.',
            };
            throw HttpError::validation([$field => $message]);
        }
        if (!is_uploaded_file($file['tmp_name']) && PHP_SAPI !== 'cli') {
            throw HttpError::validation([$field => 'Invalid upload.']);
        }

        $maxBytes = (int) Config::get($spec['max_key'], $spec['default_mb'] ?? 10) * 1024 * 1024;
        if ($file['size'] <= 0) {
            throw HttpError::validation([$field => 'That file is empty.']);
        }
        if ($file['size'] > $maxBytes) {
            throw HttpError::validation([$field => sprintf('Files must be %d MB or smaller.', $maxBytes / 1024 / 1024)]);
        }

        // Trust the file contents, never the browser-supplied type or extension.
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
        if (!isset($spec['mimes'][$mime])) {
            $allowed = match ($kind) {
                'pdf' => 'PDF files',
                'image' => 'PNG, JPG, WebP or GIF images',
                'proof' => 'PDF, JPG or PNG files',
                default => 'PDF, images, Office documents or ZIP files',
            };
            throw HttpError::validation([$field => "Only {$allowed} are allowed."]);
        }
        if ($mime === 'application/pdf') {
            $handle = fopen($file['tmp_name'], 'rb');
            $magic = $handle ? fread($handle, 5) : '';
            if ($handle) {
                fclose($handle);
            }
            if ($magic !== '%PDF-') {
                throw HttpError::validation([$field => "That file doesn't look like a valid PDF."]);
            }
        }
        if (str_starts_with($mime, 'image/') && @getimagesize($file['tmp_name']) === false) {
            throw HttpError::validation([$field => "That image couldn't be read."]);
        }

        $dir = self::directory();
        $publicId = bin2hex(random_bytes(16));
        $storedName = $publicId . '.' . $spec['mimes'][$mime];
        $target = $dir . '/' . $storedName;
        $moved = PHP_SAPI === 'cli' ? copy($file['tmp_name'], $target) : move_uploaded_file($file['tmp_name'], $target);
        if (!$moved) {
            throw new HttpError(500, 'Could not save the file. Please try again.');
        }
        @chmod($target, 0640);

        $originalName = mb_substr(basename(str_replace('\\', '/', $file['name'])), 0, 200) ?: $storedName;
        $id = Database::insert('files', [
            'public_id' => $publicId,
            'original_name' => $originalName,
            'stored_name' => $storedName,
            'mime_type' => $mime,
            'size_bytes' => (int) $file['size'],
            'visibility' => $visibility,
            'uploaded_by_user' => $userId,
        ]);

        return ['id' => $id, 'publicId' => $publicId, 'name' => $originalName, 'size' => (int) $file['size'], 'mime' => $mime];
    }

    public static function path(array $fileRow): string
    {
        return self::directory() . '/' . basename((string) $fileRow['stored_name']);
    }

    public static function delete(int $fileId): void
    {
        $row = Database::one('SELECT stored_name FROM files WHERE id = ?', [$fileId]);
        if ($row) {
            @unlink(self::path($row));
            Database::run('DELETE FROM files WHERE id = ?', [$fileId]);
        }
    }

    private static function directory(): string
    {
        $dir = (string) Config::get('uploads.path', APC_ROOT . '/storage/uploads');
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new HttpError(500, 'Upload folder is not writable.');
        }
        return rtrim($dir, '/\\');
    }

    public static function humanSize(int $bytes): string
    {
        return $bytes >= 1_000_000 ? sprintf('%.1f MB', $bytes / 1_000_000) : sprintf('%d KB', max(1, (int) round($bytes / 1000)));
    }
}

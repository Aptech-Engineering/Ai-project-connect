<?php

declare(strict_types=1);

namespace App\Analytics;

/**
 * Table exports (spec 10.1). Every file states the range, filters, generation time and "Confidential".
 *   CSV  — one table, UTF-8 with BOM, raw numbers, a unit row under the header.
 *   XLSX — one sheet per table plus "Read me" (built with ZipArchive; no library needed).
 *   XLS  — SpreadsheetML 2003 XML, used automatically when the zip extension is missing.
 */
final class Export
{
    public static function xlsxAvailable(): bool
    {
        return class_exists(\ZipArchive::class);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @param array{title:string, range:string, filters:string, generatedAt:string, definitions:array<string,string>} $meta
     */
    public static function csv(array $rows, array $meta): string
    {
        [$headers, $units, $matrix] = self::matrix($rows);
        $out = fopen('php://temp', 'r+');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $headers, ',', '"', '');
        fputcsv($out, $units, ',', '"', '');
        foreach ($matrix as $line) {
            fputcsv($out, $line, ',', '"', '');
        }
        fwrite($out, "\n");
        fputcsv($out, ['# Confidential — Aptech. ' . $meta['title'] . ' · ' . $meta['range'] . ' · Filters: ' . $meta['filters'] . ' · Generated ' . $meta['generatedAt']], ',', '"', '');
        rewind($out);
        $csv = (string) stream_get_contents($out);
        fclose($out);
        return $csv;
    }

    /** @param array<string, list<array>> $tables */
    public static function xlsx(array $tables, array $meta): string
    {
        $sheets = ['Read me' => self::readMe($meta)];
        foreach ($tables as $name => $rows) {
            [$headers, $units, $matrix] = self::matrix($rows);
            $sheets[self::sheetName($name, array_keys($sheets))] = array_merge([$headers, $units], $matrix);
        }

        $file = tempnam(sys_get_temp_dir(), 'apcx');
        $zip = new \ZipArchive();
        $zip->open($file, \ZipArchive::OVERWRITE);
        $n = count($sheets);
        $overrides = '';
        $workbookSheets = '';
        $rels = '';
        for ($i = 1; $i <= $n; $i++) {
            $overrides .= '<Override PartName="/xl/worksheets/sheet' . $i . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . $overrides . '</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $i = 0;
        foreach ($sheets as $name => $matrix) {
            $i++;
            $workbookSheets .= '<sheet name="' . self::xml($name) . '" sheetId="' . $i . '" r:id="rId' . $i . '"/>';
            $rels .= '<Relationship Id="rId' . $i . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $i . '.xml"/>';
            $zip->addFromString('xl/worksheets/sheet' . $i . '.xml', self::sheetXml($matrix, $name !== 'Read me'));
        }
        $rels .= '<Relationship Id="rId' . ($n + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets>' . $workbookSheets . '</sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $rels . '</Relationships>');
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            . '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
            . '</styleSheet>');
        $zip->close();
        $bytes = (string) file_get_contents($file);
        @unlink($file);
        return $bytes;
    }

    /** SpreadsheetML 2003 (.xls) — opens in Excel and LibreOffice; used when ZipArchive is unavailable. */
    public static function xls(array $tables, array $meta): string
    {
        $sheets = ['Read me' => self::readMe($meta)];
        foreach ($tables as $name => $rows) {
            [$headers, $units, $matrix] = self::matrix($rows);
            $sheets[self::sheetName($name, array_keys($sheets))] = array_merge([$headers, $units], $matrix);
        }
        $xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'
            . '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
        foreach ($sheets as $name => $matrix) {
            $xml .= '<Worksheet ss:Name="' . self::xml($name) . '"><Table>';
            foreach ($matrix as $line) {
                $xml .= '<Row>';
                foreach ($line as $cell) {
                    $num = is_int($cell) || is_float($cell);
                    $xml .= '<Cell><Data ss:Type="' . ($num ? 'Number' : 'String') . '">' . self::xml((string) ($cell ?? '')) . '</Data></Cell>';
                }
                $xml .= '</Row>';
            }
            $xml .= '</Table></Worksheet>';
        }
        return $xml . '</Workbook>';
    }

    /* ---------------- helpers ---------------- */

    /** @return list<list<string>> */
    private static function readMe(array $meta): array
    {
        $rows = [
            ['AI Project Connect — Analytics export', ''],
            ['Confidential', 'Confidential — Aptech. For staff with analytics access only.'],
            ['Screen', $meta['title']],
            ['Range', $meta['range']],
            ['Filters', $meta['filters']],
            ['Generated', $meta['generatedAt']],
            ['Timezone', 'Africa/Lagos'],
            ['Units', 'The second row of every sheet gives each column\'s unit. Ratios are 0–1 (0.25 = 25%); money is NGN; durations are seconds unless the column says otherwise.'],
            ['', ''],
            ['Metric', 'Definition'],
        ];
        foreach ($meta['definitions'] as $key => $text) {
            $rows[] = [Definitions::get((string) $key)['label'] . ' (' . $key . ')', $text];
        }
        return $rows;
    }

    /**
     * Flattens rows (nested objects become dotted columns) and works out a unit per column.
     * @return array{0:list<string>, 1:list<string>, 2:list<list<mixed>>}
     */
    public static function matrix(array $rows): array
    {
        $flat = array_map(static fn ($row) => self::flatten((array) $row), $rows);
        $headers = [];
        foreach ($flat as $row) {
            foreach (array_keys($row) as $k) {
                $headers[$k] = true;
            }
        }
        $headers = array_keys($headers);
        $units = array_map(static fn (string $h) => self::unit($h, array_column($flat, $h), $flat), $headers);
        $matrix = [];
        foreach ($flat as $row) {
            $line = [];
            foreach ($headers as $h) {
                $v = $row[$h] ?? null;
                $line[] = is_bool($v) ? ($v ? 'true' : 'false') : $v;
            }
            $matrix[] = $line;
        }
        return [$headers, $units, $matrix];
    }

    private static function flatten(array $row, string $prefix = ''): array
    {
        $out = [];
        foreach ($row as $k => $v) {
            if (is_object($v)) {
                $v = (array) $v;
            }
            $key = $prefix . $k;
            if (is_array($v) && array_is_list($v) && $v !== [] && is_array($v[0]) && isset($v[0]['key'])) {
                foreach ($v as $item) {
                    $out += self::flatten(array_diff_key($item, ['key' => 1, 'label' => 1]), $key . '.' . $item['key'] . '.');
                }
            } elseif (is_array($v) && !array_is_list($v)) {
                $out += self::flatten($v, $key . '.');
            } elseif (is_array($v)) {
                $out[$key] = implode('; ', array_map(static fn ($x) => is_scalar($x) ? (string) $x : json_encode($x), $v));
            } else {
                $out[$key] = $v;
            }
        }
        return $out;
    }

    private static function unit(string $header, array $values, array $rows): string
    {
        $leaf = strtolower((string) preg_replace('/^.*\./', '', $header));
        if ($leaf === 'value' || $leaf === 'previous') {
            // KPI rows say their own unit in the "format" column.
            $formats = array_unique(array_filter(array_column($rows, 'format')));
            if (count($formats) > 1) {
                return 'see format';
            }
            $format = $formats[0] ?? null;
            if ($format !== null) {
                return match ($format) { 'currency' => 'NGN', 'percent' => 'ratio (0–1)', 'duration' => 'seconds', default => 'count' };
            }
        }
        $numeric = $values !== [] && array_filter($values, static fn ($v) => $v !== null && !is_int($v) && !is_float($v)) === [];
        return match (true) {
            (bool) preg_match('/(rate|share|ctr|conversion|fromprevious|fromstart|change|overall)$/', $leaf) => 'ratio (0–1)',
            (bool) preg_match('/(amount|revenue|mrr|fees|value)$/', $leaf) && $numeric => 'NGN',
            (bool) preg_match('/ms$/', $leaf) => 'milliseconds',
            (bool) preg_match('/hours$/', $leaf) => 'hours',
            (bool) preg_match('/days|dayswaiting|daysoverdue|daysearlyorlate/', $leaf) => 'days',
            (bool) preg_match('/(seconds|time|duration)/', $leaf) && $numeric => 'seconds',
            (bool) preg_match('/(at|date)$/', $leaf) => 'ISO 8601 date',
            $numeric => 'count',
            default => 'text',
        };
    }

    private static function sheetXml(array $matrix, bool $boldFirstRows): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        foreach ($matrix as $r => $line) {
            $xml .= '<row r="' . ($r + 1) . '">';
            foreach (array_values($line) as $c => $cell) {
                $ref = self::column($c) . ($r + 1);
                $style = $r === 0 || (!$boldFirstRows && ($line[0] ?? '') === 'Metric') ? ' s="1"' : '';
                if (is_int($cell) || is_float($cell)) {
                    $xml .= '<c r="' . $ref . '"' . $style . '><v>' . $cell . '</v></c>';
                } elseif ($cell !== null && $cell !== '') {
                    $xml .= '<c r="' . $ref . '" t="inlineStr"' . $style . '><is><t xml:space="preserve">' . self::xml((string) $cell) . '</t></is></c>';
                }
            }
            $xml .= '</row>';
        }
        return $xml . '</sheetData></worksheet>';
    }

    private static function column(int $index): string
    {
        $name = '';
        for ($i = $index + 1; $i > 0; $i = intdiv($i - 1, 26)) {
            $name = chr(65 + (($i - 1) % 26)) . $name;
        }
        return $name;
    }

    private static function sheetName(string $name, array $taken): string
    {
        $base = mb_substr(trim((string) preg_replace('/[\[\]\*\?\/\\\\:]/', ' ', $name)), 0, 28) ?: 'Sheet';
        $candidate = $base;
        for ($n = 2; in_array($candidate, $taken, true); $n++) {
            $candidate = $base . ' ' . $n;
        }
        return $candidate;
    }

    private static function xml(string $s): string
    {
        $s = (string) preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}]/u', '', $s);
        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}

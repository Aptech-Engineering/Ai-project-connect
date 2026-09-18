<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;
use App\Support\Wallet;

/** Sales pipeline — how ideas turn into quotes and projects (spec 4.7). */
final class Pipeline extends Screen
{
    /** Here `state` is the idea's state (where the client is), not the visitor's location. */
    public const FILTERS = ['category', 'state'];
    public const DEFINITIONS = ['ideasSubmitted', 'draftsStarted', 'draftCompletionRate', 'timeToFirstQuote', 'quoteAcceptanceRate', 'walkInShare', 'ideaToProjectConversion'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $cur = self::values($p);
        $old = $prev ? self::values($prev) : null;
        $kpis = [];
        foreach (['ideasSubmitted' => 'number', 'draftsStarted' => 'number', 'draftCompletionRate' => 'percent', 'timeToFirstQuote' => 'duration', 'quoteAcceptanceRate' => 'percent', 'walkInShare' => 'percent'] as $key => $format) {
            $kpis[] = Blocks::kpi($key, $cur[$key], $old[$key] ?? null, $format);
        }

        [$w, $params] = self::submittedWhere($p);
        $bucket = Period::bucketSql('i.submitted_at', $p->interval);
        $online = [];
        $walkIn = [];
        foreach (Database::all("SELECT {$bucket} AS t, i.source, COUNT(*) AS n FROM ideas i WHERE {$w} GROUP BY t, i.source", $params) as $row) {
            if ($row['source'] === 'walk_in') {
                $walkIn[$row['t']] = (int) $row['n'];
            } else {
                $online[$row['t']] = (int) $row['n'];
            }
        }

        $ideas = Database::all("SELECT i.category, i.platforms, i.budget, i.state FROM ideas i WHERE {$w}", $params);
        $by = ['category' => [], 'platform' => [], 'budget' => [], 'state' => []];
        foreach ($ideas as $idea) {
            foreach (['category', 'budget', 'state'] as $dim) {
                $key = (string) ($idea[$dim] ?? '') ?: '(none)';
                $by[$dim][$key] = ($by[$dim][$key] ?? 0) + 1;
            }
            foreach (json_decode((string) $idea['platforms'], true) ?: ['(none)'] as $platform) {
                $by['platform'][(string) $platform] = ($by['platform'][(string) $platform] ?? 0) + 1;
            }
        }
        $total = count($ideas);

        return [
            'kpis' => $kpis,
            'series' => ['submitted' => [
                'online' => Blocks::series('online', $p, $online),
                'walkIn' => Blocks::series('walkIn', $p, $walkIn),
            ]],
            'by' => array_map(static fn (array $values) => Blocks::rows($values, null, [], array_combine(array_keys($values), array_keys($values)), null, $total), $by),
            'ageing' => self::ageing($p),
            'table' => self::table($p),
        ];
    }

    /** @return array{0:string, 1:list<mixed>} */
    private static function submittedWhere(Period $p): array
    {
        $sql = "i.status <> 'DRAFT' AND i.submitted_at >= ? AND i.submitted_at < ?";
        $params = [$p->start(), $p->endExclusive()];
        foreach (['category', 'state'] as $f) {
            if (isset($p->filters[$f])) {
                $sql .= " AND i.{$f} = ?";
                $params[] = $p->filters[$f];
            }
        }
        return [$sql, $params];
    }

    private static function values(Period $p): array
    {
        [$w, $params] = self::submittedWhere($p);
        $s = Database::one("SELECT COUNT(*) AS n, COALESCE(SUM(i.source = 'walk_in'), 0) AS walk_in, COALESCE(SUM(i.project_id IS NOT NULL), 0) AS converted FROM ideas i WHERE {$w}", $params);

        $dSql = 'i.created_at >= ? AND i.created_at < ?';
        $dParams = [$p->start(), $p->endExclusive()];
        foreach (['category', 'state'] as $f) {
            if (isset($p->filters[$f])) {
                $dSql .= " AND i.{$f} = ?";
                $dParams[] = $p->filters[$f];
            }
        }
        $d = Database::one("SELECT COUNT(*) AS started, COALESCE(SUM(i.submitted_at IS NOT NULL AND i.status <> 'DRAFT'), 0) AS completed FROM ideas i WHERE {$dSql}", $dParams);

        $gaps = array_map(static fn ($r) => max(0, strtotime((string) $r['first_quote']) - strtotime((string) $r['submitted_at'])), Database::all(
            "SELECT i.submitted_at, q.first_quote FROM ideas i JOIN (SELECT idea_id, MIN(created_at) AS first_quote FROM quotes GROUP BY idea_id) q ON q.idea_id = i.id
             WHERE i.submitted_at IS NOT NULL AND q.first_quote >= ? AND q.first_quote < ?" . (isset($p->filters['category']) ? ' AND i.category = ?' : ''),
            array_merge([$p->start(), $p->endExclusive()], isset($p->filters['category']) ? [$p->filters['category']] : []),
        ));

        return [
            'ideasSubmitted' => (int) $s['n'],
            'draftsStarted' => (int) $d['started'],
            'draftCompletionRate' => Blocks::ratio((int) $d['completed'], (int) $d['started']),
            'timeToFirstQuote' => Metrics::medianSeconds($gaps),
            'quoteAcceptanceRate' => self::acceptanceRate($p),
            'walkInShare' => Blocks::ratio((int) $s['walk_in'], (int) $s['n']),
            'ideaToProjectConversion' => Blocks::ratio((int) $s['converted'], (int) $s['n']),
        ];
    }

    /** Accepted ÷ closed (accepted, declined, withdrawn, or expired while open), for quotes sent in the range. */
    public static function acceptanceRate(Period $p): ?float
    {
        [$cat, $catParams] = Metrics::ideaFilters($p, '', []);
        $r = Database::one(
            "SELECT COALESCE(SUM(q.status = 'accepted'), 0) AS accepted,
                    COALESCE(SUM(q.status IN ('accepted', 'declined', 'withdrawn') OR (q.status = 'sent' AND q.valid_until < CURDATE())), 0) AS closed
             FROM quotes q JOIN ideas i ON i.id = q.idea_id WHERE q.created_at >= ? AND q.created_at < ?{$cat}",
            array_merge([$p->start(), $p->endExclusive()], $catParams),
        );
        return Blocks::ratio((int) $r['accepted'], (int) $r['closed']);
    }

    /** Submitted ideas still waiting for a first quote, right now, by days waiting. */
    private static function ageing(Period $p): array
    {
        $buckets = ['0-2' => 0, '3-7' => 0, '8-14' => 0, '15+' => 0];
        $sql = "SELECT DATEDIFF(CURDATE(), DATE(i.submitted_at)) AS days FROM ideas i
                WHERE i.status IN ('NEW', 'REVIEWING') AND i.project_id IS NULL AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.idea_id = i.id)";
        $params = [];
        foreach (['category', 'state'] as $f) {
            if (isset($p->filters[$f])) {
                $sql .= " AND i.{$f} = ?";
                $params[] = $p->filters[$f];
            }
        }
        foreach (Database::all($sql, $params) as $row) {
            $d = (int) $row['days'];
            $buckets[$d <= 2 ? '0-2' : ($d <= 7 ? '3-7' : ($d <= 14 ? '8-14' : '15+'))]++;
        }
        $labels = ['0-2' => '0–2 days', '3-7' => '3–7 days', '8-14' => '8–14 days', '15+' => '15+ days'];
        $out = [];
        foreach ($buckets as $key => $n) {
            $out[] = ['key' => $key, 'label' => $labels[$key], 'value' => $n];
        }
        return $out;
    }

    private static function table(Period $p): array
    {
        [$w, $params] = self::submittedWhere($p);
        $rows = Database::all(
            "SELECT i.id, i.ref, i.title, i.category, i.source, i.status, i.submitted_at, i.project_id,
                    (SELECT MIN(q.created_at) FROM quotes q WHERE q.idea_id = i.id) AS first_quote
             FROM ideas i WHERE {$w} ORDER BY i.submitted_at DESC LIMIT 500",
            $params,
        );
        // Current fee status per idea in one query, using the same ranking as Wallet::current().
        $fees = [];
        $ids = array_map('intval', array_column($rows, 'id'));
        if ($ids !== []) {
            $best = [];
            $pays = Database::all('SELECT id, idea_id, status, refund_status FROM idea_payments WHERE idea_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
            foreach ($pays as $pay) {
                $rank = match (true) {
                    $pay['status'] === 'PAID' && $pay['refund_status'] === 'NONE' => 1,
                    $pay['status'] === 'PAID' && $pay['refund_status'] === 'PENDING' => 2,
                    $pay['status'] === 'AWAITING_CONFIRMATION' => 3,
                    $pay['status'] === 'PENDING' => 4,
                    $pay['status'] === 'PAID' => 5,
                    default => 6,
                };
                $cur = $best[$pay['idea_id']] ?? null;
                if ($cur === null || $rank < $cur[0] || ($rank === $cur[0] && (int) $pay['id'] > (int) $cur[1]['id'])) {
                    $best[$pay['idea_id']] = [$rank, $pay];
                }
            }
            foreach ($ids as $id) {
                $fees[$id] = Wallet::statusOf($best[$id][1] ?? null);
            }
        }
        return array_map(static fn (array $row) => [
            'ref' => $row['ref'],
            'title' => $row['title'],
            'category' => $row['category'],
            'source' => $row['source'],
            'submittedAt' => date('c', (int) strtotime((string) $row['submitted_at'])),
            'feeStatus' => $fees[$row['id']],
            'stage' => $row['status'],
            'daysWaiting' => $row['first_quote'] === null && in_array($row['status'], ['NEW', 'REVIEWING'], true)
                ? (int) floor((time() - strtotime((string) $row['submitted_at'])) / 86400) : null,
        ], $rows);
    }
}

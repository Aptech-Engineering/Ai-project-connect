<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;

/** Clients — who uses the portal, and how often? (spec 4.8) */
final class Clients extends Screen
{
    public const FILTERS = [];
    public const DEFINITIONS = ['newClients', 'activeClients', 'portalSignIns', 'returningClientRate', 'messagesFromClients', 'medianTeamReplyTime'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $cur = self::values($p);
        $old = $prev ? self::values($prev) : null;
        $kpis = [];
        foreach (['newClients' => 'number', 'activeClients' => 'number', 'portalSignIns' => 'number', 'returningClientRate' => 'percent', 'messagesFromClients' => 'number', 'medianTeamReplyTime' => 'duration'] as $key => $format) {
            $kpis[] = Blocks::kpi($key, $cur[$key], $old[$key] ?? null, $format, null, $key === 'medianTeamReplyTime' ? ['unanswered' => $cur['unanswered']] : []);
        }

        $bucket = Period::bucketSql('o.consumed_at', $p->interval);
        $signIns = array_map('intval', array_column(Database::all(
            "SELECT {$bucket} AS t, COUNT(*) AS n FROM otp_codes o WHERE o.consumed_at >= ? AND o.consumed_at < ? GROUP BY t",
            [$p->start(), $p->endExclusive()],
        ), 'n', 't'));

        $range = [$p->start(), $p->endExclusive()];
        $engagement = Database::one(
            "SELECT
                (SELECT COUNT(*) FROM milestones WHERE client_approved_at >= ? AND client_approved_at < ?) AS approvals,
                (SELECT COUNT(*) FROM change_requests WHERE requested_by = 'client' AND created_at >= ? AND created_at < ?) AS change_requests,
                (SELECT COUNT(*) FROM project_files WHERE source = 'client' AND created_at >= ? AND created_at < ?) AS uploads,
                (SELECT COUNT(*) FROM leads WHERE source = 'portal' AND created_at >= ? AND created_at < ?) AS course_requests,
                (SELECT COUNT(*) FROM projects WHERE rated_at >= ? AND rated_at < ?) AS ratings",
            array_merge($range, $range, $range, $range, $range),
        );
        $opt = Database::one(
            'SELECT (SELECT COUNT(*) FROM clients) AS clients, (SELECT COUNT(*) FROM clients WHERE digest_opt_out = 1) AS digest,
                    (SELECT COUNT(DISTINCT client_id) FROM projects) AS with_projects,
                    (SELECT COUNT(DISTINCT client_id) FROM projects WHERE promos_opt_out = 1) AS promos',
        );

        $locations = [];
        $extra = [];
        foreach (Database::all("SELECT COALESCE(NULLIF(state, ''), '(unknown)') AS state, COALESCE(NULLIF(country, ''), '(unknown)') AS country, COUNT(*) AS n FROM clients WHERE created_at < ? GROUP BY state, country", [$p->endExclusive()]) as $row) {
            $key = $row['state'] . ', ' . $row['country'];
            $locations[$key] = (int) $row['n'];
            $extra[$key] = ['state' => $row['state'], 'country' => $row['country']];
        }

        return [
            'kpis' => $kpis,
            'series' => ['signIns' => Blocks::series('signIns', $p, $signIns, $prev ? self::signInSeries($prev) : null)],
            'engagement' => array_map('intval', [
                'approvals' => $engagement['approvals'], 'changeRequests' => $engagement['change_requests'], 'uploads' => $engagement['uploads'],
                'courseRequests' => $engagement['course_requests'], 'ratings' => $engagement['ratings'],
            ]),
            'optOuts' => [
                'digest' => Blocks::ratio((int) $opt['digest'], (int) $opt['clients']),
                'promos' => Blocks::ratio((int) $opt['promos'], (int) $opt['with_projects']),
            ],
            'byLocation' => Blocks::rows($locations, null, $extra, array_combine(array_keys($locations), array_keys($locations))),
        ];
    }

    private static function signInSeries(Period $p): array
    {
        $bucket = Period::bucketSql('o.consumed_at', $p->interval);
        return array_map('intval', array_column(Database::all("SELECT {$bucket} AS t, COUNT(*) AS n FROM otp_codes o WHERE o.consumed_at >= ? AND o.consumed_at < ? GROUP BY t", [$p->start(), $p->endExclusive()]), 'n', 't'));
    }

    private static function values(Period $p): array
    {
        $range = [$p->start(), $p->endExclusive()];
        $new = (int) Database::value('SELECT COUNT(*) FROM clients WHERE created_at >= ? AND created_at < ?', $range);
        $signIns = (int) Database::value('SELECT COUNT(*) FROM otp_codes WHERE consumed_at >= ? AND consumed_at < ?', $range);
        $active = array_map('intval', array_column(Database::all(
            'SELECT DISTINCT pr.client_id FROM otp_codes o JOIN projects pr ON pr.id = o.project_id WHERE o.consumed_at >= ? AND o.consumed_at < ?',
            $range,
        ), 'client_id'));
        $returning = 0;
        if ($active !== []) {
            $before = date('Y-m-d H:i:s', strtotime($p->start() . ' -30 days'));
            $returning = (int) Database::value(
                'SELECT COUNT(DISTINCT pr.client_id) FROM otp_codes o JOIN projects pr ON pr.id = o.project_id
                 WHERE o.consumed_at >= ? AND o.consumed_at < ? AND pr.client_id IN (' . implode(',', array_fill(0, count($active), '?')) . ')',
                array_merge([$before, $p->start()], $active),
            );
        }
        $replies = self::replyTimes($p);
        return [
            'newClients' => $new,
            'activeClients' => count($active),
            'portalSignIns' => $signIns,
            'returningClientRate' => Blocks::ratio($returning, count($active)),
            'messagesFromClients' => (int) Database::value("SELECT COUNT(*) FROM messages WHERE sender = 'client' AND created_at >= ? AND created_at < ?", $range),
            'medianTeamReplyTime' => Metrics::medianSeconds($replies['seconds']),
            'unanswered' => $replies['unanswered'],
        ];
    }

    /**
     * For each client message in the range: seconds until the next team message on the same project.
     * @return array{seconds:list<int>, unanswered:int, byUser:array<int, list<int>>}
     */
    public static function replyTimes(Period $p): array
    {
        $rows = Database::all(
            "SELECT m.id, m.created_at,
                    (SELECT t.created_at FROM messages t WHERE t.project_id = m.project_id AND t.sender = 'team' AND (t.created_at > m.created_at OR (t.created_at = m.created_at AND t.id > m.id)) ORDER BY t.created_at, t.id LIMIT 1) AS reply_at,
                    (SELECT t.user_id FROM messages t WHERE t.project_id = m.project_id AND t.sender = 'team' AND (t.created_at > m.created_at OR (t.created_at = m.created_at AND t.id > m.id)) ORDER BY t.created_at, t.id LIMIT 1) AS reply_by
             FROM messages m WHERE m.sender = 'client' AND m.created_at >= ? AND m.created_at < ?",
            [$p->start(), $p->endExclusive()],
        );
        $seconds = [];
        $byUser = [];
        $unanswered = 0;
        foreach ($rows as $row) {
            if ($row['reply_at'] === null) {
                $unanswered++;
                continue;
            }
            $s = max(0, strtotime((string) $row['reply_at']) - strtotime((string) $row['created_at']));
            $seconds[] = $s;
            if ($row['reply_by'] !== null) {
                $byUser[(int) $row['reply_by']][] = $s;
            }
        }
        return ['seconds' => $seconds, 'unanswered' => $unanswered, 'byUser' => $byUser];
    }
}

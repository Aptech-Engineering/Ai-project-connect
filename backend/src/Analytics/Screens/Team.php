<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;
use App\Support\Presenter;

/** Team — how quickly the team updates clients and replies (spec 4.10), admin only. */
final class Team extends Screen
{
    public const ADMIN_ONLY = true;
    public const FILTERS = [];
    public const DEFINITIONS = ['updatesPosted', 'approvalTime', 'clientReplyTime', 'quotesSent', 'paymentsConfirmed', 'workload'];
    public const CAPTION = 'Use these numbers to spot overload and slow spots, not to rank people.';

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $cur = self::values($p);
        $old = $prev ? self::values($prev) : null;
        $kpis = [];
        foreach (['updatesPosted' => 'number', 'approvalTime' => 'duration', 'clientReplyTime' => 'duration', 'quotesSent' => 'number', 'paymentsConfirmed' => 'number'] as $key => $format) {
            $kpis[] = Blocks::kpi($key, $cur[$key], $old[$key] ?? null, $format);
        }

        $range = [$p->start(), $p->endExclusive()];
        $workload = self::workload();
        $updates = [];
        foreach (Database::all("SELECT author_id, SUM(visibility = 'client') AS client_updates, SUM(visibility = 'internal') AS internal_notes FROM updates WHERE kind = 'update' AND created_at >= ? AND created_at < ? AND author_id IS NOT NULL GROUP BY author_id", $range) as $row) {
            $updates[(int) $row['author_id']] = $row;
        }
        $replies = array_map('intval', array_column(Database::all("SELECT user_id, COUNT(*) AS n FROM messages WHERE sender = 'team' AND user_id IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY user_id", $range), 'n', 'user_id'));
        $approvals = array_map('intval', array_column(Database::all('SELECT approved_by, COUNT(*) AS n FROM updates WHERE approved_by IS NOT NULL AND published_at >= ? AND published_at < ? GROUP BY approved_by', $range), 'n', 'approved_by'));
        $replyTimes = Clients::replyTimes($p)['byUser'];

        $people = [];
        foreach (Database::all("SELECT id, name, role FROM users WHERE status = 'active' AND role IN ('admin', 'lead', 'engineer') ORDER BY name") as $u) {
            $id = (int) $u['id'];
            $people[] = [
                'name' => $u['name'],
                'role' => Presenter::roleLabel($u['role']),
                'projects' => $workload[$id] ?? 0,
                'updates' => (int) ($updates[$id]['client_updates'] ?? 0),
                'internalNotes' => (int) ($updates[$id]['internal_notes'] ?? 0),
                'replies' => $replies[$id] ?? 0,
                'medianReplyTime' => Metrics::medianSeconds($replyTimes[$id] ?? []),
                'approvalsGiven' => $approvals[$id] ?? 0,
            ];
        }

        $workloadRows = [];
        foreach (Database::all("SELECT id, name, role FROM users WHERE status = 'active' AND role IN ('lead', 'engineer') ORDER BY name") as $u) {
            $workloadRows[] = ['name' => $u['name'], 'role' => Presenter::roleLabel($u['role']), 'activeProjects' => $workload[(int) $u['id']] ?? 0];
        }
        usort($workloadRows, static fn ($a, $b) => $b['activeProjects'] <=> $a['activeProjects']);

        return ['caption' => self::CAPTION, 'kpis' => $kpis, 'people' => $people, 'workload' => $workloadRows];
    }

    private static function values(Period $p): array
    {
        $range = [$p->start(), $p->endExclusive()];
        $approval = array_map(static fn ($r) => max(0, strtotime((string) $r['published_at']) - strtotime((string) $r['created_at'])), Database::all(
            'SELECT created_at, published_at FROM updates WHERE approved_by IS NOT NULL AND published_at >= ? AND published_at < ?',
            $range,
        ));
        return [
            'updatesPosted' => (int) Database::value("SELECT COUNT(*) FROM updates WHERE kind = 'update' AND author_id IS NOT NULL AND created_at >= ? AND created_at < ?", $range),
            'approvalTime' => Metrics::medianSeconds($approval),
            'clientReplyTime' => Metrics::medianSeconds(Clients::replyTimes($p)['seconds']),
            'quotesSent' => (int) Database::value('SELECT COUNT(*) FROM quotes WHERE created_at >= ? AND created_at < ?', $range),
            'paymentsConfirmed' => (int) Database::value("SELECT COUNT(*) FROM idea_payments WHERE status = 'PAID' AND confirmed_by IS NOT NULL AND confirmed_at >= ? AND confirmed_at < ?", $range),
        ];
    }

    /** Active projects per person (lead or team member), one grouped query. @return array<int, int> */
    public static function workload(): array
    {
        return array_map('intval', array_column(Database::all(
            "SELECT user_id, COUNT(DISTINCT project_id) AS n FROM (
                 SELECT lead_id AS user_id, id AS project_id FROM projects WHERE stage <> 'DELIVERED' AND lead_id IS NOT NULL
                 UNION
                 SELECT pm.user_id, pm.project_id FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE p.stage <> 'DELIVERED'
             ) a GROUP BY user_id",
        ), 'n', 'user_id'));
    }
}

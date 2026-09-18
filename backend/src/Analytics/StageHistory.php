<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Core\Database;

/** project_stage_history: one row per stage change, for the "time in stage" metric. */
final class StageHistory
{
    /** Stage-update titles written before stage history existed, mapped to the stage they announced. */
    private const TITLES = [
        'Welcome! Your project is registered' => 'APPROVED',
        'Stage changed to Approved' => 'APPROVED',
        'Stage changed to Design' => 'DESIGN',
        'Stage changed to In development' => 'DEVELOPMENT',
        'Stage changed to Testing' => 'TESTING',
        'Stage changed to Deployment' => 'DEPLOYMENT',
        'Stage changed to Delivered' => 'DELIVERED',
    ];

    public static function record(int $projectId, ?string $from, string $to, ?int $userId, ?string $at = null): void
    {
        if ($from === $to) {
            return;
        }
        // Runs inside stage changes and project registration: analytics must never make those fail
        // (e.g. before database/migrations/2026_09_analytics.sql has been applied). MySQL rolls back only
        // the failed statement, so the surrounding transaction carries on.
        try {
            Database::insert('project_stage_history', [
                'project_id' => $projectId,
                'from_stage' => $from,
                'to_stage' => $to,
                'changed_at' => $at ?? date('Y-m-d H:i:s'),
                'changed_by' => $userId,
            ]);
        } catch (\Throwable $e) {
            error_log('[stage-history] ' . $e->getMessage());
        }
    }

    /**
     * Rebuilds history for projects that have none, from their stage updates (the same rules as
     * database/migrations/2026_09_analytics.sql), filling from_stage from the previous row.
     */
    public static function backfill(): int
    {
        $projects = Database::all('SELECT p.id, p.start_date, p.created_at FROM projects p WHERE NOT EXISTS (SELECT 1 FROM project_stage_history h WHERE h.project_id = p.id)');
        $written = 0;
        foreach ($projects as $p) {
            $rows = [];
            $updates = Database::all("SELECT title, author_id, COALESCE(published_at, created_at) AS at FROM updates WHERE project_id = ? AND kind = 'stage' ORDER BY COALESCE(published_at, created_at), id", [(int) $p['id']]);
            foreach ($updates as $u) {
                $stage = self::TITLES[$u['title']] ?? (str_starts_with((string) $u['title'], 'Your product is') ? 'DELIVERED' : (str_starts_with((string) $u['title'], 'Project paused') ? 'ON_HOLD' : null));
                if ($stage !== null) {
                    $rows[] = [$stage, (string) $u['at'], $u['author_id'] !== null ? (int) $u['author_id'] : null];
                }
            }
            // Registration (start date) is when a project enters Approved, if nothing earlier says otherwise.
            $start = ($p['start_date'] ?: substr((string) $p['created_at'], 0, 10)) . ' 09:00:00';
            if (!in_array('APPROVED', array_column($rows, 0), true) && ($rows === [] || $start <= $rows[0][1])) {
                array_unshift($rows, ['APPROVED', $start, null]);
            }
            $prev = null;
            foreach ($rows as [$stage, $at, $by]) {
                if ($stage === $prev) {
                    continue;
                }
                self::record((int) $p['id'], $prev, $stage, $by, $at);
                $prev = $stage;
                $written++;
            }
        }
        return $written;
    }
}

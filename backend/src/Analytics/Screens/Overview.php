<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;
use App\Support\Stages;

/**
 * Overview — how is the business doing this period? (spec 4.1)
 * Money tiles are admin-only (like the Revenue screen): other viewers get them with value null and restricted: true.
 */
final class Overview extends Screen
{
    /** No filters: the screen mixes traffic and business data, and a traffic filter can't apply to business numbers. */
    public const FILTERS = [];
    public const DEFINITIONS = ['visitors', 'ideasSubmitted', 'netFeeRevenue', 'contractValueWon', 'activeProjects', 'onTimeRate', 'ideaFormsOpened', 'source', 'conversion'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $admin = self::isAdmin($viewer);

        $visitors = Metrics::sessionTotals($p)['visitors'];
        $cash = Metrics::feeCash($p);
        $deliveries = Metrics::deliveries($p);
        $kpis = [
            Blocks::kpi('visitors', $visitors, $prev ? Metrics::sessionTotals($prev)['visitors'] : null),
            Blocks::kpi('ideasSubmitted', Metrics::ideasSubmitted($p), $prev ? Metrics::ideasSubmitted($prev) : null),
            Blocks::kpi('netFeeRevenue', $cash['net'], $prev ? Metrics::feeCash($prev)['net'] : null, 'currency', 'cash'),
            Blocks::kpi('contractValueWon', Metrics::contractValueWon($p), $prev ? Metrics::contractValueWon($prev) : null, 'currency', 'booked'),
            Blocks::kpi('activeProjects', Metrics::activeProjectsAsOf($p->endExclusive()), $prev ? Metrics::activeProjectsAsOf($prev->endExclusive()) : null),
            Blocks::kpi('onTimeRate', Blocks::ratio($deliveries['onTime'], $deliveries['delivered']), $prev ? (static function () use ($prev) {
                $d = Metrics::deliveries($prev);
                return Blocks::ratio($d['onTime'], $d['delivered']);
            })() : null, 'percent'),
        ];
        if (!$admin) {
            $kpis[2] = Blocks::restricted($kpis[2]);
            $kpis[3] = Blocks::restricted($kpis[3]);
        }

        $range = [$p->start(), $p->endExclusive()];
        $formOpened = Metrics::eventVisitors($p, 'idea_form', 'opened');
        $feePaid = (int) Database::value(
            "SELECT COUNT(DISTINCT idea_id) FROM idea_payments
             WHERE (status = 'PAID' AND paid_at >= ? AND paid_at < ?) OR (method = 'manual' AND status IN ('AWAITING_CONFIRMATION', 'PAID') AND created_at >= ? AND created_at < ?)",
            array_merge($range, $range),
        );
        $submitted = Metrics::ideasSubmitted($p);
        $quoted = (int) Database::value('SELECT COUNT(*) FROM (SELECT idea_id, MIN(created_at) AS first_quote FROM quotes GROUP BY idea_id) q WHERE q.first_quote >= ? AND q.first_quote < ?', $range);
        $accepted = (int) Database::value("SELECT COUNT(DISTINCT idea_id) FROM quotes WHERE status = 'accepted' AND responded_at >= ? AND responded_at < ?", $range);
        $counts = ['visitors' => $visitors, 'form_opened' => $formOpened, 'fee_paid' => $feePaid, 'submitted' => $submitted, 'quoted' => $quoted, 'accepted' => $accepted];
        $labels = ['visitors' => 'Visitors', 'form_opened' => 'Idea form opened', 'fee_paid' => 'Fee paid', 'submitted' => 'Submitted', 'quoted' => 'Quoted', 'accepted' => 'Accepted'];
        $funnel = [];
        $prevCount = null;
        foreach ($counts as $key => $n) {
            $funnel[] = Blocks::step($key, $labels[$key], $n, $prevCount, $visitors);
            $prevCount = $n;
        }

        $sources = Traffic::breakdown($p, 'source', 5);

        return [
            'kpis' => $kpis,
            'trend' => [
                'visitors' => Blocks::series('visitors', $p, Metrics::sessionSeries($p, 'visitors'), $prev ? Metrics::sessionSeries($prev, 'visitors') : null),
                'ideas' => Blocks::series('ideas', $p, Metrics::ideasSubmitted($p, true), $prev ? Metrics::ideasSubmitted($prev, true) : null),
            ],
            'funnel' => $funnel,
            'attention' => self::attention($admin),
            'topSources' => $sources['rows'],
        ];
    }

    /** Things that need someone now (not range-bound). Rows carry ids; the panel has no deep links yet, so link is /engineering. */
    private static function attention(bool $admin): array
    {
        $today = date('Y-m-d');
        $overdue = array_map(static fn ($r) => [
            'code' => $r['code'], 'title' => $r['title'], 'lead' => $r['lead_name'], 'targetDate' => $r['target_date'],
            'daysOverdue' => (int) ((strtotime($today) - strtotime($r['target_date'])) / 86400), 'link' => '/engineering',
        ], Database::all("SELECT p.code, p.title, p.target_date, u.name AS lead_name FROM projects p LEFT JOIN users u ON u.id = p.lead_id WHERE p.stage <> 'DELIVERED' AND p.target_date < ? ORDER BY p.target_date", [$today]));

        $money = static fn (int $kobo) => $admin ? $kobo / 100 : null;
        $transfers = array_map(static fn ($r) => [
            'reference' => $r['reference'], 'ideaRef' => $r['ref'], 'amount' => $money((int) $r['amount_kobo']),
            'since' => date('c', (int) strtotime((string) $r['created_at'])),
            'daysWaiting' => (int) floor((time() - strtotime((string) $r['created_at'])) / 86400), 'link' => '/engineering',
        ], Database::all("SELECT pay.reference, pay.amount_kobo, pay.created_at, i.ref FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.status = 'AWAITING_CONFIRMATION' ORDER BY pay.created_at"));

        $refunds = array_map(static fn ($r) => [
            'reference' => $r['reference'], 'ideaRef' => $r['ref'], 'amount' => $money((int) $r['amount_kobo']), 'refundStatus' => $r['refund_status'],
            'queuedAt' => $r['refund_queued_at'] ? date('c', (int) strtotime((string) $r['refund_queued_at'])) : null, 'link' => '/engineering',
        ], Database::all("SELECT pay.reference, pay.amount_kobo, pay.refund_status, pay.refund_queued_at, i.ref FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.status = 'PAID' AND pay.refund_status IN ('PENDING', 'PROCESSING') ORDER BY pay.refund_queued_at"));

        $stale = [];
        foreach (Database::all(
            "SELECT p.code, p.title, u.name AS lead_name,
                    (SELECT MAX(COALESCE(x.published_at, x.created_at)) FROM updates x WHERE x.project_id = p.id AND x.visibility = 'client' AND x.status = 'published') AS last_at
             FROM projects p LEFT JOIN users u ON u.id = p.lead_id WHERE p.stage <> 'DELIVERED'",
        ) as $r) {
            $days = $r['last_at'] ? (int) floor((time() - strtotime((string) $r['last_at'])) / 86400) : null;
            if ($days === null || $days >= Stages::STALE_DAYS) {
                $stale[] = ['code' => $r['code'], 'title' => $r['title'], 'lead' => $r['lead_name'], 'daysSinceClientUpdate' => $days, 'link' => '/engineering'];
            }
        }
        return ['overdue' => $overdue, 'transfers' => $transfers, 'refunds' => $refunds, 'stale' => $stale];
    }
}

<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Request;
use App\Support\SiteContent;

/**
 * Revenue (spec 4.5), admin only. Cash received through the platform (commitment fees) is never added to booked
 * value (accepted quotes, approved changes, support plans), which is paid outside the platform.
 */
final class Revenue extends Screen
{
    public const ADMIN_ONLY = true;
    public const FILTERS = ['method', 'category'];
    public const DEFINITIONS = ['feesCollected', 'refunded', 'netFeeRevenue', 'awaitingConfirmation', 'refundsDue', 'paymentSuccessRate', 'contractValueWon', 'quotedValue', 'approvedChangeRequests', 'supportPlanMrr', 'estimatedCourseRevenue', 'quoteAcceptanceRate', 'medianDaysToRefund'];
    private const PAGE_SIZE = 50;

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $cash = Metrics::feeCash($p);
        $cashPrev = $prev ? Metrics::feeCash($prev) : null;

        [$mSql, $mParams] = Metrics::methodFilter($p);
        $awaiting = Database::one("SELECT COUNT(*) AS n, COALESCE(SUM(pay.amount_kobo), 0) AS kobo FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.status = 'AWAITING_CONFIRMATION'{$mSql}", $mParams);
        $due = Database::one("SELECT COUNT(*) AS n, COALESCE(SUM(pay.amount_kobo), 0) AS kobo FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.status = 'PAID' AND pay.refund_status IN ('PENDING', 'PROCESSING'){$mSql}", $mParams);

        $booked = self::booked($p);
        $bookedPrev = $prev ? self::booked($prev) : null;

        $page = max(1, (int) ($r->query('page') ?: 1));
        [$ledger, $pages, $total] = self::ledger($p, $page);

        return [
            'cash' => ['kpis' => [
                Blocks::kpi('feesCollected', $cash['gross'], $cashPrev['gross'] ?? null, 'currency', 'cash'),
                Blocks::kpi('refunded', $cash['refunded'], $cashPrev['refunded'] ?? null, 'currency', 'cash'),
                Blocks::kpi('netFeeRevenue', $cash['net'], $cashPrev['net'] ?? null, 'currency', 'cash'),
                Blocks::kpi('awaitingConfirmation', (int) $awaiting['kobo'] / 100, null, 'currency', 'pending', ['count' => (int) $awaiting['n']]),
                Blocks::kpi('refundsDue', (int) $due['kobo'] / 100, null, 'currency', 'liability', ['count' => (int) $due['n']]),
            ]],
            'booked' => ['kpis' => [
                Blocks::kpi('contractValueWon', $booked['won'], $bookedPrev['won'] ?? null, 'currency', 'booked'),
                Blocks::kpi('approvedChangeRequests', $booked['changes'], $bookedPrev['changes'] ?? null, 'currency', 'booked'),
                Blocks::kpi('supportPlanMrr', self::supportPlanMrr(), null, 'currency', 'booked', ['recurring' => true, 'asOf' => date('Y-m-d')]),
                Blocks::kpi('estimatedCourseRevenue', $booked['courses'], $bookedPrev['courses'] ?? null, 'currency', 'estimate'),
            ]],
            'series' => ['netFees' => Blocks::series('netFees', $p, self::netFeeSeries($p), $prev ? self::netFeeSeries($prev) : null)],
            'byMethod' => self::byMethod($p),
            'refunds' => self::refunds($p),
            'quotes' => self::quotes($p),
            'ledger' => $ledger,
            'page' => $page,
            'pages' => $pages,
            'ledgerTotal' => $total,
        ];
    }

    /** Exports carry the whole ledger, not one page. */
    public static function tables(array $data): array
    {
        $tables = parent::tables($data);
        $tables['ledger'] = $data['ledgerAll'] ?? $data['ledger'];
        unset($tables['ledgerAll']);
        return $tables;
    }

    /** @return array{won:float, changes:float, courses:float} */
    private static function booked(Period $p): array
    {
        return [
            'won' => Metrics::contractValueWon($p),
            'changes' => (float) Database::value("SELECT COALESCE(SUM(impact_cost), 0) FROM change_requests WHERE status IN ('APPROVED', 'COMPLETED') AND decided_at >= ? AND decided_at < ?", [$p->start(), $p->endExclusive()]),
            'courses' => Courses::estimatedRevenue($p),
        ];
    }

    /** Monthly price of each delivered project's current plan, priced from site content (a snapshot). */
    public static function supportPlanMrr(): float
    {
        $prices = [];
        foreach ((array) (SiteContent::get()['supportPlans']['plans'] ?? []) as $plan) {
            if (is_array($plan) && isset($plan['id'])) {
                $monthly = (float) ($plan['price'] ?? 0);
                $prices[(string) $plan['id']] = match ($plan['period'] ?? 'month') {
                    'year' => $monthly / 12,
                    'month' => $monthly,
                    default => 0.0,
                };
            }
        }
        $total = 0.0;
        foreach (Database::all("SELECT support_plan, COUNT(*) AS n FROM projects WHERE stage = 'DELIVERED' AND support_plan IS NOT NULL GROUP BY support_plan") as $row) {
            $total += ($prices[(string) $row['support_plan']] ?? 0) * (int) $row['n'];
        }
        return round($total, 2);
    }

    /** @return array<string, float> bucket => net naira (fees by paid_at − refunds by refunded_at) */
    private static function netFeeSeries(Period $p): array
    {
        [$mSql, $mParams] = Metrics::methodFilter($p);
        $paid = Period::bucketSql('pay.paid_at', $p->interval);
        $refunded = Period::bucketSql('pay.refunded_at', $p->interval);
        $out = [];
        foreach (Database::all("SELECT {$paid} AS t, SUM(pay.amount_kobo) AS kobo FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.status = 'PAID' AND pay.paid_at >= ? AND pay.paid_at < ?{$mSql} GROUP BY t", array_merge([$p->start(), $p->endExclusive()], $mParams)) as $row) {
            $out[$row['t']] = ($out[$row['t']] ?? 0) + (int) $row['kobo'] / 100;
        }
        foreach (Database::all("SELECT {$refunded} AS t, SUM(pay.amount_kobo) AS kobo FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.refund_status = 'REFUNDED' AND pay.refunded_at >= ? AND pay.refunded_at < ?{$mSql} GROUP BY t", array_merge([$p->start(), $p->endExclusive()], $mParams)) as $row) {
            $out[$row['t']] = ($out[$row['t']] ?? 0) - (int) $row['kobo'] / 100;
        }
        return $out;
    }

    private static function byMethod(Period $p): array
    {
        [$mSql, $mParams] = Metrics::methodFilter($p);
        $rows = Database::all(
            "SELECT CASE WHEN pay.method = 'paystack' THEN 'paystack' WHEN pay.note = 'Paid at centre' THEN 'centre' ELSE 'manual' END AS k,
                    COUNT(*) AS n, SUM(pay.amount_kobo) AS kobo
             FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.status = 'PAID' AND pay.paid_at >= ? AND pay.paid_at < ?{$mSql} GROUP BY k",
            array_merge([$p->start(), $p->endExclusive()], $mParams),
        );
        $values = ['paystack' => 0.0, 'manual' => 0.0, 'centre' => 0.0];
        $extra = ['paystack' => ['count' => 0], 'manual' => ['count' => 0], 'centre' => ['count' => 0]];
        foreach ($rows as $row) {
            $values[$row['k']] = (int) $row['kobo'] / 100;
            $extra[$row['k']] = ['count' => (int) $row['n']];
        }
        $out = Blocks::rows($values, null, $extra, ['paystack' => 'Paystack', 'manual' => 'Bank transfer', 'centre' => 'Paid at centre']);
        // Colour follows the method (spec 11.2), so keep a fixed order rather than sorting by amount.
        usort($out, static fn ($a, $b) => array_search($a['key'], ['paystack', 'manual', 'centre'], true) <=> array_search($b['key'], ['paystack', 'manual', 'centre'], true));
        return $out;
    }

    private static function refunds(Period $p): array
    {
        [$mSql, $mParams] = Metrics::methodFilter($p);
        $rows = Database::all(
            "SELECT pay.amount_kobo, pay.refund_queued_at, pay.refunded_at FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id
             WHERE pay.refund_status = 'REFUNDED' AND pay.refunded_at >= ? AND pay.refunded_at < ?{$mSql}",
            array_merge([$p->start(), $p->endExclusive()], $mParams),
        );
        $days = [];
        $amount = 0;
        foreach ($rows as $row) {
            $amount += (int) $row['amount_kobo'];
            if ($row['refund_queued_at'] !== null) {
                $days[] = max(0, (strtotime((string) $row['refunded_at']) - strtotime((string) $row['refund_queued_at'])) / 86400);
            }
        }
        $median = Blocks::median($days);
        return ['count' => count($rows), 'amount' => $amount / 100, 'medianDaysToRefund' => $median !== null ? round($median, 1) : null];
    }

    private static function quotes(Period $p): array
    {
        $created = Period::bucketSql('q.created_at', $p->interval);
        $responded = Period::bucketSql('q.responded_at', $p->interval);
        [$cat, $catParams] = Metrics::ideaFilters($p, '', []);
        $quoted = array_map('floatval', array_column(Database::all("SELECT {$created} AS t, SUM(q.amount) AS v FROM quotes q JOIN ideas i ON i.id = q.idea_id WHERE q.created_at >= ? AND q.created_at < ?{$cat} GROUP BY t", array_merge([$p->start(), $p->endExclusive()], $catParams)), 'v', 't'));
        $accepted = array_map('floatval', array_column(Database::all("SELECT {$responded} AS t, SUM(q.amount) AS v FROM quotes q JOIN ideas i ON i.id = q.idea_id WHERE q.status = 'accepted' AND q.responded_at >= ? AND q.responded_at < ?{$cat} GROUP BY t", array_merge([$p->start(), $p->endExclusive()], $catParams)), 'v', 't'));
        return [
            'series' => [Blocks::series('quoted', $p, $quoted), Blocks::series('accepted', $p, $accepted)],
            'acceptanceRate' => Pipeline::acceptanceRate($p),
        ];
    }

    /** @return array{0:list<array>, 1:int, 2:int} rows, pages, total */
    public static function ledger(Period $p, int $page, bool $all = false): array
    {
        [$mSql, $mParams] = Metrics::methodFilter($p);
        $where = "FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.created_at >= ? AND pay.created_at < ?{$mSql}";
        $params = array_merge([$p->start(), $p->endExclusive()], $mParams);
        $total = (int) Database::value('SELECT COUNT(*) ' . $where, $params);
        $pages = max(1, (int) ceil($total / self::PAGE_SIZE));
        if ($page > $pages) {
            throw HttpError::validation(['page' => "There are only {$pages} page(s)."]);
        }
        $limit = $all ? '' : ' LIMIT ' . self::PAGE_SIZE . ' OFFSET ' . (($page - 1) * self::PAGE_SIZE);
        $rows = Database::all(
            "SELECT pay.created_at, pay.paid_at, pay.reference, pay.receipt_no, i.ref AS idea_ref, pay.method, pay.note, pay.amount_kobo, pay.status, pay.refund_status {$where} ORDER BY pay.created_at DESC, pay.id DESC{$limit}",
            $params,
        );
        $ledger = array_map(static fn (array $row) => [
            'date' => substr((string) $row['created_at'], 0, 10),
            'paidAt' => $row['paid_at'] ? date('c', (int) strtotime((string) $row['paid_at'])) : null,
            'reference' => $row['reference'],
            'receiptNo' => $row['receipt_no'],
            'ideaRef' => $row['idea_ref'],
            'method' => $row['method'] === 'paystack' ? 'paystack' : ($row['note'] === 'Paid at centre' ? 'centre' : 'manual'),
            'amount' => (int) $row['amount_kobo'] / 100,
            'status' => $row['status'],
            'refundStatus' => $row['refund_status'],
        ], $rows);
        return [$ledger, $pages, $total];
    }
}

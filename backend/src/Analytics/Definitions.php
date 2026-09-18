<?php

declare(strict_types=1);

namespace App\Analytics;

/**
 * The metric dictionary (spec section 6): label, good direction and plain-language definition.
 * Each screen returns the entries it uses in meta.definitions, and exports carry them in "Read me".
 */
final class Definitions
{
    /** key => [label, goodDirection, definition] */
    private const ALL = [
        // Traffic (6.1)
        'visitors' => ['Visitors', 'up', 'Distinct visitor ids with at least one event in the range. Staff traffic is excluded unless "Include staff traffic" is on.'],
        'newVisitors' => ['New visitors', 'up', 'Visitors whose first-ever event falls in the range.'],
        'returningVisitors' => ['Returning visitors', 'up', 'Visitors in the range whose first event is before the range.'],
        'sessions' => ['Sessions', 'up', 'Distinct sessions. A session ends after 30 minutes without activity, or at midnight Lagos time.'],
        'pageviews' => ['Page views', 'up', 'Count of page_view events.'],
        'pagesPerSession' => ['Pages per session', 'up', 'Page views ÷ sessions.'],
        'avgSessionDuration' => ['Avg. session duration', 'up', 'Mean of (last event − first event) per session, in seconds. Single-event sessions count as 0.'],
        'bounceRate' => ['Bounce rate', 'down', 'Sessions with exactly one page view and no interaction event (anything except page_view, scroll_depth and client_error) ÷ sessions.'],
        'source' => ['Source', 'none', 'The UTM source if present, otherwise the referrer domain grouped by the source rules (search, social, email, referral), otherwise "direct".'],
        'heatmap' => ['When people visit', 'none', 'Sessions started, by day of week (Monday first) and hour, Africa/Lagos time.'],
        'conversion' => ['Application conversion', 'up', 'Visitors who reached idea_form step "submitted" ÷ visitors, from browser tracking.'],
        // Engagement (6.2)
        'ctaClicks' => ['CTA clicks', 'up', 'cta_click events.'],
        'ctaClickThroughRate' => ['CTA click-through rate', 'up', 'Unique visitors who clicked a CTA ÷ unique visitors who viewed the page it sits on.'],
        'trackerSearches' => ['Tracker searches', 'none', 'tracker_search events, split by kind (project/idea) and result.'],
        'notFoundRate' => ['Not-found rate', 'down', 'Tracker searches with result not_found ÷ all tracker searches.'],
        'ideaFormsOpened' => ['Idea forms opened', 'up', 'Unique visitors with an idea_form event at step "opened".'],
        'courseClicks' => ['Course clicks', 'up', 'course_click events from the website tracker.'],
        'outboundClicks' => ['Outbound clicks', 'none', 'outbound_click events (links to other sites; only the host is recorded).'],
        'scrollDepth' => ['Scroll depth', 'up', 'Share of home-page views (path "/") that reached each threshold.'],
        'downloads' => ['Downloads', 'none', 'download events by kind (report, proposal, file). Counts only.'],
        // Application funnel and pipeline (6.3)
        'draftsStarted' => ['Drafts started', 'up', 'Ideas created in the range (every application starts as a draft).'],
        'draftCompletionRate' => ['Draft completion rate', 'up', 'Ideas created in the range that were later submitted ÷ ideas created in the range.'],
        'ideasSubmitted' => ['Ideas submitted', 'up', 'Ideas whose submitted_at falls in the range (drafts never count).'],
        'walkInShare' => ['Walk-in share', 'none', 'Submitted ideas started by staff at a centre (source walk_in) ÷ submitted ideas.'],
        'timeToFirstQuote' => ['Median time to first quote', 'down', 'Median of (first quote sent − idea submitted), for ideas whose first quote was sent in the range.'],
        'quoteAcceptanceRate' => ['Quote acceptance rate', 'up', 'Quotes accepted ÷ quotes no longer open (accepted, declined, withdrawn or expired), for quotes sent in the range.'],
        'ideaToProjectConversion' => ['Idea → project conversion', 'up', 'Ideas submitted in the range that now have a project ÷ ideas submitted in the range.'],
        // Revenue (6.4)
        'feesCollected' => ['Fees collected (gross)', 'up', 'Sum of commitment fees with status PAID and paid_at in the range.'],
        'refunded' => ['Refunded', 'down', 'Sum of fees with refund_status REFUNDED and refunded_at in the range.'],
        'netFeeRevenue' => ['Net fee revenue', 'up', 'Fees collected − refunded, each counted on its own date. Cash received through the platform only.'],
        'refundsDue' => ['Refunds due', 'down', 'Fees with a refund PENDING or PROCESSING right now (not range-bound).'],
        'awaitingConfirmation' => ['Transfers awaiting confirmation', 'down', 'Bank transfers reported by clients and not yet confirmed, right now (not range-bound).'],
        'paymentSuccessRate' => ['Payment success rate', 'up', 'Paystack payments PAID ÷ (PAID + FAILED + checkouts still pending after 1 hour), created in the range.'],
        'contractValueWon' => ['Contract value won', 'up', 'Sum of quote amounts accepted (responded_at) in the range. Booked value: paid outside the platform.'],
        'quotedValue' => ['Quoted value', 'up', 'Sum of quote amounts sent (created_at) in the range.'],
        'approvedChangeRequests' => ['Approved change requests', 'up', 'Sum of impact_cost of change requests APPROVED or COMPLETED with decided_at in the range.'],
        'supportPlanMrr' => ['Support plan MRR', 'up', 'Monthly price (from site content supportPlans) of the current support plan of every delivered project. A snapshot as of today.'],
        'estimatedCourseRevenue' => ['Estimated course revenue', 'up', 'Sum of the discounted course price for leads that became ENROLLED in the range. An estimate: course fees are paid outside the platform.'],
        'medianDaysToRefund' => ['Median days to refund', 'down', 'Median days from the refund being queued (idea declined) to refunded_at.'],
        // Projects (6.5)
        'activeProjects' => ['Active projects', 'none', 'Projects registered by the end of the range and not delivered by then.'],
        'delivered' => ['Delivered', 'up', 'Projects with delivered_at in the range.'],
        'onTimeRate' => ['On-time delivery rate', 'up', 'Projects delivered in the range on or before their target date ÷ projects delivered in the range.'],
        'cycleTime' => ['Median cycle time', 'down', 'Median of (delivered_at − start_date), in seconds, for projects delivered in the range.'],
        'timeInStage' => ['Time in stage', 'down', 'Median days between entering and leaving each stage, for stays that ended in the range (from project stage history).'],
        'overdueNow' => ['Overdue now', 'down', 'Active projects whose target date is before today (not range-bound).'],
        'staleProjects' => ['Stale projects', 'down', 'Active projects with no client-visible published update for 5 or more days (not range-bound).'],
        'updatesPerProject' => ['Updates per project', 'up', 'Client-visible published updates per active project over the last 30 days.'],
        'avgClientRating' => ['Avg. client rating', 'up', 'Mean rating_stars of projects rated in the range.'],
        // Clients (6.6)
        'newClients' => ['New clients', 'up', 'Clients created in the range.'],
        'activeClients' => ['Active clients', 'up', 'Distinct clients with at least one portal sign-in (verified one-time code) in the range.'],
        'portalSignIns' => ['Portal sign-ins', 'up', 'One-time codes verified (otp_codes.consumed_at) in the range.'],
        'returningClientRate' => ['Returning-client rate', 'up', 'Active clients who also signed in during the 30 days before the range ÷ active clients.'],
        'messagesFromClients' => ['Messages from clients', 'none', 'Client messages sent in the range.'],
        'medianTeamReplyTime' => ['Median team reply time', 'down', 'For each client message in the range, the time until the next team message on the same project; the median. Unanswered messages are excluded and counted separately.'],
        // Courses (6.7)
        'courseViews' => ['Course views', 'up', 'course_events with event "view" in the range.'],
        'courseClicksDb' => ['Clicks', 'up', 'course_events with event "click" in the range.'],
        'enquiries' => ['Enquiries', 'up', 'Course leads created in the range, from any source.'],
        'enrolled' => ['Enrolled', 'up', 'Leads whose status became ENROLLED in the range.'],
        'viewToEnrolRate' => ['View-to-enrol rate', 'up', 'Enrolled ÷ course views, same range.'],
        'timeToFirstContact' => ['Median time to first contact', 'down', 'Median of (first status change away from NEW − lead created), in seconds.'],
        // Team (6.8)
        'updatesPosted' => ['Updates posted', 'none', 'Project updates written by staff in the range (client-visible and internal counted separately per person).'],
        'approvalTime' => ['Median approval time', 'down', 'Median of (published_at − created_at) for engineer updates that waited for approval, published in the range.'],
        'clientReplyTime' => ['Median client-reply time', 'down', 'Median time from a client message to the next team message on the same project, for client messages in the range.'],
        'quotesSent' => ['Quotes sent', 'none', 'Quotes created in the range.'],
        'paymentsConfirmed' => ['Payments confirmed', 'none', 'Bank transfers and centre payments confirmed by staff in the range.'],
        'workload' => ['Workload', 'none', 'Active projects where the person is the lead or a team member, as of today.'],
        // Operations (6.9)
        'messagesSent' => ['Messages sent', 'none', 'Notifications by channel and status, created in the range. "logged" means stored only (log driver).'],
        'deliveryFailureRate' => ['Delivery failure rate', 'down', 'failed ÷ (sent + failed) notifications created in the range.'],
        'codesRequested' => ['Codes requested', 'none', 'Client one-time codes created in the range.'],
        'codesVerified' => ['Codes verified', 'none', 'Client one-time codes consumed in the range.'],
        'rateLimitHits' => ['Rate-limit hits', 'none', 'API requests refused with status 429 (from the request log, kept 30 days).'],
        'apiErrors' => ['API errors', 'down', 'Responses with status ≥ 500, and 4xx excluding 401, 404 and 429, from the request log.'],
        'p95Latency' => ['p95 latency', 'down', '95th percentile response time per endpoint (route pattern), in milliseconds.'],
        'paymentAttempts' => ['Paystack attempts', 'none', 'Paystack checkouts started in the range.'],
        'abandonedCheckouts' => ['Abandoned checkouts', 'down', 'Paystack checkouts started in the range still PENDING after 1 hour.'],
        'medianConfirmHours' => ['Median time to confirm a transfer', 'down', 'Median hours from a bank transfer being reported to an admin confirming it, confirmed in the range.'],
        'staffSignIns' => ['Staff sign-ins', 'none', 'Successful staff sign-ins (request log, 30 days).'],
        'failedSignIns' => ['Failed sign-ins', 'down', 'Staff sign-ins refused with 401 or 429 (request log, 30 days).'],
        'passwordResets' => ['Password resets', 'none', 'Staff password-reset links requested in the range.'],
        // Realtime and funnels
        'activeVisitors' => ['Active visitors', 'none', 'Distinct visitors with an event in the last 5 minutes.'],
        'funnel.application' => ['Application funnel', 'up', 'Unique visitors (browser tracking) reaching each step in the range: any event → idea_form opened → draft_saved → payment step → payment returned_success or transfer_reported → idea_form submitted. A visitor counts at a step only if they also reached every earlier step.'],
        'funnel.sales' => ['Sales funnel', 'up', 'Ideas submitted in the range (a cohort) and how far each got: reviewed (moved past NEW or quoted) → quote sent → quote accepted or converted → project started → delivered.'],
        'funnel.portal' => ['Portal funnel', 'up', 'Unique visitors in the range: tracker search → sign-in code requested → code verified → came back within 30 days of first signing in.'],
        'funnel.courses' => ['Courses funnel', 'up', 'Course viewed and clicked are unique visitors (browser tracking); enquiry, contacted and enrolled are course leads created in the range (database).'],
    ];

    /** @return array{label:string, good:string, text:string} */
    public static function get(string $key): array
    {
        [$label, $good, $text] = self::ALL[$key] ?? [ucfirst($key), 'none', ''];
        return ['label' => $label, 'good' => $good, 'text' => $text];
    }

    /** @param list<string> $keys @return array<string, string> */
    public static function only(array $keys): array
    {
        $out = [];
        foreach ($keys as $key) {
            if (isset(self::ALL[$key])) {
                $out[$key] = self::ALL[$key][2];
            }
        }
        return $out;
    }
}

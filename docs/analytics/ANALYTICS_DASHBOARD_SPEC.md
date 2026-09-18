# AI Project Connect — Analytics Dashboard

**Product & technical specification · v1.1 · 18 September 2026**

| Item | Detail |
|---|---|
| **Product** | AI Project Connect (Aptech) |
| **Deliverable** | A separate analytics dashboard at `/analytics` |
| **For** | The frontend developer building the dashboard |
| **Back end** | Built by the core team against the API contract in [section 9](#9-api-contract). Build the screens against it. |
| **Status** | Ready for build. The back end is live on the demo database (see [section 18](#18-build-notes-v11)). |

---

## Contents

1. [Summary](#1-summary)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [Access and sign-in](#3-access-and-sign-in)
4. [Screens](#4-screens)
5. [Global controls](#5-global-controls)
6. [Metric dictionary](#6-metric-dictionary)
7. [Tracking: what the website records](#7-tracking-what-the-website-records)
8. [Data model](#8-data-model)
9. [API contract](#9-api-contract)
10. [Exports, saved views and scheduled reports](#10-exports-saved-views-and-scheduled-reports)
11. [Design system and colour guide](#11-design-system-and-colour-guide)
12. [Chart catalogue](#12-chart-catalogue)
13. [States, performance and accessibility](#13-states-performance-and-accessibility)
14. [Privacy and security](#14-privacy-and-security)
15. [Acceptance criteria](#15-acceptance-criteria)
16. [Delivery plan](#16-delivery-plan)
17. [Appendix](#17-appendix)
18. [Build notes (v1.1)](#18-build-notes-v11)

---

## 1. Summary

AI Project Connect has three faces today:

- **Public website:** marketing pages, the courses catalogue and the idea application with its ₦2,000 commitment fee.
- **Client Portal:** clients sign in with a Project ID and a one-time code, then follow their build.
- **Engineering Panel** (`/engineering`): staff run projects, ideas, quotes, payments and the website content.

The panel already has a small **Reports** page, but it answers operational questions only. Nothing measures the website itself (visits, where people come from, what they click), and no screen shows the business end to end.

The **Analytics dashboard** is a separate, read-only product at `/analytics`. It answers one question per screen:

| Screen | The question it answers |
|---|---|
| Overview | How is the business doing this period? |
| Traffic | How many people visit, from where, on what device? |
| Engagement | What do they click and use? |
| Funnels | Where do people drop out between visiting and paying? |
| Revenue | How much money came in, how much was refunded, and what is booked? |
| Projects | Are we delivering on time? |
| Sales pipeline | How do ideas turn into quotes and projects? |
| Clients | Who uses the portal, and how often? |
| Courses | Does "Learn the stack" turn into enrolments? |
| Team | How quickly does the team update clients and reply? |
| Operations | Are emails, SMS and payments working? |
| Realtime | What is happening right now? |

Staff sign in with **the same email and password they use for the Engineering Panel**. The sign-in page is branded as Analytics.

---

## 2. Goals and non-goals

### Goals
- **One trustworthy number per metric.** Every figure has a written definition ([section 6](#6-metric-dictionary)), and the API computes it on the server. The browser never recomputes business numbers.
- **The whole funnel in one place**, from first visit to delivered project and course enrolment.
- **Money is labelled honestly.** Cash collected through the platform (commitment fees) is kept apart from booked value (accepted quotes, approved changes, support plans), because project invoices are paid outside the platform.
- **Everything can leave the dashboard:** CSV and Excel for every table, PDF for every screen, saved views, and a weekly emailed summary.
- **First-party and privacy-respecting tracking.** No Google Analytics and no third-party scripts, compliant with the Nigeria Data Protection Act 2023.

### Non-goals (v1)
- **No editing of business data.** The dashboard is read-only; changes happen in the Engineering Panel.
- **No per-person browsing history.** Analytics is aggregate: we never show "what did this visitor look at".
- **No A/B testing, heatmaps or session replay.**
- **No custom report builder.** Saved views cover the need for v1.

---

## 3. Access and sign-in

### 3.1 Route
| URL | Shows |
|---|---|
| `/analytics` | The sign-in page, or the Overview when already signed in |
| `/analytics?view=<screen>` | A screen, e.g. `?view=revenue`. Keep the view in the query string — the site is a static export, so there are no dynamic routes. |
| `/analytics?view=revenue&from=2026-08-01&to=2026-08-31&compare=previous` | A shareable state. Every filter lives in the URL. |

### 3.2 Who can see it
- **Admins** always have access.
- Any other active staff member has access when an admin ticks **"Can view analytics"** on their account (Engineering Panel → Users & roles). New API field: `canViewAnalytics`.
- **Revenue and Team** screens are admin-only, even for staff with analytics access. For everyone else the API returns `403` for those sections. Hide them from the navigation rather than showing an error.

### 3.3 The sign-in page
- **Same credentials and API** as the Engineering Panel: `POST /api/staff/auth/login` with `{email, password}`. It is the same session cookie, so signing in to one signs you in to both.
- **Branding:** the product mark plus an **"Analytics"** badge. Title "Sign in to Analytics", subtitle "Use your AI Project Connect staff account."
- **"Forgot password?"** uses the existing flow (`/api/staff/auth/forgot-password`).
- **After sign-in,** call `GET /api/analytics/me` ([9.2](#92-session)). If `canViewAnalytics` is `false`, show "Your account doesn't have access to Analytics. Ask an admin to turn it on." and a **Sign out** button. Never show a half-loaded dashboard.
- **Session expiry:** any `401` from an analytics endpoint returns to the sign-in page and keeps the URL, so the user lands back on the same view after signing in.
- **No self-sign-up.** Accounts are created by admins in the Engineering Panel.

---

## 4. Screens

Every screen follows the same frame:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▣ AI Project Connect  ANALYTICS          [Date range ▾] [Compare ▾] [⤓]  │  ← top bar
├──────────────┬───────────────────────────────────────────────────────────┤
│ Overview     │  Screen title                          [Filters ▾] [Save] │
│ Traffic      │  One-line explanation of what this screen answers         │
│ Engagement   │                                                           │
│ Funnels      │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   ← KPI tiles (4–6)  │
│ Revenue  🔒  │  │ 1,284│ │  312 │ │ 24.3%│ │₦186k │                      │
│ Projects     │  │ ▲12% │ │ ▼3%  │ │ ▲1.1 │ │ ▲8%  │                      │
│ Pipeline     │  └──────┘ └──────┘ └──────┘ └──────┘                      │
│ Clients      │                                                           │
│ Courses      │  ┌───────────────────────────────┐ ┌───────────────────┐  │
│ Team     🔒  │  │ Main chart                    │ │ Breakdown         │  │
│ Operations   │  │                               │ │                   │  │
│ Realtime ●   │  └───────────────────────────────┘ └───────────────────┘  │
│              │  ┌───────────────────────────────────────────────────┐   │
│ ─────────    │  │ Table (sortable · CSV · Excel)                    │   │
│ Saved views  │  └───────────────────────────────────────────────────┘   │
│ Reports      │                                                           │
│ [User ▾]     │  Data as of 10:42 · Africa/Lagos · Definitions ⓘ          │
└──────────────┴───────────────────────────────────────────────────────────┘
```

- **Layout:** the sidebar collapses to a top menu below 1024px. Tiles wrap 4 → 2 → 1 column; charts go full width on mobile. No horizontal page scroll at any width; wide tables scroll inside their card.
- 🔒 marks **admin-only** screens (see 3.2).
- **Footer on every screen:** "Data as of HH:mm", the timezone, and a **Definitions** link that opens the metric dictionary entries for that screen in a side drawer.

The sections below list the exact content of each screen. Metric names match [section 6](#6-metric-dictionary); endpoints match [section 9](#9-api-contract).

### 4.1 Overview — `?view=overview`
The one-page business summary. Load it first; it has to feel instant.

| Block | Content |
|---|---|
| KPI tiles | Visitors · Ideas submitted · Fee revenue (net) · Booked contract value · Active projects · On-time delivery rate |
| Trend | Visitors and ideas submitted per day. Show them as two small charts stacked, **never on one dual-axis chart**. |
| Funnel strip | Visitors → Idea form opened → Fee paid → Submitted → Quoted → Accepted, with the conversion % between steps |
| Attention list | Overdue projects, transfers waiting for confirmation, refunds due, stale projects (no client update in 5+ days). Each row links to the Engineering Panel. |
| Top sources | The top 5 traffic sources, with visitors and the application conversion rate |

Endpoint: `GET /api/analytics/overview`.

### 4.2 Traffic — `?view=traffic`
| Block | Content |
|---|---|
| KPI tiles | Visitors · Sessions · Page views · Pages per session · Avg. session duration · Bounce rate |
| Main chart | A time series of the selected metric (a toggle picks the metric), with the comparison period as a thin dashed line |
| Breakdowns (tabs) | Source · Medium · Campaign (UTM) · Referrer · Landing page · Page · Device · Browser · OS · Country · State (Nigeria) |
| When people visit | A 7 × 24 heatmap: day of week × hour, Africa/Lagos time |
| New vs returning | Share of visitors seen before |

Endpoints: `GET /api/analytics/traffic`, `/traffic/timeseries`, `/traffic/breakdown`.

### 4.3 Engagement — `?view=engagement`
| Block | Content |
|---|---|
| KPI tiles | CTA clicks · Tracker searches · Idea forms opened · Course clicks · Outbound clicks |
| Top interactions | Table of event name × target (e.g. `cta_click · hero_submit_idea`) with clicks, unique visitors, and click-through rate relative to that page's views |
| Tracker searches | Searches by kind (Project ID or idea ref) and result (found / not found / rate-limited) |
| Scroll depth | The share of page views reaching 25 / 50 / 75 / 100% on the home page |
| Downloads | Report PDFs, proposals and shared files downloaded (counts only) |

Endpoint: `GET /api/analytics/engagement`.

### 4.4 Funnels — `?view=funnels&funnel=<id>`
Four funnels, chosen with a segmented control. Each shows the steps with counts, step-to-step conversion, overall conversion, and the median time between steps. Every step count is **unique people** (visitors or applications), not events.

| Funnel id | Steps |
|---|---|
| `application` | Visited → Opened idea form → Draft saved → Reached payment → Fee paid (or transfer reported) → Submitted |
| `sales` | Submitted → Reviewed → Quote sent → Quote accepted → Project started → Delivered |
| `portal` | Tracker search → Code requested → Code verified (signed in) → Returned within 30 days |
| `courses` | Course viewed → Course clicked → Enquiry / request → Contacted → Enrolled |

Below the chart, a table breaks the same funnel down by **source**, **device** or **category** (a toggle). Endpoint: `GET /api/analytics/funnels/{id}`.

### 4.5 Revenue — `?view=revenue` 🔒 admin only
> **Important wording.** The platform collects only the commitment fee. Project invoices, course fees and support plans are paid outside it, so this screen splits **cash received** from **booked value**. Never add the two together into one "revenue" total.

| Block | Content |
|---|---|
| Cash tiles | Fees collected (gross) · Refunded · **Net fee revenue** · Transfers awaiting confirmation (count and ₦) |
| Booked tiles | Contract value won · Approved change requests · Support plan MRR · Estimated course revenue |
| Cash over time | Net fee revenue per day, week or month, as columns |
| By payment method | Paystack · Bank transfer · Paid at centre — amount and share |
| Refunds | Count, amount, median days from decline to refund |
| Quote value | Quoted vs accepted value over time, plus the quote acceptance rate |
| Ledger table | Every payment in range: date, reference, receipt, idea, method, amount, status, refund status. Exportable. |

Endpoint: `GET /api/analytics/revenue`.

### 4.6 Projects — `?view=projects`
| Block | Content |
|---|---|
| KPI tiles | Active projects · Delivered (in range) · On-time delivery rate · Median cycle time · Overdue now · Avg. client rating |
| Projects by stage | Horizontal bars: Approved, Design, Development, Testing, Deployment, On hold |
| Time in stage | The median days spent in each stage, from stage history |
| Delivery vs target | Per delivered project: days early or late (a diverging bar) |
| Update frequency | Client-visible updates per project in the last 30 days; stale projects highlighted |
| Table | Project, lead, stage, progress, target date, days overdue, last client update, rating |

Endpoint: `GET /api/analytics/projects`.

### 4.7 Sales pipeline — `?view=pipeline`
| Block | Content |
|---|---|
| KPI tiles | Ideas submitted · Drafts started · Draft completion rate · Median time to first quote · Quote acceptance rate · Walk-in share |
| Ideas over time | Submitted per week, split online vs walk-in |
| By category / platform / budget / state | Bars, with a toggle for the dimension |
| Ageing | Submitted ideas not yet quoted, bucketed 0–2, 3–7, 8–14 and 15+ days |
| Table | Ref, title, category, source, submitted, fee status, stage in the pipeline, days waiting |

Endpoint: `GET /api/analytics/pipeline`.

### 4.8 Clients — `?view=clients`
| Block | Content |
|---|---|
| KPI tiles | New clients · Active clients (signed in during the range) · Portal sign-ins · Returning-client rate · Messages from clients · Median team reply time |
| Sign-ins over time | Per day |
| Engagement | Milestone approvals, change requests raised, files uploaded, course requests, ratings given |
| Opt-outs | Share opted out of weekly emails and of course suggestions |
| By location | Clients by state and country |

Endpoint: `GET /api/analytics/clients`.

### 4.9 Courses — `?view=courses`
| Block | Content |
|---|---|
| KPI tiles | Course views · Clicks · Enquiries · Enrolled · View-to-enrol rate · Estimated course revenue |
| Funnel by course | Table: course, views, clicks, enquiries, contacted, enrolled, conversion |
| Lead sources | Portal · Website · Invite |
| Counsellor performance | Leads handled, median time to first contact, enrolment rate |

Endpoint: `GET /api/analytics/courses`.

### 4.10 Team — `?view=team` 🔒 admin only
| Block | Content |
|---|---|
| KPI tiles | Updates posted · Median approval time (engineer update → published) · Median client-reply time · Quotes sent · Payments confirmed |
| Per person | Table: name, role, projects, updates, internal notes, replies, median reply time, approvals given |
| Workload | Active projects per lead and engineer |

> Use this to spot overload and slow spots, not to rank people. Show the caption "Use these numbers to spot overload and slow spots, not to rank people" at the top of the screen.

Endpoint: `GET /api/analytics/team`.

### 4.11 Operations — `?view=operations`
| Block | Content |
|---|---|
| Messaging | Emails and SMS by status (sent, failed, queued) per day; failure rate; top failure reasons |
| Payments | Paystack attempts, success rate, abandoned checkouts; median time to confirm a transfer |
| Security | Staff sign-ins, failed sign-ins, password resets, one-time codes requested vs verified, rate-limit hits |
| API health | Error responses (4xx/5xx) per day, the slowest endpoints (p95 ms) |

Endpoint: `GET /api/analytics/operations`.

### 4.12 Realtime — `?view=realtime`
Refreshes every **15 seconds** while the tab is visible, and pauses when it is hidden.

| Block | Content |
|---|---|
| Now | Active visitors (last 5 minutes), large |
| Last 30 minutes | Page views per minute as columns |
| Right now | Top pages, top sources, devices |
| Live feed | The last 50 events, anonymised: time, event, page, source, device. No visitor ids and no IPs. |

Endpoint: `GET /api/analytics/realtime`.

### 4.13 Saved views and Reports
See [section 10](#10-exports-saved-views-and-scheduled-reports).

---

## 5. Global controls

| Control | Behaviour |
|---|---|
| **Date range** | Presets: Today, Yesterday, Last 7 days, Last 30 days (default), Last 90 days, This month, Last month, This year, Custom. Always inclusive, always in **Africa/Lagos** time. Sent as `from` and `to` (`YYYY-MM-DD`). |
| **Compare** | None · Previous period (default) · Same period last year. Tiles show the delta (▲/▼ with %); charts show the comparison as a thin dashed line. |
| **Interval** | Auto (hour when the range ≤ 2 days, day ≤ 90 days, week ≤ 1 year, month beyond), with a manual override. |
| **Filters** | Source, medium, campaign, device, country, state, idea category, payment method. Show a filter only on the screens where it applies (the API lists them per screen in `meta.filters`). Active filters appear as removable chips under the title. |
| **Currency** | NGN. Format as `₦1,250,000` (no decimals) or `₦1.25M` in compact tiles. |
| **Numbers** | Thousands separators. Percentages to one decimal place. Durations as `3d 4h`, `2h 10m` or `45s`. |
| **Share** | Every state lives in the URL, so copying it shares exactly what you see. |

A delta is **good** or **bad** according to each metric's `goodDirection` in the API meta. For example, bounce rate going up is bad. Colour the delta with that, never with the arrow direction.

---

## 6. Metric dictionary

All counts are for the selected range in Africa/Lagos time unless the metric says otherwise.

- **Source** says where the number comes from. `events` means browser tracking ([section 7](#7-tracking-what-the-website-records)); anything else is a table in the database. Numbers taken from the database are authoritative.
- **Traffic numbers start from the day tracking goes live.** Show "No data before <date>" rather than zeros for earlier dates. The API returns `trackingSince` in the response meta.

### 6.1 Traffic
| Metric | Definition | Source | Good ↑/↓ |
|---|---|---|---|
| Visitors | Distinct `visitor_id` with at least one event | events | ↑ |
| New visitors | Visitors whose first-ever event falls in the range | events | ↑ |
| Returning visitors | Visitors in range whose first event is before the range | events | ↑ |
| Sessions | Distinct `session_id`. A session ends after 30 minutes without activity, or at midnight Lagos time. | events | ↑ |
| Page views | Count of `page_view` events | events | ↑ |
| Pages per session | Page views ÷ sessions | events | ↑ |
| Avg. session duration | Mean of (last event − first event) per session. Single-event sessions count as 0. | events | ↑ |
| Bounce rate | Sessions with exactly one `page_view` and no other interaction event, ÷ sessions | events | ↓ |
| Source | The UTM source if present, otherwise the referrer's domain grouped by the source rules ([7.5](#75-source-rules)), otherwise `direct` | events | — |

### 6.2 Engagement
| Metric | Definition | Source | Good |
|---|---|---|---|
| CTA clicks | `cta_click` events | events | ↑ |
| CTA click-through rate | Unique visitors who clicked a CTA ÷ unique visitors who viewed the page it sits on | events | ↑ |
| Tracker searches | `tracker_search` events, split by `kind` and `result` | events | — |
| Not-found rate | Tracker searches with `result=not_found` ÷ all tracker searches | events | ↓ |
| Scroll depth | Share of home-page views reaching each threshold | events | ↑ |

### 6.3 Application funnel and pipeline
| Metric | Definition | Source | Good |
|---|---|---|---|
| Idea forms opened | Unique visitors with `idea_form` `step=opened` | events | ↑ |
| Drafts started | Ideas created with status DRAFT in range (`ideas.created_at`) | ideas | ↑ |
| Draft completion rate | Drafts created in range that were later submitted ÷ drafts created in range | ideas | ↑ |
| Ideas submitted | `ideas.submitted_at` in range (never DRAFT) | ideas | ↑ |
| Walk-in share | Submitted with `source=walk_in` ÷ submitted | ideas | — |
| Time to first quote | Median of (`quotes.created_at` of the first quote − `ideas.submitted_at`) | quotes, ideas | ↓ |
| Quote acceptance rate | Quotes accepted ÷ quotes that are no longer open (accepted + declined + withdrawn + expired) | quotes | ↑ |
| Idea → project conversion | Submitted ideas with a `project_id` ÷ submitted ideas (cohort by submission date) | ideas | ↑ |

### 6.4 Revenue — cash vs booked
| Metric | Definition | Source | Kind |
|---|---|---|---|
| Fees collected (gross) | Sum of `amount_kobo ÷ 100` where `status=PAID` and `paid_at` in range | idea_payments | **Cash** |
| Refunded | Sum where `refund_status=REFUNDED` and `refunded_at` in range | idea_payments | **Cash** |
| **Net fee revenue** | Fees collected − Refunded, each by its own date | idea_payments | **Cash** |
| Refunds due | Count and sum where `refund_status IN (PENDING, PROCESSING)` right now (not range-bound) | idea_payments | Liability |
| Awaiting confirmation | Count and sum where `status=AWAITING_CONFIRMATION` right now | idea_payments | Pending cash |
| Payment success rate | PAID ÷ (PAID + FAILED + abandoned PENDING older than 1 hour), Paystack only | idea_payments | ↑ |
| Contract value won | Sum of `quotes.amount` where `status=accepted` and `responded_at` in range | quotes | **Booked** |
| Quoted value | Sum of `quotes.amount` where `created_at` in range | quotes | Pipeline |
| Approved change requests | Sum of `impact_cost` where status APPROVED or COMPLETED and `decided_at` in range | change_requests | **Booked** |
| Support plan MRR | Sum of the monthly price of the current `support_plan` for delivered projects, with prices from site content `supportPlans`. A snapshot "as of today". | projects, site_content | **Booked (recurring)** |
| Estimated course revenue | Sum of the discounted course price for leads that became ENROLLED in range | leads, courses | **Estimate** |

Every money metric in the API carries a `kind` field: `cash`, `booked`, `estimate`, `liability` or `pending`. Show that kind as a small label on the tile.

### 6.5 Projects and delivery
| Metric | Definition | Source | Good |
|---|---|---|---|
| Active projects | Stage not DELIVERED, as of the range end | projects | — |
| Delivered | `delivered_at` in range | projects | ↑ |
| On-time delivery rate | Delivered in range with `delivered_at ≤ target_date` ÷ delivered in range | projects | ↑ |
| Cycle time | Median of (`delivered_at − start_date`) in days, for projects delivered in range | projects | ↓ |
| Time in stage | Median days between entering and leaving each stage | project_stage_history *(new, 8.2)* | ↓ |
| Overdue now | Active projects with `target_date < today` | projects | ↓ |
| Stale projects | Active projects with no client-visible published update for 5+ days | updates | ↓ |
| Updates per project | Client-visible published updates per active project over the last 30 days | updates | ↑ |
| Avg. client rating | Mean `rating_stars` of projects rated in range | projects | ↑ |

### 6.6 Clients
| Metric | Definition | Source | Good |
|---|---|---|---|
| New clients | `clients.created_at` in range | clients | ↑ |
| Portal sign-ins | One-time codes verified (`otp_codes.consumed_at`) in range | otp_codes | ↑ |
| Active clients | Distinct clients with at least one sign-in in range | otp_codes → projects | ↑ |
| Returning-client rate | Clients active in range who were also active in the previous 30 days ÷ active clients | otp_codes | ↑ |
| Messages from clients | `messages.sender=client` in range | messages | — |
| Median team reply time | Per client message: time until the next team message on the same project. The median over messages in range; unanswered messages are excluded and counted separately. | messages | ↓ |

### 6.7 Courses
| Metric | Definition | Source | Good |
|---|---|---|---|
| Course views / clicks | `course_events` with event `view` / `click` | course_events | ↑ |
| Enquiries | Leads created in range (any source) | leads | ↑ |
| Enrolled | Leads whose status became ENROLLED in range | leads | ↑ |
| View-to-enrol rate | Enrolled ÷ course views (same range) | both | ↑ |
| Time to first contact | Median of (first status change from NEW − `created_at`) | leads + activity_log | ↓ |

### 6.8 Team
| Metric | Definition | Source | Good |
|---|---|---|---|
| Updates posted | Updates by `author_id`, client-visible and internal counted separately | updates | — |
| Approval time | Median of (`published_at − created_at`) for updates that were pending | updates | ↓ |
| Replies | Team messages by `user_id` | messages | — |
| Workload | Active projects where the person is the lead or a member | projects, project_members | — |

### 6.9 Operations
| Metric | Definition | Source | Good |
|---|---|---|---|
| Messages sent / failed | `notifications` by status and channel, `created_at` in range | notifications | failed ↓ |
| Delivery failure rate | failed ÷ (sent + failed) | notifications | ↓ |
| Codes requested vs verified | `otp_codes` created vs consumed | otp_codes | — |
| Rate-limit hits | Requests refused with 429 | api_request_log *(new)* | — |
| API errors | Responses ≥ 500, and 4xx excluding 401/404 | api_request_log *(new)* | ↓ |
| p95 latency | 95th percentile response time per endpoint group | api_request_log *(new)* | ↓ |

---

## 7. Tracking: what the website records

Tracking is **first-party** and **batched**. A small script in the existing site (built by the core team) collects events and sends them to `POST /api/track`. The analytics dashboard only reads.

### 7.1 Identifiers
| Id | What | Where | Lifetime |
|---|---|---|---|
| `visitor_id` | A random UUID v4. It has no link to a person. | First-party cookie `apc_vid` (and `localStorage` as a fallback) | 13 months, renewed on visit |
| `session_id` | A random UUID v4 | `sessionStorage` | Ends after 30 minutes idle or at midnight Lagos time |

Rules:
- **Never** put a name, email, phone, Project ID, idea reference or IP into an event.
- The server links a signed-in client or staff member to a visit only in aggregate, e.g. "sessions that signed in to the portal". It never exposes that link in any response.

### 7.2 Page URL hygiene
Before sending, the tracker **removes** these query parameters from `path` and `referrer`: `resume`, `token`, `reset`, `reference`, `ref`, `code`, `email`. They are private links. It keeps `utm_*`, `view`, `funnel` and `payment`.

### 7.3 Event catalogue
| Event | When | Properties |
|---|---|---|
| `page_view` | Every route change, including `?view=` changes | `path`, `title` |
| `cta_click` | A tracked call-to-action is clicked | `id` (see 7.4), `path` |
| `tracker_search` | The home-page tracker is submitted | `kind`: project/idea · `result`: found/not_found/rate_limited/error |
| `portal_signin` | Client sign-in steps | `step`: code_requested/verified/failed |
| `idea_form` | Application steps | `step`: opened/about_you/idea/budget/payment/draft_saved/resume_link_requested/submitted · `variant`: modal/page |
| `payment` | Wallet actions | `method`: paystack/manual · `step`: started/returned_success/returned_failed/transfer_reported |
| `course_view` / `course_click` | Course cards | `courseId` |
| `quote` | Quote page | `step`: viewed/accepted/declined |
| `download` | A file download | `kind`: report/proposal/file |
| `outbound_click` | A link to another site | `host` (not the full URL) |
| `scroll_depth` | Home page thresholds | `depth`: 25/50/75/100 |
| `client_error` | An unexpected UI error | `code` (no message text) |

**Business facts** (payments, submissions, quotes, projects) are **not** tracked from the browser. They are read from the database, which is the source of truth.

### 7.4 CTA ids
`nav_submit_idea`, `hero_track`, `flier_cta`, `course_enrol`, `course_info`, `footer_cta`, `announcement_link`, `portal_learn_this`, `portal_invite`, `apply_pay_paystack`, `apply_pay_transfer`, `apply_save_later`.

To add one: give the element `data-track="<id>"` and the tracker picks it up.

Each event also carries a `name` (the CTA id, the step, or the course id) so the API can group without reading `props`. `idea_form` steps are sent in this order: `opened` → `about_you` → `idea` → `budget` → `payment` → `draft_saved` / `resume_link_requested` → `submitted`.

### 7.5 Source rules
1. If `utm_source` is present, use it (lower-cased). The medium comes from `utm_medium`, else `referral`.
2. Otherwise group the referrer domain:
   - **search:** google, bing, duckduckgo, yahoo, yandex
   - **social:** facebook, instagram, x/twitter, linkedin, tiktok, whatsapp, youtube
   - **email:** mail.google, outlook
   - Anything else keeps its domain as a **referral**.
3. No referrer (or our own domain) means `direct`.

### 7.6 Transport and filtering
- **Batching:** events are sent in batches of up to 20, and immediately on `pagehide` using `navigator.sendBeacon`.
- **Server-side filtering:**
  - Payload cap: 32 KB.
  - Rate limit: 120 events per minute per IP.
  - Bots are dropped by user-agent list and headless markers.
  - Staff sessions are flagged `internal=1` and excluded by default. There is a toggle "Include staff traffic".
- **Opt-out:** tracking is off when Do Not Track or Global Privacy Control is set, or when the visitor turns it off in the cookie notice.

---

## 8. Data model

### 8.1 Existing tables the dashboard reads
`projects`, `project_members`, `clients`, `ideas`, `idea_payments`, `quotes`, `change_requests`, `updates`, `messages`, `milestones`, `leads`, `courses`, `course_events`, `otp_codes`, `notifications`, `activity_log`, `users`, `site_content`.

### 8.2 New tables (built by the core team)
```sql
-- One row per tracked browser event (raw, 13-month retention)
analytics_events (
  id            BIGINT UNSIGNED PK,
  occurred_at   DATETIME(3)  NOT NULL,       -- client time, clamped to server time ± 10 min
  received_at   DATETIME(3)  NOT NULL,
  visitor_id    CHAR(36)     NOT NULL,
  session_id    CHAR(36)     NOT NULL,
  event         VARCHAR(40)  NOT NULL,       -- page_view, cta_click, …
  name          VARCHAR(80)  NULL,           -- cta id, funnel step, course id …
  path          VARCHAR(255) NULL,           -- cleaned (7.2)
  props         JSON         NULL,           -- whitelisted keys only
  source        VARCHAR(80)  NULL,  medium VARCHAR(40) NULL, campaign VARCHAR(120) NULL,
  referrer_host VARCHAR(120) NULL,
  device        ENUM('desktop','mobile','tablet') NULL,
  browser       VARCHAR(40)  NULL,  os VARCHAR(40) NULL,
  country       CHAR(2)      NULL,  state VARCHAR(80) NULL,    -- from IP, IP not stored
  internal      TINYINT(1)   NOT NULL DEFAULT 0,               -- staff traffic
  KEY (occurred_at), KEY (event, occurred_at), KEY (session_id), KEY (visitor_id)
)

-- One row per session, updated as events arrive
analytics_sessions (
  session_id CHAR(36) PK, visitor_id CHAR(36), started_at, ended_at, page_views INT,
  events INT, landing_path, exit_path, source, medium, campaign, referrer_host,
  device, browser, os, country, state, is_bounce TINYINT(1), internal TINYINT(1),
  signed_in_as ENUM('none','client','staff')
)

-- First-seen date per visitor (new vs returning)
analytics_visitors (visitor_id CHAR(36) PK, first_seen DATETIME, last_seen DATETIME)

-- Daily rollups so long ranges stay fast (kept forever)
analytics_daily (day DATE, metric VARCHAR(40), dimension VARCHAR(40), value_key VARCHAR(160),
                 value BIGINT, PRIMARY KEY (day, metric, dimension, value_key))

-- Stage history, for time-in-stage (back-filled from existing stage updates)
project_stage_history (id, project_id, from_stage, to_stage, changed_at, changed_by)

-- Lightweight request log, for the Operations screen (30-day retention)
api_request_log (id, at DATETIME(3), method, route, status SMALLINT, ms INT, internal TINYINT(1))

-- Dashboard features
analytics_saved_views (id, user_id, name, query JSON, shared TINYINT(1), created_at)
analytics_schedules   (id, user_id, name, view, query JSON, frequency ENUM('daily','weekly','monthly'),
                       recipients JSON, format ENUM('pdf','csv','xlsx'), last_sent_at, active TINYINT(1))

-- Access flag
ALTER TABLE users ADD can_view_analytics TINYINT(1) NOT NULL DEFAULT 0;
```

### 8.3 Jobs (cron)
| Job | Schedule | Does |
|---|---|---|
| `bin/analytics-rollup.php` | Every night at 01:00 Lagos | Rolls up yesterday into `analytics_daily`, closes sessions, and re-rolls the last 3 days to catch late events |
| `bin/analytics-reports.php` | Every hour | Sends due scheduled reports |
| `bin/analytics-prune.php` | Every night | Deletes raw events older than 13 months and request logs older than 30 days |

**Query strategy.** Today and yesterday are read from raw events; older days come from the rollups. For a mixed range the API stitches both together. The frontend never needs to care about this.

---

## 9. API contract

- **Base path:** `/api/analytics`.
- **Transport:** JSON over the same session cookie as the Engineering Panel.
- **Requests:** send `credentials: "include"` on every request. Every non-GET request also needs the header `X-Requested-With: XMLHttpRequest`.
- **Errors:** `{ "error": "message", "errors": { "field": "message" } }`
  - `401`: signed out.
  - `403`: no analytics access, or an admin-only section.
  - `422`: bad parameters.
  - `429`: too many requests.

### 9.1 Common query parameters
| Param | Values | Default |
|---|---|---|
| `from`, `to` | `YYYY-MM-DD` (Africa/Lagos, inclusive) | last 30 days |
| `compare` | `none`, `previous`, `year` | `previous` |
| `interval` | `auto`, `hour`, `day`, `week`, `month` | `auto` |
| `source`, `medium`, `campaign`, `device`, `country`, `state`, `category`, `method` | a filter value | — |
| `includeInternal` | `1` to include staff traffic | `0` |

Maximum range: 2 years. Hour interval only for ranges ≤ 7 days.

### 9.2 Session
`GET /api/analytics/me`
```json
{
  "user": { "id": 1, "name": "Aptech Dev Team", "role": "admin" },
  "canViewAnalytics": true,
  "sections": ["overview","traffic","engagement","funnels","revenue","projects","pipeline","clients","courses","team","operations","realtime"],
  "timezone": "Africa/Lagos",
  "currency": "NGN",
  "trackingSince": "2026-09-20"
}
```
Render only the sections listed in `sections`.

### 9.3 Response envelope (every screen endpoint)
```json
{
  "range":   { "from": "2026-08-20", "to": "2026-09-18", "timezone": "Africa/Lagos", "interval": "day" },
  "compare": { "from": "2026-07-21", "to": "2026-08-19" },
  "generatedAt": "2026-09-18T10:42:07+01:00",
  "meta": {
    "trackingSince": "2026-09-20",
    "filters": ["source","device","state"],
    "definitions": { "visitors": "Distinct visitor ids with at least one event…" }
  },
  "data": { }
}
```

### 9.4 Building blocks inside `data`
```jsonc
// A KPI value
{ "key": "visitors", "label": "Visitors", "value": 1284, "previous": 1146, "change": 0.12,
  "format": "number",            // number | currency | percent | duration
  "goodDirection": "up",         // up | down | none
  "kind": null }                 // cash | booked | estimate | liability | pending (money only)

// A time series
{ "key": "visitors", "points": [ { "t": "2026-09-01", "value": 42, "previous": 38 } ] }

// A breakdown row
{ "key": "google", "label": "Google (search)", "value": 312, "share": 0.243, "change": 0.08,
  "extra": { "conversion": 0.031 } }

// A funnel step
{ "key": "fee_paid", "label": "Fee paid", "count": 58, "fromPrevious": 0.62, "fromStart": 0.045,
  "medianSecondsFromPrevious": 5400 }
```

### 9.5 Endpoints
| Method & path | `data` contains |
|---|---|
| `GET /overview` | `kpis[6]`, `trend.visitors`, `trend.ideas`, `funnel[6]`, `attention{overdue[],transfers[],refunds[],stale[]}`, `topSources[5]` |
| `GET /traffic` | `kpis[6]`, `newVsReturning{new,returning}`, `heatmap[7][24]` (Mon–Sun × 0–23) |
| `GET /traffic/timeseries?metric=visitors\|sessions\|pageviews\|bounce_rate\|duration` | `series` |
| `GET /traffic/breakdown?dimension=source\|medium\|campaign\|referrer\|landing_page\|page\|device\|browser\|os\|country\|state&limit=50` | `rows[]`, `total` |
| `GET /engagement` | `kpis[]`, `interactions[]{event,target,count,visitors,ctr}`, `trackerSearches{byKind,byResult}`, `scrollDepth{25,50,75,100}`, `downloads[]` |
| `GET /funnels/{application\|sales\|portal\|courses}?by=source\|device\|category` | `steps[]`, `overall`, `breakdown[]{key,label,steps[]}` |
| `GET /revenue` 🔒 | `cash{kpis[]}`, `booked{kpis[]}`, `series.netFees`, `byMethod[]`, `refunds{count,amount,medianDaysToRefund}`, `quotes{series[],acceptanceRate}`, `ledger[]` (paged: `page`, `pages`) |
| `GET /projects` | `kpis[]`, `byStage[]`, `timeInStage[]`, `deliveryVsTarget[]{code,title,daysEarlyOrLate}`, `updateFrequency[]`, `table[]` |
| `GET /pipeline` | `kpis[]`, `series.submitted{online,walkIn}`, `by{category,platform,budget,state}`, `ageing[]`, `table[]` |
| `GET /clients` | `kpis[]`, `series.signIns`, `engagement{approvals,changeRequests,uploads,courseRequests,ratings}`, `optOuts{digest,promos}`, `byLocation[]` |
| `GET /courses` | `kpis[]`, `byCourse[]`, `bySource[]`, `counsellors[]` |
| `GET /team` 🔒 | `kpis[]`, `people[]`, `workload[]` |
| `GET /operations` | `messaging{series[],failureRate,topErrors[]}`, `payments{attempts,successRate,abandoned,medianConfirmHours}`, `security{staffSignIns,failedSignIns,passwordResets,codesRequested,codesVerified,rateLimited}`, `api{errors[],slowest[]}` |
| `GET /realtime` | `activeVisitors`, `perMinute[30]`, `topPages[]`, `topSources[]`, `devices[]`, `feed[50]{at,event,path,source,device}` |
| `GET /export?view=<screen>&table=<key>&format=csv\|xlsx` | A file download (the same filters as the screen) |
| `GET/POST /views`, `PATCH/DELETE /views/{id}` | Saved views |
| `GET/POST /schedules`, `PATCH/DELETE /schedules/{id}` | Scheduled reports |
| `POST /api/track` *(public)* | Tracker ingest. `{visitorId, sessionId, events[]}` → `204`. |

**Caching.** Responses carry `Cache-Control: private, max-age=60`, except realtime (`no-store`). The client may reuse a response for 60 seconds when switching tabs.

---

## 10. Exports, saved views and scheduled reports

### 10.1 Exports
| Format | How | Content |
|---|---|---|
| **CSV** | `GET /export?...&format=csv` | One table. UTF-8 with BOM (so Excel shows ₦ correctly), `,` separator, ISO dates, raw numbers (no ₦ or `%` signs) plus a unit row. |
| **Excel (.xlsx)** | `GET /export?...&format=xlsx` | One sheet per table on the screen, plus a **"Read me"** sheet with the range, filters, generated-at time and the definitions of the metrics included. |
| **PDF** | Built in the browser with the print stylesheet (`@media print`) or jsPDF | The whole screen: title, range, filters, tiles, charts (as SVG) and tables, with a footer giving the page number, generated-at time and "Confidential — Aptech". A4 portrait; wide tables switch to landscape. |
| **PNG** | Per chart, from the chart's ⋯ menu | That chart only, with its title and range |

Every export states the date range, filters and generation time. Nothing is exported without its definitions.

### 10.2 Saved views
- **"Save view"** stores the current screen and its query string under a name.
- A view is **Personal** by default. Admins can make it **Shared** with everyone who has analytics access.
- Saved views are listed in the sidebar. Opening one restores the exact URL.

### 10.3 Scheduled reports
- Created from any screen via **⋯ → Email this regularly**.
- **Frequency:** daily at 07:00, weekly on Monday at 07:00, or monthly on the 1st at 07:00 (Lagos time).
- **Recipients:** staff with analytics access only. External addresses are not allowed in v1.
- **Format:** PDF summary (default), CSV or Excel attached.
- **Dates:** each send uses a *rolling* range ("last 7 days"), not the dates that were on screen when it was set up.
- **Weekly business summary:** one is on by default for admins.

---

## 11. Design system and colour guide

The dashboard must look like part of AI Project Connect. Use the existing Tailwind v4 tokens from `app/globals.css`; do not introduce new brand colours.

### 11.1 Brand tokens (existing)
| Token | Hex | Use |
|---|---|---|
| `navy-950` | `#06142a` | Sign-in background, deepest surface |
| `navy` | `#0b1f3a` | Sidebar, top bar, primary text on light |
| `navy-800` | `#112846` | Sidebar hover |
| `navy-700` | `#1a3561` | Borders on navy |
| `navy-600` | `#26467a` | Secondary on navy |
| `brand` | `#f26b22` | Primary actions, active nav marker, the "Analytics" badge |
| `brand-600` | `#e05a12` | Primary hover |
| `brand-700` | `#b9470a` | Orange text on light (meets AA) |
| `brand-soft` | `#fdebdd` | Highlight backgrounds |
| `teal` | `#14a38b` | Positive accents |
| `teal-700` | `#0d7a68` | Positive text on light |
| `teal-soft` | `#ddf2ee` | Positive backgrounds |
| `mist` | `#f3f5f9` | Page background (light) |
| `line` | `#e3e8f0` | Card borders, hairlines |
| `muted` | `#5b6b82` | Secondary text, axis labels |
| `blue-soft` | `#dfe7f2` | Info backgrounds |
| `danger` | `#b42318` | Errors, destructive actions |
| `danger-soft` | `#fbe3e1` | Error backgrounds |

**Typography:** Poppins (`font-display`) for headings, tile values and the hero numbers; Lato (`font-sans`) for everything else. Use `font-variant-numeric: tabular-nums` in tables and on axis ticks only.

**Shape:**
- Cards use `rounded-2xl` with a 1px `line` border and a very soft shadow.
- Buttons are `rounded-xl` (44px tall for primary actions); pills are `rounded-full`.
- Spacing sits on a 4px grid: 16px gutters on mobile, 24–32px on desktop.

**Light and dark themes:** the app shell (sidebar, top bar, sign-in) is navy. Content areas are light by default (a white card on `mist`). A dark content theme is optional in v1 — if you build it, use the dark chart steps below and the surface `#0b1f3a`.

### 11.2 Chart palette — validated
The palette was checked with a colour-blindness validator:
- Protanopia and deuteranopia were simulated (Machado 2009).
- Separation is measured as Delta E in OKLab ×100: at least 8 for colour-blind vision and at least 15 for normal vision, for every pair of neighbouring colours.
- It was tested on the surfaces the dashboard actually uses: white `#ffffff` for light, and navy `#0b1f3a` for dark.

**Assign the series slots in this order and never cycle them.** The order is part of what makes the palette colour-blind safe.

| Slot | Hue | Light (on `#ffffff`) | Dark (on `#0b1f3a`) |
|---|---|---|---|
| 1 | Brand orange | `#f26b22` | `#e05a12` |
| 2 | Teal | `#14a38b` | `#14a38b` |
| 3 | Blue | `#2a78d6` | `#3987e5` |
| 4 | Magenta | `#e87ba4` | `#d55181` |
| 5 | Yellow | `#eda100` | `#c98500` |
| 6 | Green | `#008300` | `#007a1e` |
| 7 | Violet | `#4a3aa7` | `#9085e9` |
| 8 | Red | `#e34948` | `#e66767` |

Validator results:

| Check | Light | Dark |
|---|---|---|
| All 8 inside the lightness band, chroma above the floor | PASS | PASS |
| Worst neighbouring pair, colour-blind vision | 12.7 (teal–orange) | 9.8 (green–yellow) |
| Worst neighbouring pair, normal vision | 19.2 | 17.9 |
| Contrast below 3:1 against the surface | magenta 2.7:1, yellow 2.2:1 | green 2.99:1 |

**Rules that come with the palette:**
1. **Contrast relief.** Where a colour is under 3:1 (light: slots 4 and 5; dark: slot 6), charts using it must show **direct value labels or offer the table view**. Every chart already has a table view (see 13.3), which satisfies this.
2. **Scatter, bubble, map and small multiples:** use at most **3 series** (slots 1–3). Those three pass every-pair checks (colour-blind 12.7, normal 19.2). Beyond three, fold the rest into "Other" or split the chart.
3. **More than 8 series is not allowed.** Show the top 7 plus "Other" in grey `#8a96a8`.
4. **One series means one colour.** A single-series bar chart uses slot 1 for every bar. Never colour bars by their value.
5. **Colour follows the thing, not its rank.** "Paystack" is always the same slot on every screen, even when a filter hides other methods.
6. **Text is never series-coloured.** Values, labels and legends use `navy` / `muted`; a coloured swatch beside the text carries the identity.

**Fixed series assignments** (use these on every screen so people learn them):

| Thing | Slot |
|---|---|
| Current period | 1 (orange) |
| Comparison period | The same hue, dashed 1.5px, 60% opacity |
| Paystack · Bank transfer · At centre | 1 · 2 · 3 |
| Online · Walk-in | 1 · 3 |
| Desktop · Mobile · Tablet | 3 · 1 · 2 |
| Cash · Booked · Estimate | teal-700 `#0d7a68` · navy `#0b1f3a` · muted `#5b6b82`, used as tile label chips, not chart series |

### 11.3 Sequential, ordinal and diverging
| Job | Use | Colours |
|---|---|---|
| **Sequential** (heatmap: visits by hour, map shading) | One hue, light → dark | Blue ramp `#cde2fb` `#9ec5f4` `#6da7ec` `#3987e5` `#2a78d6` `#1c5cab` `#104281` `#0d366b`. Zero = `mist` `#f3f5f9`. |
| **Ordinal** (funnel steps, ageing buckets) | Ordered steps of one hue | Blue steps 250 → 700: `#86b6ef` `#5598e7` `#2a78d6` `#1c5cab` `#104281` `#0d366b`. The lightest step must still show against white (≥ 2:1), so never start lighter than `#86b6ef`. |
| **Diverging** (days early/late, change vs previous) | Two hues around a grey middle | Early / better = blue `#2a78d6`; late / worse = red `#e34948`; middle `#e3e8f0`. Same number of steps each side. |

### 11.4 Status colours (fixed, never themed)
Status always carries an **icon + label**; colour is never the only signal.

| Status | Colour | Icon | Example |
|---|---|---|---|
| Good | `#0ca30c` (text `#006300`) | ✓ check | Delivered on time |
| Warning | `#fab219` | ! triangle | Transfer waiting for 2+ days |
| Serious | `#ec835a` | ! circle | Project overdue |
| Critical | `#d03b3b` (text `#b42318`) | ✕ octagon | Payment failures spiking |

**Deltas on tiles:**
- **Good change:** teal-700 text on teal-soft.
- **Bad change:** danger text on danger-soft.
- **No change or neutral metric:** muted text.

The arrow shows direction (▲/▼); the colour shows good or bad, from `goodDirection`.

### 11.5 Chart anatomy
- **Marks:**
  - Lines are 2px with a 4px rounded end. Markers are at least 8px and only on hover or the last point.
  - Bars have 4px rounded data-ends, anchored to a zero baseline, with a 2px gap between bars.
  - Stacked segments are separated by a 2px surface-coloured gap.
- **Axes and grid:** gridlines are a `line` `#e3e8f0` hairline, horizontal only. Axis labels are `muted`, 12px. Keep ticks few (4–6). The y-axis always starts at 0 for bars.
- **Labels:** label selectively — the last point, max and min — never every point. Direct-label series when there are ≤ 4 of them; otherwise use a legend. Charts with 2 or more series always have a legend.
- **Never:**
  - Dual y-axes: two scales means two charts.
  - Pie charts with more than 4 slices, 3D effects or gradients.
  - Rainbow scales.
- **Hover:**
  - Line and area charts get a crosshair and a tooltip listing every series at that point, including the comparison value and the delta.
  - Bars and heatmap cells get a per-mark tooltip.
  - Hit targets are larger than the mark (at least 24px).
- **Empty data:** show a neutral message inside the chart frame ("No visits in this range"), not an empty axis.

### 11.6 Sign-in page
```
┌───────────────────────────────────────────────┐
│  navy-950 background, subtle ring pattern     │
│                                               │
│      ▣ AI Project Connect  [ANALYTICS]        │   ← badge: brand bg, white text, rounded-full
│                                               │
│   ┌───────────────────────────────────────┐   │
│   │  Sign in to Analytics                 │   │   ← white card, rounded-2xl
│   │  Use your AI Project Connect staff     │   │
│   │  account.                             │   │
│   │  Work email      [________________]   │   │
│   │  Password        [____________] 👁     │   │
│   │  [        Sign in  →        ]          │   │   ← brand button
│   │  Forgot password?                     │   │
│   └───────────────────────────────────────┘   │
│   Looking for the Engineering Panel? →        │
└───────────────────────────────────────────────┘
```

---

## 12. Chart catalogue

| Data | Chart | Why |
|---|---|---|
| A headline number | **KPI tile** (value, delta chip, sparkline of the range) | One number needs no axes |
| A metric over time | **Line** (area only for a single cumulative series) | Change over time |
| Two metrics over time with different scales | **Two stacked small charts** sharing the x-axis | Never a dual axis |
| Share of a whole with ≤ 4 parts | **Horizontal 100% bar** | Easier to compare than a pie |
| Ranking (sources, pages, courses) | **Horizontal bars**, sorted, top N + Other | Long labels stay readable |
| Funnel | **Horizontal bars in ordinal blue**, with conversion % between steps | Order shown by colour steps |
| Day × hour | **Heatmap** in sequential blue | Magnitude over two dimensions |
| Early / late vs target | **Diverging bars** around zero | Sign carries meaning |
| Nigeria by state | **Sorted bar chart**. A choropleth map is optional. | Bars are more accurate than area |
| Money by period | **Columns** | Discrete periods |
| Detail | **Table** with sticky header, sorting, CSV/Excel | Always available |

---

## 13. States, performance and accessibility

### 13.1 States
| State | Show |
|---|---|
| Loading | A skeleton with the same shape as the content: tiles, chart frame, table rows. Never a bare spinner on the whole page. Never show `0` while loading. |
| Empty | A plain sentence of what's missing and why ("Tracking started on 20 Sep — pick a later range"). |
| Error | Inline in the card: the server's message plus a **Try again** button. Other cards keep working. |
| Partial | If a comparison fails but the main data loads, show the data and "Comparison unavailable". |
| Stale | If the data is older than 10 minutes (the tab was left open), show "Updated 14 min ago · Refresh". |

### 13.2 Performance budgets
| Budget | Target |
|---|---|
| Overview first paint (warm cache) | < 1.5 s on a mid-range Android over 4G |
| Any screen request (p95) | < 800 ms for ≤ 90-day ranges; < 2 s for 2-year ranges |
| Dashboard JavaScript | < 250 KB gzipped beyond the shared app bundle. Lazy-load the charting library per screen. |
| Tracker script on the public site | < 3 KB gzipped, loaded `defer`, and it never blocks rendering |

**Suggested chart library:** a light SVG library, e.g. **visx** or **Recharts** — your choice, but it must render SVG (for the PDF export) and support the anatomy rules above.

### 13.3 Accessibility (WCAG 2.2 AA)
- **Table view:** every chart has one, via a "Table" toggle, which is also the screen-reader path. SVG charts carry `role="img"` and an `aria-label` summary ("Visitors rose 12% to 1,284 over the last 30 days").
- **Keyboard:** full keyboard access — the date picker, tabs, table sorting, chart tooltips (arrow keys move between points) and menus.
- **Contrast:** text contrast is at least 4.5:1 (3:1 for large numbers). Colour is never the only signal (see 11.2 and 11.4).
- **Motion:** respect `prefers-reduced-motion`. No count-up animations then.
- **Language:** plain, sentence case, no jargon in labels. Technical terms live in the definitions drawer.

---

## 14. Privacy and security

- **Nigeria Data Protection Act 2023:**
  - Analytics is aggregate and pseudonymous.
  - Show a short cookie notice with an opt-out on the public site; honour Do Not Track and Global Privacy Control.
  - Record the notice in the privacy policy.
- **No personal data in tracking.** Private link parameters are stripped (7.2).
- **IP addresses:** used only for rate limiting and coarse location (country and state). They are never stored in analytics tables.
- **Access control:**
  - Every endpoint checks the session and `canViewAnalytics`; Revenue and Team also check `role = admin`.
  - The dashboard must not rely on hiding things in the UI.
- **Exports:** scheduled reports go only to staff with access. Exported files state "Confidential".
- **The audit log records** analytics sign-ins, exports and schedule changes (who, what, when).
- **Retention:** raw events 13 months, request logs 30 days, rollups kept.
- **No third-party scripts** on the dashboard or the tracker.

---

## 15. Acceptance criteria

The dashboard is done when:

1. **Sign-in:**
   - `/analytics` shows the branded sign-in page.
   - Staff credentials work.
   - A user without `canViewAnalytics` sees the no-access message and nothing else.
   - A non-admin never sees Revenue or Team, and the API refuses them.
2. **Screens:** every screen in section 4 renders with real API data, loading, empty and error states, and works from 360px to 1920px wide without horizontal page scroll.
3. **Numbers:** every tile matches the API exactly. No number is recomputed in the browser, except formatting.
4. **Compare:** turning compare on shows deltas on the tiles and dashed comparison lines; good/bad colour follows `goodDirection`.
5. **URLs:** every filter, range and view survives a page reload and a copy-pasted URL.
6. **Exports:** CSV and Excel downloads contain the same rows as the screen, with the range, filters and definitions; the PDF export of each screen is legible in A4.
7. **Saved views:** create, open, rename, delete and share (admin).
8. **Scheduled reports:** create, edit, pause and delete; a test send arrives with the right range.
9. **Colours:** charts use only the palette in 11.2–11.4 in slot order; the table view is available for every chart.
10. **Accessibility:** keyboard-only walkthrough of every screen passes; axe shows no serious or critical issues.
11. **Realtime:** updates every 15 s while visible and stops when the tab is hidden.
12. **Performance:** meets the budgets in 13.2 on the staging server.

---

## 16. Delivery plan

| Phase | Owner | Scope |
|---|---|---|
| 1. Back end | Core team | New tables, `POST /api/track`, all `GET /api/analytics/*` endpoints, rollups, exports, saved views, schedules, and tests. Plus the tracker script and `data-track` attributes on the public site and portal. |
| 2. Shell and Overview | Dashboard developer | Sign-in, layout, navigation, global controls, URL state, Overview |
| 3. Core screens | Dashboard developer | Traffic, Engagement, Funnels, Revenue, Projects, Pipeline |
| 4. Remaining screens | Dashboard developer | Clients, Courses, Team, Operations, Realtime |
| 5. Output | Dashboard developer | Exports, saved views, scheduled reports UI, print stylesheet |
| 6. QA | Both | Acceptance criteria, accessibility pass, performance on staging |

**Working agreement:**
- The API contract in section 9 is the interface. If a screen needs a number that isn't in a response, ask for it rather than deriving it in the browser.
- Until phase 1 ships, build against the JSON examples in section 9.4.
- Use the demo database (`php bin/setup.php --demo`) for realistic business data, plus the tracker seed (`--demo-analytics`, added in phase 1) for traffic.

---

## 17. Appendix

### 17.1 Glossary
| Term | Meaning |
|---|---|
| Commitment fee | The one-off ₦2,000 (configurable) fee a client pays before an idea is submitted; refunded in full if the idea is declined |
| Draft | An application saved but not yet submitted |
| Walk-in | An application started by staff at an Aptech centre for a visitor |
| Booked value | Money agreed (accepted quotes, approved changes) but not collected through the platform |
| Stale project | An active project with no client-visible update for 5+ days |
| CTA | Call to action — a button meant to move someone forward |
| MRR | Monthly recurring revenue |

### 17.2 Naming conventions
- Events: `snake_case` nouns (`page_view`, `cta_click`), with the variation in `name` / `props`.
- CTA ids: `<place>_<action>` (`hero_submit_idea`).
- Metric keys in the API: `camelCase` (`netFeeRevenue`, `onTimeRate`).

### 17.3 Related documents
- `README.md` — how the project runs and deploys
- `backend/README.md` — the full API reference for the existing platform
- `app/globals.css` — the design tokens

## 18. Build notes (v1.1)

The back end in section 9 is built, tested (132 automated checks) and running on the demo database. The API follows this spec, with the clarifications below. Build against the real responses; these notes explain the fields you will see.

### 18.1 Extra response fields
- **Filters:** every screen's `meta` also has `appliedFilters` (the filters the server actually used) and `includeInternal` (whether staff traffic is counted).
- **Money on shared screens:** it is admin-only. On Overview and Courses, a money tile comes back as `{ "value": null, "restricted": true }` for non-admins, and amounts in the Overview attention list are `null`. Render these as "Admin only", never as ₦0.
- **Attention rows** carry the record ids and `link: "/engineering"`. The panel has no deep links yet, so link to the panel.
- **Funnel notes:** a breakdown that doesn't apply (see 18.2) returns an empty `breakdown` plus `notes: ["…"]`. Show the note instead of an empty table.
- **Excel exports:** the `X-Export-Format` response header says `xlsx` or, on a server without the zip extension, `xls`. Name the downloaded file accordingly.

### 18.2 How some numbers are counted
| Topic | What the API does |
|---|---|
| Visitors across a range | Exact distinct visitors for any range and filter, read from the session table |
| Long ranges | Days before yesterday come from nightly rollups; yesterday and today from raw events. Both paths give identical totals (tested). |
| Overview filters | The Overview takes no filters; it mixes traffic and business figures. |
| Application and portal funnels | Counted in tracked visitors. `by=category` is not possible for these two. |
| Sales funnel | "Reviewed" has no timestamp, so its median time is `null`. Ideas marked "quote sent" without a quote record count as sent but are left out of the medians. |
| Courses funnel | "Viewed" and "clicked" count visitors; "enquiry", "contacted" and "enrolled" count course leads. |
| Time to first contact / enrolled | From the new `leads.contacted_at` and `leads.enrolled_at` columns (back-filled for existing leads) |
| Security figures | Staff sign-ins, failed sign-ins and rate-limit hits come from the request log, so they cover the last 30 days only. |
| Location | `country` comes from Cloudflare's `CF-IPCountry` header when present. `state` is always `null` — shared hosting has no GeoIP. Hide the State breakdown until one is added. |

### 18.3 Tracking
- **Private links:** paths keep only `utm_*`, `view`, `funnel` and `payment` in the query string. Everything else is removed on the server as well as in the browser.
- **CTA ids:** any id matching `^[a-z0-9_]{1,60}$` is accepted, so a new `data-track` id works without a back-end change.
- **Filtered requests:** requests dropped for Do Not Track, Global Privacy Control or bots still get `204`.
- **Retention:** raw events are kept for 13 months. Sessions and visitors are kept for 25 months, so exact visitor counts cover the full 2-year range.

### 18.4 Scheduled reports
A PDF schedule sends an HTML summary email with a link to the screen, because the PDF itself is made in the browser. CSV and Excel schedules attach the file.

### 18.5 Running it locally
```bash
php bin/setup.php --demo --demo-analytics   # fresh demo data plus ~90 days of traffic
php bin/analytics-rollup.php                # nightly job; safe to run again
php tests/analytics.php http://127.0.0.1:8088
```
Sign in at `/analytics` with `admin@aptechdevteam.com` / `Aptechdev123` once your screens exist. Until then, call the endpoints directly with that session.

*AI Project Connect · Aptech · Confidential*

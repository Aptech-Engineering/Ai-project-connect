# AI Project Connect — Back-end API

PHP 8.1+ and MySQL/MariaDB API for the AI Project Connect website, Client Portal and Engineering Panel.
It has no framework and needs no Composer packages on the server, so it runs on shared cPanel hosting such as **Nairahost**.

The Next.js frontend is exported as static files and calls this API at `/api/...` on the same domain.

```
yourdomain.com/          → Client Portal        ┐
yourdomain.com/apply     → idea application     │ Next.js static export (public_html)
yourdomain.com/quote     → private quote link   │
yourdomain.com/engineering → Engineering Panel  ┘
yourdomain.com/api/...   → this API (public_html/api → ~/apc-backend)
                              ↓
                          MySQL + ~/apc-backend/storage/uploads
```

Every link the back end emails or redirects to is built in `src/Support/Links.php` from `app.frontend_url`
(falling back to `app.url`), with any trailing slash removed:

| Link | Shape |
|---|---|
| Continue your application | `{frontend}/apply?resume=<64-char token>` |
| Back from Paystack checkout | `{frontend}/apply?ref=IDEA-4QX7M&payment=success\|pending\|failed&reference=FEE-…` |
| Private quote | `{frontend}/quote?ref=IDEA-4QX7M&token=<48-char token>` |
| Staff password reset | `{frontend}/engineering?reset=<token>` |
| Staff sign-in, weekly digest | `{frontend}/engineering`, `{frontend}` |
| Paystack callback & webhook (API, always `app.url`) | `{api}/api/payments/paystack/callback`, `{api}/api/payments/paystack/webhook` |

## What's included

| Area | Features |
|---|---|
| Public site | Website content, published courses and technologies, public flier images, idea submission with PDF brief, idea status by reference, course enquiries |
| Client Portal | Sign-in with Project ID + one-time code (email + SMS), multiple projects per client, client-safe project view, messages, milestone approval, "Learn this" course requests, course-suggestion opt-out, rating at delivery, shared file downloads |
| Engineering Panel | Staff sign-in, dashboard, projects list and detail, client-visible/internal updates, lead approval for engineer updates, stage & progress with automatic client update, tech stack tagging, milestones, team assignment, file sharing, Project ID regeneration, message replies, approvals queue |
| Ideas | Inbox with status and notes, PDF brief viewing, convert to client + project with a new Project ID |
| Commitment fee wallet | Save-and-resume draft applications (private resume links by email), ₦2,000 non-credit commitment fee via Paystack (verified server-side + signed webhook) or bank transfer with proof, admin confirmation queue, payment receipts, approval blocked until paid, automatic refund queue when a paid idea is declined, walk-in applications, wallet ledger on the application page and in the Client Portal |
| Course leads | Counsellor queue with statuses, notes and conversion stats |
| Analytics | First-party, privacy-respecting website tracking (`POST /api/track`), a read-only dashboard API for 12 screens (traffic, engagement, funnels, revenue, projects, pipeline, clients, courses, team, operations, realtime), CSV/Excel exports, saved views, scheduled email reports, nightly rollups and retention — see [Analytics](#analytics) |
| Admin | Website content, image uploads, courses & pricing (discounts, fliers, enrolment links), technologies, staff accounts & roles, notification log, **Settings** (Paystack keys, test/live mode, fee, bank account, email/SMS drivers — secrets encrypted in the database) |
| Security | Hashed passwords, hashed short-lived one-time codes with attempt limits, database rate limiting, role checks on every endpoint, random non-sequential Project IDs, uploads checked by file content and stored outside the web root, CSRF header + origin checks, audit log |

## Folder structure

```
backend/
  public/            → upload to public_html/api (index.php + .htaccess only)
  src/               → application code
    Core/            → router, request/response, database, auth, validation, uploads, notifications
    Controllers/     → endpoints
    Support/         → presenters, project rules, stages, codes, site content
    Setup/Seeder.php → schema install, course catalogue, demo data
  config/            → config.example.php (copy to config.php)
  database/          → schema.sql, default-content.json, migrations/ (ALTERs for existing installs)
  bin/               → setup.php, send-notifications.php (cron)
  storage/           → uploads/ and logs/ (must be writable, never public)
  tests/smoke.php    → end-to-end API test
  tests/flows.php    → quotes, walk-ins, handover, reports…
  tests/wallet.php   → drafts, commitment fee, Paystack webhook, refunds
  tests/settings.php → admin settings, secret handling, Paystack keys
  tests/analytics.php → tracker ingest, every analytics endpoint, exports, views, schedules, rollups
```

## Roles & permissions

| Action | Client | Engineer | Lead | Admin | Counsellor |
|---|---|---|---|---|---|
| Convert paid ideas into clients & projects | — | — | — | ✔ | — |
| View project status | Own | Assigned | Assigned | All | — |
| Post updates | — | ✔ (client updates need approval) | ✔ | ✔ | — |
| Approve updates, change stage, milestones, team, regenerate Project ID | — | — | Own projects | ✔ | — |
| See internal notes | — | ✔ | ✔ | ✔ | — |
| Tag tech stack, share files, reply to clients | — | ✔ | ✔ | ✔ | — |
| Ideas inbox (review, status, notes) | — | — | ✔ (submitted ideas only) | ✔ (also drafts) | — |
| Payments: confirm transfers, record centre payments, refunds, walk-in applications | — | — | — | ✔ | — |
| Course leads | — | — | — | ✔ | ✔ |
| Website content, courses, technologies, users, notification log | — | — | — | ✔ | — |

## Run locally (Laragon / XAMPP)

```bash
cd backend
cp config/config.example.php config/config.php
# Edit config.php: env 'local', debug true, db credentials, url http://localhost:3000,
# session.secure false, cors.allowed_origins ['http://localhost:3000'], otp.expose_in_response true, mail/sms driver 'log'

# Create the database first (e.g. in HeidiSQL/phpMyAdmin): apc, utf8mb4_unicode_ci
php bin/setup.php --admin-name="Your Name" --admin-email=you@example.com --admin-password="a-long-password" --demo
php -S 127.0.0.1:8088 public/index.php
```

Run the end-to-end test (uses demo data; resets nothing itself):

```bash
php bin/setup.php --fresh --demo --demo-password="DemoStaff2026!" --admin-email=admin@aptechdevteam.com --admin-password=Aptechdev123
php tests/smoke.php http://127.0.0.1:8088
# flows.php and wallet.php each expect freshly seeded demo data: re-run the setup command before each
php tests/flows.php http://127.0.0.1:8088
php tests/wallet.php http://127.0.0.1:8088
php tests/settings.php http://127.0.0.1:8088
php tests/analytics.php http://127.0.0.1:8088   # seed WITHOUT --demo-analytics: it builds its own traffic
```

For a dashboard full of data locally, add `--demo-analytics` to the setup command: about 90 days of synthetic
traffic (≈10,000 sessions, ≈37,000 events, a month of API request log), then the rollup — around a minute.

The wallet test needs `paystack.fake => true` (no calls to Paystack; checkouts redirect straight to the callback and verify as paid)
and a `paystack.secret_key` (any value locally) so it can sign test webhooks. `paystack.fake` is refused when `app.env` is `production`.

### Upgrading an existing install
Run the migrations in `database/migrations/` that you haven't run yet, in name order, e.g. in phpMyAdmin → *Import*:

| File | Adds |
|---|---|
| `2026_09_analytics.sql` | Analytics: `analytics_events`, `analytics_sessions`, `analytics_visitors`, `analytics_daily`, `project_stage_history` (back-filled from existing stage updates), `api_request_log`, `analytics_saved_views`, `analytics_schedules`, `users.can_view_analytics`, `leads.contacted_at` / `enrolled_at` (back-filled from `updated_at`), `notifications.html_body` / `attachments`. Then add the analytics cron jobs below. |
| `2026_09_settings.sql` | The `settings` table behind Engineering Panel → Settings. After importing it, enter your Paystack keys and bank details there: they are no longer read from `config.php` or the website content document. |
| `2026_09_wallet.sql` | Draft applications (`ideas.status = DRAFT`, nullable form fields, `source`, `last_saved_at`, `submitted_at`), `idea_resume_tokens`, `idea_payments`. Ideas already in the inbox have no commitment fee, so quotes/conversion are blocked for them until a fee is recorded — the file has an optional statement to exempt them. |

## Deploy to Nairahost (cPanel)

1. **PHP version** — cPanel → *Select PHP Version*: choose **8.1 or newer** and enable `pdo_mysql`, `fileinfo`, `mbstring`, `curl`, `openssl`.
2. **Database** — cPanel → *MySQL Databases*: create a database and user, add the user to the database with **All Privileges**.
3. **Upload files**
   - Upload everything in `backend/` **except `public/`** to a folder outside `public_html`, e.g. `/home/CPANELUSER/apc-backend`.
   - Upload the contents of `backend/public/` (`index.php` and `.htaccess`) to `public_html/api/`.
   - `public_html/api/index.php` finds `~/apc-backend` automatically. If you use another folder, set `APC_BACKEND_PATH`.
4. **Config** — copy `apc-backend/config/config.example.php` to `config.php` and fill in: `app.url`, a random `app.key`, database details, `mail.from_email` (an address on your domain), admin/admissions emails, and SMS settings.
5. **Tables and admin account**
   - With Terminal/SSH: `php ~/apc-backend/bin/setup.php --admin-name="…" --admin-email=… --admin-password="…"`
   - Without SSH: import `database/schema.sql` in phpMyAdmin, then add a one-off cron job running the same `setup.php` command, and delete the cron job afterwards.
6. **Permissions** — `apc-backend/storage/uploads` and `apc-backend/storage/logs` must be writable (755 or 750).
7. **HTTPS** — enable AutoSSL/Let's Encrypt in cPanel. Keep `session.secure => true`.
8. **Cron** — cPanel → *Cron Jobs*, every 5 minutes:
   `php /home/CPANELUSER/apc-backend/bin/send-notifications.php >/dev/null 2>&1`
   (retries failed emails/SMS and cleans up expired codes)
   Analytics (times are the server's; set the cPanel cron timezone or adjust so they run at Lagos time):
   ```
   0 1 * * *  php /home/CPANELUSER/apc-backend/bin/analytics-rollup.php  >/dev/null 2>&1   # nightly rollup (re-rolls the last 3 days)
   30 1 * * * php /home/CPANELUSER/apc-backend/bin/analytics-prune.php   >/dev/null 2>&1   # retention
   5 * * * *  php /home/CPANELUSER/apc-backend/bin/analytics-reports.php >/dev/null 2>&1   # scheduled reports (sent at 07:00)
   ```
9. **Check** — open `https://yourdomain.com/api/health` → `{"ok":true,...}`.

### Settings screen (payment credentials)
Everything an admin can change without touching the server lives in **Engineering Panel → Settings** and is stored in the `settings` table:

| Group | Keys |
|---|---|
| `payments` | `commitmentFee` (naira), `currency` (NGN), `paystackEnabled`, `manualEnabled`, `bankName`, `accountName`, `accountNumber` |
| `paystack` | `mode` (test/live), `testPublicKey`, `testSecretKey` 🔒, `livePublicKey`, `liveSecretKey` 🔒 (plus read-only `callbackUrl`, `webhookUrl`, `liveReady`, `fakeMode`) |
| `notifications` | `driver` (log/mail/termii), `fromEmail`, `fromName`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPassword` 🔒, `termiiApiKey` 🔒, `termiiSenderId` |

🔒 = secret: encrypted at rest with AES-256-GCM using a key derived from `app.key` (random IV per value, tag stored with it).
Secrets are write-only: the API only ever returns `{set, last4, updatedAt, updatedBy, source}`, and they are never written to the activity log or an error message.
Without a long `app.key`, saving or reading a secret fails with a clear message instead of storing anything in the clear.

Values resolve as **settings table → `config/config.php` → built-in default**, so an install that hasn't opened the screen keeps working from its old config.
`GET /api/admin/settings` reports where each value comes from in `meta.sources`.

**What stays in `config/config.php`:** database credentials, `app.env`/`app.debug`/`app.url`/`app.frontend_url`, `app.key` (the encryption key — back it up), session and upload settings, CORS origins, `paystack.fake` and `paystack.base_url`/`callback_url`, and the admin/admissions addresses the panel writes to. No API keys or bank details are needed there.

**Notification driver:** `log` stores messages in the outbox only; `mail` also sends email (SMTP when `smtpHost` is set, otherwise PHP `mail()`); `termii` sends email and delivers SMS through Termii.

### Paystack (commitment fee)
1. Paystack dashboard → *Settings → API Keys & Webhooks*: copy the **secret** and **public** keys into Engineering Panel → *Settings → Payments* (test keys first), then use **Test connection**.
2. Set the **Webhook URL** to `https://yourdomain.com/api/payments/paystack/webhook` (the screen shows the exact URL to copy).
3. Set `paystack.callback_url` to `https://yourdomain.com/api/payments/paystack/callback` and keep `paystack.fake => false`. Switching the mode to **live** is refused while `paystack.fake` is on or a live key is missing, so the server can never pretend to charge a card.
4. The fee, methods and bank account are in **Settings → Payments**. The website content document keeps only the wording shown to clients (`payments` section): `feeTitle`, `feeExplainer`, `transferInstructions`, `confirmationTime` (used in emails). Nothing is editable in two places, and the public `/api/content` no longer exposes bank details — the application page reads them from `application.checkout`.

**Every project comes from a paid idea.** There is no endpoint that registers a project directly: walk-ins start an application (`/api/staff/walk-ins`), pay (online, by transfer or at the centre), submit, and are then converted or accept a quote. Converting and quote acceptance both require a submitted idea with a PAID fee.

### Email & SMS
- **Email:** `mail.driver = 'mail'` uses PHP `mail()`, which cPanel supports. Create the `from_email` mailbox on your domain and add SPF/DKIM in cPanel → *Email Deliverability* so messages don't land in spam.
- **SMS:** `sms.driver = 'termii'` sends through [Termii](https://termii.com) (Nigerian gateway). Add your API key and an approved sender ID. With `log`, SMS is only recorded in the notification log.

## API reference

All responses are UTF-8 JSON (`Content-Type: application/json; charset=utf-8`) — decode them as UTF-8, or bullets in masked contacts (`s•••@example.com`) and ₦ amounts turn into mojibake in the client. Errors look like `{"error": "message", "errors": {"field": "message"}}` with status 400/401/403/404/422/429/500.
**Every POST/PUT/PATCH/DELETE must send `X-Requested-With: XMLHttpRequest`.** Sessions use an HttpOnly cookie, so the frontend must send requests with `credentials: 'include'`.

### Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | |
| GET | `/api/content` | Website content document |
| GET | `/api/courses` | Published courses |
| GET | `/api/technologies` | |
| GET | `/api/files/{id}` | Public images (fliers) |
| POST | `/api/ideas` | Legacy one-step form: multipart idea fields (all required), `platforms` as JSON array, optional `attachment` (PDF ≤10 MB) → saves a **DRAFT** `{ref, title, status: "DRAFT", token, paymentRequired: true, application}`. Pay + submit with the endpoints below. |
| GET | `/api/ideas/{ref}` | Status by reference |
| POST | `/api/course-enquiries` | `{courseId, type: info\|enrol, name, contact}` |

### Idea applications & commitment fee (public, private resume token)
`token` is the 64-character resume token. It is returned once when a draft is created and emailed as `/apply?resume=<token>`; only its sha256 hash is stored.

`application` = `{ref, status, source, fields{name, email, phone, organisation, country, state, title, category, platforms[], problem, targetUsers, features, budget, timeline, nda}, attachment{name, size}|null, missingFields[], complete, canSubmit, createdAt, lastSavedAt, submittedAt, payment, wallet[], checkout{fee, feeKobo, currency, feeTitle, feeExplainer, confirmationTime, paystack{enabled, publicKey}, manual{enabled, bankName, accountName, accountNumber, transferInstructions}}}`

`payment` = `{status: UNPAID|PENDING|AWAITING_CONFIRMATION|PAID|FAILED, method: paystack|manual|null, amount, amountKobo, currency, reference, receiptNo, paidAt, createdAt, failureReason, manual{senderName, senderBank, amountClaimed, transferDate, note, proof{name, size, type}}|null, refundAccount{accountName, accountNumber, bankName}|null, refund{status: NONE|PENDING|PROCESSING|REFUNDED, reference, note, queuedAt, at}}`

`wallet` = `[{type: fee|payment|refund, label, amount, currency, status, reference, at, method?, receiptNo?, note?}]`

| Method | Path | Notes |
|---|---|---|
| POST | `/api/applications` | JSON or multipart: `email` (required) + any idea fields, optional `attachment` → 201 `{token, application}`; emails "Continue your application" |
| GET | `/api/applications/draft?token=` | → `application` (also works after submission, to see the wallet) |
| POST | `/api/applications/draft` | `{token, …partial fields, removeAttachment?}` (multipart for `attachment`) → `application`. 409 once submitted |
| POST | `/api/applications/resume-links` | `{email}` → always `{message}`; emails links for every open draft (rate-limited per IP and per email). Staff resend one from the panel instead: `POST /api/staff/ideas/{id}/resume-link` |
| POST | `/api/applications/pay/paystack` | `{token}` → 201 `{reference, authorizationUrl, accessCode, publicKey, email, amount, amountKobo, currency}`. Send the browser to `authorizationUrl` (or use Paystack Inline with `accessCode`) |
| GET | `/api/payments/paystack/callback?reference=` | Paystack returns here; verifies with Paystack, then 302 → `/apply?ref=IDEA-…&payment=success\|pending\|failed&reference=…` (the page uses the token saved in the browser) |
| POST | `/api/payments/paystack/webhook` | Paystack only. Raw body signed with `x-paystack-signature` (HMAC-SHA512 with the secret key). Handles `charge.success`, `refund.processed`, `refund.failed`. Idempotent. No `X-Requested-With` needed |
| POST | `/api/applications/pay/manual` | "I have sent the money", multipart: `token, senderName, senderBank, amount, transferDate, refundAccountName?, refundAccountNumber?, refundBank?, proof?` (PDF/JPG/PNG ≤5 MB) → 201 `application` (payment `AWAITING_CONFIRMATION`) |
| POST | `/api/applications/refund-account` | `{token, accountName, accountNumber (10 digits), bankName}` → `application` (bank transfers only, until the refund is sent) |
| POST | `/api/applications/submit` | `{token}` → `{ref, title, status: "NEW", submittedAt, application}`. 422 if fields are incomplete, 409 unless payment is `PAID` or `AWAITING_CONFIRMATION` |

### Client Portal
| Method | Path | Notes |
|---|---|---|
| POST | `/api/client/auth/request-code` | `{projectCode}` → sends one-time code |
| POST | `/api/client/auth/verify` | `{projectCode, code}` → signs in |
| POST | `/api/client/auth/logout` | |
| GET | `/api/client/me` | Client + their projects |
| GET | `/api/client/projects/{code}` | Client-safe project, including `wallet` (commitment fee ledger of the idea it came from, or null) |
| POST | `/api/client/projects/{code}/messages` | `{text}` |
| POST | `/api/client/projects/{code}/milestones/{id}/approve` | |
| POST | `/api/client/projects/{code}/course-requests` | `{techId, type}` |
| PATCH | `/api/client/projects/{code}/preferences` | `{promosOptOut}` |
| POST | `/api/client/projects/{code}/rating` | `{stars, text?}` (delivered only) |
| GET | `/api/client/projects/{code}/files/{id}` | `?download=1` to force download |

### Staff
| Method | Path | Notes |
|---|---|---|
| POST | `/api/staff/auth/login` | `{email, password}` |
| POST | `/api/staff/auth/logout` | |
| GET | `/api/staff/me` | |
| POST | `/api/staff/me/password` | `{currentPassword, newPassword}` |
| GET | `/api/staff/dashboard` | `{activeProjects, deliveredProjects, pendingApprovals, needsReply, avgDaysSinceClientUpdate, staleProjects[]}`; leads and admins also get `newIdeas`; counsellors and admins `newLeads`; admins also `notifications` (messages still **queued or failed** in the outbox — not every logged message), `paymentsToConfirm`, `refundsPending` |
| GET | `/api/staff/users` | Active staff for assignment |
| GET | `/api/staff/projects` | `?stage=&q=` |
| GET / PATCH | `/api/staff/projects/{code}` | Detail / edit details |
| POST | `/api/staff/projects/{code}/updates` | `{title, body, visibility, demoLink?, screenshot?}` |
| PUT | `/api/staff/projects/{code}/stage` | `{stage, progress?, holdReason?}` |
| POST / DELETE | `/api/staff/projects/{code}/technologies[/{techId}]` | `{techId, usage}` |
| POST | `/api/staff/projects/{code}/milestones` | `{title, dueDate, needsClientApproval?}` |
| PATCH / DELETE | `/api/staff/milestones/{id}` | `{completed?, title?, dueDate?, needsClientApproval?}` |
| POST / DELETE | `/api/staff/projects/{code}/members[/{userId}]` | `{userId}` |
| PUT | `/api/staff/projects/{code}/lead` | Admin: `{userId}` |
| POST | `/api/staff/projects/{code}/files` | multipart `file`, `kind` |
| DELETE | `/api/staff/project-files/{id}` | |
| GET | `/api/staff/files/{id}` | Project files and idea briefs |
| POST | `/api/staff/projects/{code}/regenerate-code` | |
| POST | `/api/staff/projects/{code}/messages` | `{text}` |
| POST | `/api/staff/updates/{id}/approve` | |
| DELETE | `/api/staff/updates/{id}` | |
| GET | `/api/staff/approvals` | Updates waiting for approval, each with `projectCode`, `projectTitle`, `leadName` and `canApprove` (true for admins and for the lead of that project, so the panel can disable the button instead of showing a 403) |
| GET | `/api/staff/messages` | Conversation threads |
| GET | `/api/staff/notifications` | Admin: `?audience=&status=` |
| GET | `/api/staff/ideas` | `?status=&q=&payment=UNPAID\|PENDING\|AWAITING_CONFIRMATION\|PAID\|FAILED`. Drafts are excluded unless an admin sends `status=DRAFT` or `includeDrafts=1` (leads → 403). Each idea includes `source`, `createdAt`, `lastSavedAt`, `paymentStatus`, `payment` (plus `id`, proof `url`, `confirmedBy`, `confirmedAt`, `refundedBy`, `recordedBy`, `channel`) and `wallet` |
| GET / PATCH | `/api/staff/ideas/{id}` | `{status?, notes?}`. `QUOTE_SENT` → 409 unless the fee is PAID; `DECLINED` → 409 while a transfer awaits confirmation, and queues a refund (`PENDING`) when the fee is PAID; reopening cancels that queued refund. Drafts: admin only (leads 404), status can't be changed (409) |
| POST | `/api/staff/ideas/{id}/convert` | Admin: `{leadId, targetDate, startDate?}`. 409 unless the fee is PAID |
| POST | `/api/staff/ideas/{id}/quote` | Lead/admin: multipart quote. 409 unless the fee is PAID (accepting a quote online is blocked too if it isn't) |
| POST | `/api/staff/walk-ins` | Admin: `{name, email, phone?, …any idea fields}` → 201 `{idea, sentTo}`; creates a DRAFT (`source: walk_in`) and emails/SMSes the client a link to finish and pay. Walk-in flow: this → `payments/centre` (or the client pays online/by transfer) → client completes and submits from the link → `convert` |
| POST | `/api/staff/ideas/{id}/resume-link` | Admin: issues a fresh resume token for a DRAFT idea and emails/SMSes the client the link → `{sentTo, idea}` (plus `devLink` outside production). 409 once the application is submitted. Rate-limited per application (5/hour), not per IP, so a whole office can use it |
| POST | `/api/staff/ideas/{id}/payments/centre` | Admin: fee paid at the centre `{amount?, senderName?, note?, refundAccountName?, refundAccountNumber?, refundBank?}` → 201 payment (PAID immediately, receipt emailed) |
| GET | `/api/staff/payments` | Admin: `?status=&method=paystack\|manual&refund=open\|NONE\|PENDING\|PROCESSING\|REFUNDED&q=` → `{items: [payment + idea{id, ref, title, name, email, phone, status, source}], counts{awaitingConfirmation, refundsPending, refundsProcessing, paid, collected}}` |
| POST | `/api/staff/payments/{id}/confirm` | Admin: confirm a bank transfer `{note?}` → PAID + receipt email (refund queued automatically if the idea was declined meanwhile) |
| POST | `/api/staff/payments/{id}/reject` | Admin: transfer not received `{reason}` → FAILED; client emailed a link to try again |
| POST | `/api/staff/payments/{id}/refund` | Admin: send a queued refund. Paystack: calls Paystack `POST /refund` → `PROCESSING` (→ `REFUNDED` by webhook). Manual: `{reference, note?}` → `REFUNDED` |
| POST | `/api/staff/payments/{id}/refund/complete` | Admin: mark a `PENDING`/`PROCESSING` refund as done `{reference? (required for manual), note?}` |
| GET | `/api/staff/leads` | `?status=` |
| PATCH | `/api/staff/leads/{id}` | `{status?, notes?}` |

### Admin
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/settings` | `{payments{…}, paystack{…}, notifications{…}, meta{sources, updatedAt, encryptionReady, warnings[]}}`. Secrets appear as `{set, last4, updatedAt, updatedBy, source}` |
| PUT | `/api/admin/settings` | Partial: `{payments?{}, paystack?{}, notifications?{}}` → the same document. An omitted or `""` secret keeps the stored value, `null` clears it. 422 for a bad Paystack key (`^(sk\|pk)_(test\|live)_[A-Za-z0-9]+$`, prefix must match the field), an account number that isn't 10 digits, a fee outside 100–1,000,000, both methods off, live mode without live keys, an unknown driver, or `termii` without an API key |
| POST | `/api/admin/settings/paystack/test` | Calls Paystack with the stored key for the current mode → `{ok, message, mode, business}` (rate-limited; in fake mode it reports that no call was made) |
| PUT | `/api/admin/content` | Full content document |
| POST | `/api/admin/content/reset` | |
| POST | `/api/admin/images` | multipart `file` → `{id, url}` |
| GET / POST | `/api/admin/courses` | |
| PATCH / DELETE | `/api/admin/courses/{id}` | `flierId` = image id from `/api/admin/images` |
| POST | `/api/admin/technologies` | |
| PATCH / DELETE | `/api/admin/technologies/{id}` | |
| GET / POST | `/api/admin/users` | GET adds `projectCount` to each user: active (non-`DELIVERED`) projects they lead or are on the team of |
| PATCH | `/api/admin/users/{id}` | `{name?, phone?, role?, jobTitle?, status?, password?}` |

## Analytics

Read-only dashboard API at `/api/analytics/*` plus the website tracker at `POST /api/track`, implementing
`docs/analytics/ANALYTICS_DASHBOARD_SPEC.md` sections 6–10. Where the spec could not be followed literally, the
differences are listed at the end of this section.

### Access
- Same session cookie as the Engineering Panel (`POST /api/staff/auth/login`). Signed out → `401`.
- Admins always have access; anyone else needs **Can view analytics** (`canViewAnalytics` on `POST /api/admin/users` and
  `PATCH /api/admin/users/{id}`, returned on login, `/api/staff/me` and `/api/admin/users`; changes are in the activity log).
  No access → `403`.
- **Revenue** and **Team** are admin-only (`403` for everyone else, also for their exports, saved views and schedules).
- On shared screens, money is shown to admins only: the Overview "Net fee revenue" and "Contract value won" tiles and the
  Courses "Estimated course revenue" tile come back with `value: null` and `restricted: true` for non-admins, and
  Overview attention rows carry `amount: null`.

### Endpoints
Common query parameters (spec 9.1): `from`, `to` (`YYYY-MM-DD`, Africa/Lagos, inclusive; default last 30 days; max 2
years), `compare` (`previous` default, `year`, `none`), `interval` (`auto` default: hour ≤ 2 days, day ≤ 90, week ≤ 366,
month beyond; `hour` only up to 7 days), `includeInternal=1` (include staff traffic), and the filters each screen lists
in `meta.filters` (others are ignored). Bad values → `422`.

Every screen returns the spec 9.3 envelope:
`{range{from,to,timezone,interval}, compare{from,to}|null, generatedAt, meta{trackingSince, filters, appliedFilters, includeInternal, definitions}, data}`.
Responses carry `Cache-Control: private, max-age=60` (realtime: `no-store`).

| Method & path | Filters | `data` |
|---|---|---|
| GET `/api/analytics/me` | — | Not enveloped: `{user{id,name,role}, canViewAnalytics, sections[], timezone, currency, trackingSince}` |
| GET `/api/analytics/overview` | — | `kpis[6]` (visitors, ideasSubmitted, netFeeRevenue, contractValueWon, activeProjects, onTimeRate), `trend.visitors`, `trend.ideas`, `funnel[6]`, `attention{overdue[],transfers[],refunds[],stale[]}`, `topSources[5]` |
| GET `/api/analytics/traffic` | source, medium, campaign, device, country, state | `kpis[6]`, `newVsReturning{new,returning}`, `heatmap[7][24]` (Mon–Sun × 0–23, sessions started) |
| GET `/api/analytics/traffic/timeseries?metric=visitors\|sessions\|pageviews\|bounce_rate\|duration` | as traffic | `series{key, points[{t,value,previous}]}` |
| GET `/api/analytics/traffic/breakdown?dimension=source\|medium\|campaign\|referrer\|landing_page\|page\|device\|browser\|os\|country\|state&limit=50` | as traffic | `dimension`, `rows[{key,label,value(visitors),share,change,extra{sessions,pageviews,bounceRate,conversion}}]` (`page`: `extra{pageviews}`), `total` (distinct visitors) |
| GET `/api/analytics/engagement` | as traffic | `kpis[5]`, `interactions[{event,target,path,count,visitors,ctr}]`, `trackerSearches{byKind,byResult,notFoundRate}`, `scrollDepth{25,50,75,100}`, `downloads[{kind,count}]` |
| GET `/api/analytics/funnels/{application\|sales\|portal\|courses}?by=source\|device\|category` | traffic filters + category | `steps[{key,label,count,fromPrevious,fromStart,medianSecondsFromPrevious}]`, `overall`, `breakdown[{key,label,steps[]}]`, `funnel`, `by`, `notes[]` |
| GET `/api/analytics/revenue` 🔒 `&page=` | method (`paystack\|manual\|centre`), category | `cash{kpis[]}`, `booked{kpis[]}`, `series.netFees`, `byMethod[]`, `refunds{count,amount,medianDaysToRefund}`, `quotes{series[quoted,accepted],acceptanceRate}`, `ledger[]`, `page`, `pages`, `ledgerTotal` |
| GET `/api/analytics/projects` | category | `kpis[6]`, `byStage[]`, `timeInStage[{key,label,medianDays,samples}]`, `deliveryVsTarget[{code,title,daysEarlyOrLate}]`, `updateFrequency[]`, `table[]` |
| GET `/api/analytics/pipeline` | category, state (the idea's state) | `kpis[6]`, `series.submitted{online,walkIn}`, `by{category,platform,budget,state}`, `ageing[4]`, `table[]` |
| GET `/api/analytics/clients` | — | `kpis[6]`, `series.signIns`, `engagement{approvals,changeRequests,uploads,courseRequests,ratings}`, `optOuts{digest,promos}`, `byLocation[]` |
| GET `/api/analytics/courses` | — | `kpis[6]`, `byCourse[]`, `bySource[]`, `counsellors[]` |
| GET `/api/analytics/team` 🔒 | — | `caption`, `kpis[5]`, `people[]`, `workload[]` |
| GET `/api/analytics/operations` | — | `messaging{series[],byChannel,failureRate,topErrors[]}`, `payments{attempts,successRate,abandoned,medianConfirmHours}`, `security{staffSignIns,failedSignIns,passwordResets,codesRequested,codesVerified,rateLimited}`, `api{errors[{t,serverErrors,clientErrors}],slowest[{route,method,p95Ms,medianMs,requests}]}` |
| GET `/api/analytics/realtime` | — | `activeVisitors`, `perMinute[30]`, `topPages[]`, `topSources[]`, `devices[]`, `feed[50]{at,event,path,source,device}` |
| GET `/api/analytics/export?view=&table=&format=csv\|xlsx` | the screen's | A file. `table` = a key named in the 422 message (e.g. `kpis`, `breakdown`, `interactions`, `ledger`, `cash.kpis`); CSV exports one table (default: the first), XLSX every table plus "Read me". Funnels take `funnel=`, traffic `dimension=`. |
| GET / POST `/api/analytics/views`, PATCH / DELETE `/api/analytics/views/{id}` | — | `{id,name,view,query{},url,shared,mine,owner,createdAt,updatedAt}`. POST/PATCH `{name, query: "view=traffic&from=…" or {…}, shared?}` — sharing is admin-only |
| GET / POST `/api/analytics/schedules`, PATCH / DELETE `/api/analytics/schedules/{id}` | — | `{id,name,view,query{},range,frequency,recipients[],format,active,lastSentAt,nextRunAt,nextRange{from,to},owner,mine,url}`. POST `{name, view, recipients[emails], frequency?: weekly, format?: pdf, range?: last_7_days\|yesterday\|last_30_days\|last_month\|this_month, query?, active?}` |

Building blocks (spec 9.4): KPIs `{key,label,value,previous,change,format(number|currency|percent|duration),goodDirection(up|down|none),kind}`,
money `kind` = `cash | booked | estimate | liability | pending`; percentages are ratios (0.243), durations are seconds,
money is naira. Some KPIs add fields (`count`, `restricted`, `recurring`, `asOf`, `unanswered`).

### Tracker contract — `POST /api/track`
```json
{ "visitorId": "uuid-v4", "sessionId": "uuid-v4",
  "referrer": "https://www.google.com/", "utm": {"source": "", "medium": "", "campaign": "", "term": "", "content": ""},
  "screen": {"w": 1440, "h": 900},
  "events": [{"event": "page_view", "name": null, "path": "/apply", "title": "Apply", "props": {}, "at": "2026-09-18T10:42:07.123Z"}] }
```
- Send with `Content-Type: text/plain;charset=UTF-8` (a CORS "simple" request, works with `sendBeacon` and
  `fetch(…, {keepalive: true, credentials: "include"})`); `application/json` is accepted too. No `X-Requested-With`.
- **CSRF defence:** the `Origin` (or `Referer`) must be the site itself, `app.url`/`app.frontend_url`, or a
  `cors.allowed_origins` entry, else `403`. Allowed origins get `Access-Control-Allow-Origin` + `-Credentials`.
- Responses: `204` (also when events are dropped for Do Not Track / Global Privacy Control or a bot user agent, so the
  filter can't be probed); `400` bad JSON; `413` over 32 KB; `422` bad ids or more than 20 events; `429` over 120 events
  per minute per IP.
- Events and props are whitelisted exactly; unknown prop keys are dropped, an invalid value or unknown event drops that event:

  | event | `name` stored | props |
  |---|---|---|
  | `page_view` | null | — (the top-level `title` is kept) |
  | `cta_click` | the CTA id | `id` (`^[a-z0-9_]{1,60}$`) |
  | `tracker_search` | null | `kind` project\|idea, `result` found\|not_found\|rate_limited\|error |
  | `portal_signin` | step | `step` code_requested\|verified\|failed |
  | `idea_form` | step | `step` opened\|about_you\|idea\|budget\|payment\|draft_saved\|resume_link_requested\|submitted, `variant` modal\|page |
  | `payment` | step | `step` started\|returned_success\|returned_failed\|transfer_reported, `method` paystack\|manual |
  | `course_view`, `course_click` | courseId | `courseId` |
  | `quote` | step | `step` viewed\|accepted\|declined |
  | `download` | null | `kind` report\|proposal\|file |
  | `outbound_click` | null | `host` |
  | `scroll_depth` | null | `depth` 25\|50\|75\|100 |
  | `client_error` | null | `code` |
- Paths keep only `utm_*`, `view`, `funnel` and `payment`; every other query parameter (resume, token, reset, reference,
  ref, code, email, …) is stripped server-side. Only the referrer's host is stored.
- `at` is clamped to server time ± 10 minutes. Device, browser and OS come from the User-Agent (simple regexes).
  Country comes from Cloudflare's `CF-IPCountry` header when present; **state is always null** — shared hosting has no
  GeoIP database and we don't send IPs to third parties. **IP addresses are never stored** in analytics tables; the IP is only the key
  of the existing rate limiter (`rate_limits`, rows older than a day are deleted).
- Requests carrying a staff session are stored with `internal = 1` (excluded unless `includeInternal=1`).
- Sessions: the server keeps its own session rows (`analytics_sessions`) and splits a session after 30 idle minutes or at
  Lagos midnight even if the browser keeps sending the same `sessionId` (the new part gets a derived id).
- Source rules (spec 7.5): UTM source → else referrer grouped as search (google, bing, duckduckgo, yahoo, yandex),
  social (facebook, instagram, x/twitter, linkedin, tiktok, whatsapp, youtube), email (Gmail, Outlook) or the referring
  domain as `referral` → else `direct`.

### How numbers are computed (query strategy)
- **Session-level metrics** (visitors, new vs returning, sessions, page views, duration, bounce, sources, devices,
  countries, landing pages, heatmap) come from `analytics_sessions`, an incrementally maintained one-row-per-session
  aggregate. It gives exact distinct-visitor counts for any range and any filter combination, which daily rollups can't
  (distinct counts don't add up across days).
- **Event-level counts** (CTA clicks, interactions, tracker searches, scroll depth, downloads, page views per path) are
  **stitched**: days before yesterday come from `analytics_daily`, yesterday and today from raw events, using one shared
  function for both so they always agree (`tests/analytics.php` checks it). A request with a traffic filter reads raw
  events for the whole range. Unique-visitor figures read raw events.
- Business numbers (ideas, payments, quotes, projects, clients, leads, messages, notifications) are read from their
  tables — the source of truth. Staff sign-ins, failed sign-ins, rate-limit hits, API errors and latency come from
  `api_request_log` (route pattern, status, milliseconds; never the raw path; skips `/api/track` and `/api/health`).
- Stage changes are written to `project_stage_history` (new registrations, stage changes, handover sign-off); existing
  projects were back-filled from their stage updates.
- Per-request analytics writes (request log, stage history) never fail a request: errors are caught and logged.

### Jobs, retention and privacy
| Job | When | Does |
|---|---|---|
| `bin/analytics-rollup.php [--from= --to=]` | nightly 01:00 | Recomputes the last 3 days' sessions and rolls those days into `analytics_daily` (idempotent) |
| `bin/analytics-prune.php` | nightly | Raw events > 13 months, sessions/visitors > 25 months (so exact visitor counts cover the 2-year maximum range), request log > 30 days, report attachments > 30 days. Rollups are kept. |
| `bin/analytics-reports.php [--id=N --force]` | hourly | Sends due schedules at 07:00 Lagos (daily; Mondays; the 1st). CSV/Excel reports are attached; **PDF** reports are sent as an HTML summary of the screen's KPIs with a link to the screen (the PDF itself is produced in the browser, spec 10.1). Recipients are re-checked at send time. `--force` is a test send. |

Exports: CSV is UTF-8 with BOM, a unit row under the header and a closing "Confidential" line with range, filters and
generation time. **Excel is real `.xlsx` (built with PHP's `ZipArchive`, which this server has)**; if the `zip`
extension is missing the export falls back to SpreadsheetML 2003 (`.xls`), and the response header `X-Export-Format`
says which. Every Excel file has a "Read me" sheet with the range, filters, generation time and definitions. Exports,
analytics sign-ins and saved-view/schedule changes are recorded in the activity log.

### Differences from the spec (and why)
1. **Rollups hold event-level counts only**; distinct visitors come from `analytics_sessions` (exact) instead of summing
   daily uniques, which would over-count. Filtered event queries read raw events.
2. **Overview has no filters** (it mixes traffic and business numbers; a traffic filter can't apply to ideas or money).
   Money on shared screens is admin-only (`restricted: true`), matching the Revenue screen's admin-only rule.
3. **Funnels:** the application and portal funnels are counted in visitors from tracking (the database can't be linked to
   a visitor); `by=category` isn't available for them (empty breakdown + `notes`). The sales funnel's "Reviewed" step
   has no timestamp, so its median is null and "Quote sent" timing is measured from submission; ideas marked "quote
   sent" in the inbox without a quote record count but are left out of medians. The courses funnel counts visitors for
   viewed/clicked and course leads for enquiry/contacted/enrolled (two unlinked parts). Each funnel is sequential.
4. **Enrolled / time to first contact** use new `leads.contacted_at` and `enrolled_at` columns (set when a counsellor
   changes the status, back-filled from `updated_at`); the spec's `activity_log` source had no lead status entries.
   Lead status changes are now also written to the activity log.
5. **Quote acceptance rate** is for quotes sent in the range (a cohort); expired = still open past `valid_until`.
6. **Paths:** query parameters are whitelisted (`utm_*`, view, funnel, payment) rather than stripping the 7 named ones.
   CTA ids are validated by pattern rather than a fixed list, so a new `data-track` id works without a back-end change.
7. **State** is always null (no honest cheap source on shared hosting); country only via `CF-IPCountry`.
8. **Security numbers** (staff sign-ins, failed sign-ins, rate-limit hits) come from the request log, so they cover
   30 days; password resets count reset links requested.
9. **Overview attention rows** carry ids (`code`, `reference`, `ideaRef`) and `link: "/engineering"` — the Engineering
   Panel has no deep links yet.
10. **Additive schema/fields:** `analytics_sessions.client_session_id`, `updated_at` on saved views and schedules,
    `notifications.html_body` / `attachments`, `leads.contacted_at` / `enrolled_at`; extra response fields listed above.
    Nothing in the spec's shapes was removed or renamed.

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
```

The wallet test needs `paystack.fake => true` (no calls to Paystack; checkouts redirect straight to the callback and verify as paid)
and a `paystack.secret_key` (any value locally) so it can sign test webhooks. `paystack.fake` is refused when `app.env` is `production`.

### Upgrading an existing install
Run the migrations in `database/migrations/` that you haven't run yet, in name order, e.g. in phpMyAdmin → *Import*:

| File | Adds |
|---|---|
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

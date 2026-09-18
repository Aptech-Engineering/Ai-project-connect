# AI Project Connect

Clients watch their project being built, then learn the stack behind it. An Aptech initiative.

The website and Client Portal, the Engineering Panel and the PHP API all live in this repo:

```
/                     Next.js app (public site, Client Portal, /engineering panel)
/backend              PHP 8.1+ / MySQL API — see backend/README.md
```

The frontend is exported as **static files** and the API answers on the same domain under `/api`,
so the whole thing runs on ordinary shared hosting such as Nairahost.

```
yourdomain.com/          → Next.js static export (public_html)
yourdomain.com/api/...   → the PHP API (public_html/api → ~/apc-backend)
```

## What's inside

| Area | Highlights |
|---|---|
| Public site | Editable content, courses with prices and fliers, course enquiries, idea applications |
| Applications | Save-and-resume drafts, a ₦2,000 commitment fee by Paystack or bank transfer, receipts and refunds |
| Client Portal | Project ID + one-time code sign-in, stage and progress, updates, files, messages, milestone approvals, change requests, handover sign-off, the project wallet, "learn this stack" |
| Engineering Panel | Projects, updates and approvals, ideas inbox, quotes, payments, course leads, reports, activity log, website content, users and roles, Settings |
| Settings | Paystack keys and mode, the fee and bank account, email/SMS providers — secrets encrypted in the database |

## Run it locally

You need Node 20+, PHP 8.1+ and MySQL.

```bash
# 1. the API (see backend/README.md for the full setup)
cd backend
cp config/config.example.php config/config.php     # database details, app.key, cors origin http://127.0.0.1:3000
php bin/setup.php --demo --admin-name="Your Name" --admin-email=you@example.com --admin-password="a-long-password"
php -S 127.0.0.1:8088 public/index.php

# 2. the frontend, in another terminal
cd ..
cp .env.example .env.local                          # NEXT_PUBLIC_API_BASE=http://127.0.0.1:8088/api
npm install
npm run dev                                         # then open http://127.0.0.1:3000
```

The Engineering Panel is at `/engineering`. With `--demo` the API seeds example projects, ideas and staff.

**Use the same hostname for both servers** — `127.0.0.1:3000` with the API on `127.0.0.1:8088`, or
`localhost` for both. Session cookies are `SameSite=Lax`, so a page on `localhost` will not send its
cookie to an API on `127.0.0.1`: you would be signed out on every request. In production they share a
domain, so this only bites locally.

## Deploy

```bash
rm -f .env.local       # production must NOT point at a local API
npm run build          # writes ./out — with no NEXT_PUBLIC_API_BASE the app calls /api on its own domain
```

1. Upload the contents of `out/` to `public_html` (including the `.htaccess` it contains — it serves
   `/apply`, `/quote` and `/engineering`, leaves `/api` to the back-end, and stops pages being cached
   into a stale version after a deploy).
2. Follow **backend/README.md → Deploy to Nairahost** for the API, database and cron jobs.
3. Sign in to `/engineering` as the admin and open **Settings** to enter the Paystack keys, the bank
   account for transfers and the email/SMS details. Nothing sensitive goes in a file on the server.

## How the frontend talks to the API

- `lib/api.ts` — one fetch wrapper. Sessions are HttpOnly cookies, so every request goes out with
  `credentials: "include"` and the `X-Requested-With` header the server's CSRF check expects.
- `lib/remote.ts` — a small cache: one request per key, shared across screens, and `invalidate()`
  after a change so everything showing that data refreshes itself.
- `lib/store.ts`, `actions.ts`, `flows.ts`, `ideas.ts`, `wallet.ts`, `settings.ts`, `staff.ts`,
  `content.ts`, `catalog.ts` — the data layer. Components never call `fetch` directly.
- Nothing is kept in the browser except the private "continue your application" token, so two people
  looking at the same project always see the same thing.

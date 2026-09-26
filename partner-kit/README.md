# Partner landing pages

A ready-made landing page for organisations we run the scholarship with. It carries
**their** brand next to APTECH and AI Project Connect, explains the programme in the
shape their own documents use, and its Register button sends people to
`aiprojectconnect.com.ng/scholarship` to apply and pay.

The partner hosts it on their own domain, e.g. `ghessa.com.ng/aiprojectconnectscholarship`.

## Making a page for a new partner

1. Put their logo in `assets/` (png, jpg, webp or svg — a transparent png looks best).
2. Copy `partners/_template.json` to `partners/<partner>.json` and fill it in:
   name, colour, website, the objectives, the course tracks, the pathway, eligibility,
   and the paragraph about who they are.
3. Build it:

   ```
   node make-partner-page.mjs partners/<partner>.json
   ```

That writes `out/<partner>/index.html` — **one file**, with the logos embedded. Nothing
else is uploaded, so it works on any host.

## What the partner does with it

Send them `index.html` and one line of instruction. Whatever their site runs on:

| Their setup | What they do |
|---|---|
| cPanel / DirectAdmin / plain hosting | Create a folder `aiprojectconnectscholarship` in `public_html` and put `index.html` in it. |
| WordPress | Upload the file to the site root in a folder of that name (File Manager or FTP). It sits outside WordPress and keeps working. |
| Next.js / React site | Drop it in `public/aiprojectconnectscholarship/index.html`. |
| Vercel / Netlify | Same — put it in the public/static folder and redeploy. |

The page is then at `theirdomain.com/aiprojectconnectscholarship`.

## What updates by itself

The page reads the live programme from `https://aiprojectconnect.com.ng/api/scholarship`
each time it loads, so the **fee, deadline and seats left** always match what our admin
set — nobody has to re-send the file. If that request fails, the page keeps the wording
it was built with, so it never shows an empty space. When applications close, the
Register buttons change to the closed message automatically.

This needs the API to allow public reads, which `backend/public/index.php` does for
`GET /api/scholarship` only. Nothing else is exposed, and no cookies are involved.

## Tracking who sends us applicants

Every partner's Register link carries `?utm_source=<slug>&utm_medium=partner&utm_campaign=scholarship`.
In **Analytics → Traffic → by source** you can see how many people each partner sent, and in
**Funnels** how many of them paid.

## Files

```
partner-kit/
  partner-landing-template.html   the page itself, with {{PLACEHOLDERS}}
  make-partner-page.mjs           fills it in and embeds the logos
  partners/_template.json         copy this for a new partner
  partners/ghessa.json            GHESSA, from their own programme document
  assets/aptech-logo.png          APTECH logo used on every page
  out/<partner>/index.html        what you send the partner
```

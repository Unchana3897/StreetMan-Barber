# Deployment

The live site runs on Cloudflare: `worker.js` serves the API and the pages
built into `dist/`, with bookings and staff accounts in the D1 database
`streetman-barber-db`. Cloudflare Workers Builds deploys automatically when
`main` changes on GitHub (build command `npm run build`, deploy command
`npx wrangler deploy`). Do not change the assets directory to `.`.

`npm run build` copies the public files into `dist/` and generates the
English pages under `dist/en/` from the Thai pages and the EN strings in
`js/i18n.js` (see `scripts/i18n-pages.js`). Edit only the Thai HTML and
`js/i18n.js`; never edit `dist/`.

## Local testing

```bash
npm install
npm run db:migrate:local   # create/upgrade the local D1 copy
npm run db:seed:local      # local-only test accounts, see scripts/dev-seed.sql
npm run db:demo:local      # optional: a month of fake queues for every barber
npm run db:demo:clear      # remove the fake queues again
npm run dev                # http://localhost:8787 (npm start does the same)
```

Notifications in local dev need `.dev.vars` (git-ignored) with
`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; `npm run push:keys` makes a pair.

`npm run start:legacy` still runs the older Express/SQLite server in `server/`.
It is out of date (no POS payments, bill edits, notifications or English
pages); use `npm run dev`.

Services and prices are edited by the owner on "จัดการช่าง" (stored in the D1
table `services`, migration `0006_services.sql`). The booking, price, service
and home pages, the POS and the barber queue all read them from `/api/services`;
the menu written in the HTML is only a fallback. Each bill keeps the prices it
was charged at (`bookings.prices`), so changing a price never changes past
bills or income. The SEO price data (JSON-LD) in the page headers is still
static: update it by hand when prices change for good.

## Database changes

Schema changes live in `migrations/`. Apply them to production **before**
pushing code that needs them:

```bash
npx wrangler d1 migrations apply streetman-barber-db --remote
```

`0001_initial.sql` only creates what is missing, so it is safe on the existing
database. Never run `scripts/dev-seed.sql` with `--remote`.

## Staff accounts

- A system admin (role `admin`, "ผู้ดูแลระบบ") has the owner's rights but is not a
  barber, so customers can't book them. Create one with
  `node scripts/create-admin.js <username> "<name>" "<temporary password>" > .wrangler/admin.sql`
  then `npx wrangler d1 execute streetman-barber-db --remote --file .wrangler/admin.sql`
  and delete the file. The first login must set a new password.

- Barbers sign up from the login page and wait for Rim to approve them on
  the "จัดการช่าง" page. Rim still creates POS (cashier) accounts directly.
- Anyone can change their password from the login page. A password Rim sets
  for someone else is temporary: they must choose a new one at next login.
- `0002_staff_auth.sql` marks every account still on the old published
  password as "must change" and signs those accounts out everywhere.
- Logins are limited to 5 failures per username and 20 per IP in 15 minutes.

## Payments at the POS

- The owner sets the shop's PromptPay number on "จัดการช่าง". The POS then
  prints a bill whose QR carries the amount; "ได้รับเงินแล้ว" appears only after
  the bill has been printed. Receipts for paid bills carry a QR without an amount.
- A barber's "ตัดเสร็จ · ส่งคิดเงิน" sends the queue to the POS with a "คิดเงิน"
  badge. A queue counts as paid only once the POS takes the money.
- Fixing a paid bill needs a one-time 6-digit reference code from the owner
  ("สร้างรหัสอ้างอิง" on "จัดการช่าง", valid 15 minutes). Every edit is logged in
  `bill_edits` and listed on the same page.
- If the owner can't be reached, the POS can save the fix without a code but
  with a reason (at most 3 per day). It shows as "รอตรวจ" until the owner
  approves it, or rejects it, which puts the bill back as it was.
- These need `0003_bill_edits.sql` and `0004_bill_edit_review.sql` applied to
  production before the code is pushed.
- A bill already paid can't be paid again (a second POS gets "already paid").
  The POS also lists finished-but-unpaid queues from the last 30 days, and can
  show any past day's paid bills for fixing.
- The income page splits money actually taken (cash / transfer) from work that
  is finished but not yet charged. The Excel export now runs on the Worker.

## Notifications (Web Push)

Barbers get new bookings and cancellations, the POS gets "ตัดเสร็จ รอคิดเงิน",
and the owner gets bills waiting for review and new barber signups. Each phone
turns it on with "เปิดแจ้งเตือน" (iPhone: iOS 16.4+, add to Home Screen first
and open from the icon). The button then sends a test notification.

One-time setup before pushing this code:

```bash
npx wrangler d1 migrations apply streetman-barber-db --remote   # adds 0005
npm run push:keys                                               # prints a key pair
npx wrangler secret put VAPID_PUBLIC_KEY                        # paste the public key
npx wrangler secret put VAPID_PRIVATE_KEY                       # paste the private key
```

Keep those keys. Replacing them silently turns notifications off on every
phone until each one presses "เปิดแจ้งเตือน" again. Without the secrets the site
works normally, just without notifications.

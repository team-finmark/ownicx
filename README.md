# Ownicx for salons

End-to-end loyalty program suite for salons, powered by **Osiq Solutions**.
Built with Next.js (App Router) and TypeScript only, with no UI library, and Supabase as the database.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

With no environment variables it runs on a **built-in demo database** (48 members, a year of visits, live offers). Every screen and control works, and changes last until the server restarts.

## Manager sign-in

Every dashboard page needs a manager sign-in (name + password).

- **Demo mode:** sign in as `manager` / `ownicx123` (shown on the login page only while Supabase isn't connected).
- **With Supabase:** set `SESSION_SECRET` (32+ random characters) in `.env`, then create each manager:

  ```bash
  npm run manager -- "Priya" "StrongPass1"
  ```

  Running it again for an existing name resets that password. Managers can change their own password from **My account** (top bar).

Passwords are stored as scrypt hashes in the `managers` table. Sessions are signed, http-only cookies that expire after 12 hours. Five wrong attempts lock that name for 15 minutes. The REST API, cron and WhatsApp webhook keep their own keys and are not behind the sign-in.

## Connect Supabase

1. Create a Supabase project.
2. In the SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql` (tiers, services, rewards, automation rules, settings).
3. Copy `.env.example` to `.env` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only, never sent to the browser)
   - `CRON_SECRET`, `OWNICX_API_KEY`, `SESSION_SECRET`
4. Create your first manager: `npm run manager -- "Your name" "YourPassword1"`
5. Restart. The demo banner disappears.

Row-level security is enabled on every table with no public policies, so the anon key can't read member data. The dashboard reads and writes only from the server.

## The WhatsApp automation (₹0 by default)

Rules live in **Automations** and are fully editable: trigger, numbers, send hour, audience, and message text with live preview.

| Rule | Example from the brief |
|---|---|
| Revisit reminder | Sam's last haircut was 60 days ago → "time for a fresh look?" (follow-ups every 30 days, max 2) |
| Points milestone | Haircut = 5 pts. At 150 pts → ₹150 off any service, 14-day expiry, points deducted |
| Expiry urgency | Countdown nudges 7 / 3 / 1 days before the offer expires |
| Win-back | 120 days with no visit → bonus points + invite |
| Birthday | ₹200 treat on the day (off by default) |

**It only triggers when a condition is true.** Every trigger has a unique dedupe key, so a guest never gets the same message twice, even if the runner is called repeatedly. Only members who opted in to WhatsApp are messaged. Milestone offers fire *instantly* when a visit is recorded; everything else runs on the schedule.

**Connecting WhatsApp** is done by the manager in the dashboard: **Settings → WhatsApp** (no `.env` edits).

1. **Your number:** save the salon's WhatsApp number, open the chat to check it, and confirm.
2. **How messages are sent:**
   - **Tap-to-send** (free, default): messages go to the **Outbox** with a `wa.me` link. The front desk taps *Send on WhatsApp* and WhatsApp opens with the text ready. No API, no per-message fee.
   - **Automatic**: sends by itself through Meta's WhatsApp Cloud API. Replies within 24 hours of a guest's message are free. Business-initiated reminders need a **Meta-approved template** and are charged per message by Meta.
3. **Connect for automatic sending:** either **Continue with Facebook** (Meta Embedded Signup: the manager signs in and picks their WhatsApp Business number) or **manual** (Phone Number ID + permanent token + app secret from their own Meta app). Either way the app asks Meta for the number behind the credentials and only connects when it matches step 1. Tokens are encrypted (AES-256-GCM, key derived from `SESSION_SECRET`) before they are stored in Supabase. Changing `SESSION_SECRET` means reconnecting.

The page also shows the webhook callback URL and verify token to paste into Meta, a **Send test** button (Meta's `hello_world` template), **Check connection** and **Disconnect**.

*Continue with Facebook* appears only when the platform owner sets `META_APP_ID`, `META_APP_SECRET` and `META_CONFIG_ID` (Osiq Solutions' Meta app, which must be approved by Meta as a Tech Provider). These are set once for the platform, not per salon.

Unofficial "WhatsApp Web" automation libraries are free but break WhatsApp's terms and get numbers banned, so they aren't used here.

**Schedule (free):** call `GET /api/automations/run` hourly with `Authorization: Bearer $CRON_SECRET`. Each rule fires only in its own send hour. With Supabase, enable `pg_cron` + `pg_net` and use the commented block at the end of `supabase/schema.sql`. The **Run now** button in the dashboard evaluates every rule immediately.

## REST API (POS, CRM, eCommerce, CDP)

All endpoints take the header `x-api-key: $OWNICX_API_KEY`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/customers?phone=91…` | Member lookup: points, tier, live coupons |
| POST | `/api/v1/customers` | Enrol (KYC + referral) |
| POST | `/api/v1/visits` | `{ phone \| customer_id, service_id, amount? }` → awards points, upgrades tier, fires milestone offers |
| POST | `/api/v1/coupons/redeem` | `{ code }` |
| GET | `/api/automations/run` | Cron entrypoint (`?force=1` ignores send hours) |
| GET/POST | `/api/whatsapp/webhook` | Cloud API webhook: `JOIN [code]`, `POINTS`, `STOP` |

## What's in the dashboard

- **Overview**: member revenue, active members, repeat rate, loyalty cost vs budget, churn signals, tier mix
- **Members / Onboarding & KYC**: record visits, redeem rewards, WhatsApp QR sign-up, automated phone/PAN checks, review queue
- **Engagements**: audience-specific campaigns queued through the Outbox
- **Automations / Outbox**: the WhatsApp AI rules above
- **Rewards & coupons**: catalogue, tier-locked rewards, bulk code generation, counter redemption
- **Tiers & ranks**: thresholds, multipliers, perks (re-ranks members on save)
- **Referrals**: two-level mechanics and milestone badges · **Leaderboard**: points, visits, referrals
- **Program design**: behavioural loops mapped to KPIs, margin and budget guardrails, managed-service view, QBR agenda
- **P&L and A/B tests**: cost vs revenue, experiments with significance testing
- **194R & TDS**: per-FY benefit aggregation for business members, 10% / 20% (no PAN) rates, 26Q CSV export
- **API & integrations / Security**

## Notes

- **Font:** the UI uses the San Francisco family through the system stack (`-apple-system`, `SF Pro`). Apple's licence doesn't allow bundling SF, so Windows/Android devices without SF Pro installed fall back to their system font.
- **194R:** the logic follows the Act (₹20,000 FY threshold, 10%, 20% without PAN under 206AA) and deliberately excludes personal-use guest discounts. Confirm treatment with your tax advisor.
- **Security page:** certification badges (ISO 27001, ISO 9001, GDPR/DPDP, OWASP, CWE/SANS) are switched on by the manager in **Settings → Certifications & trust badges**, with an optional certificate number or report link. Only switch one on once the certificate or test report exists.
- The performance figures on the API page are **targets**, not measured values.

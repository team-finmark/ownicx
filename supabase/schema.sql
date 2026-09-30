-- Ownicx for Salons — Supabase schema
-- Run in the Supabase SQL editor (or `supabase db push`). Then run seed.sql for starter tiers/services/rules.
-- IDs are text so the app can generate them (and so demo IDs round-trip).

create table if not exists settings (
  id text primary key default 'default',
  salon_name text not null default 'My Salon',
  timezone text not null default 'Asia/Kolkata',
  whatsapp_number text not null default '',
  booking_link text not null default '',
  margin_goal_pct numeric not null default 55,
  reward_budget_pct numeric not null default 6,
  referral_level1_points int not null default 100,
  referral_level2_points int not null default 25,
  referral_milestones jsonb not null default '[]',
  tds_threshold numeric not null default 20000,
  tds_rate numeric not null default 10,
  tds_rate_no_pan numeric not null default 20,
  certifications jsonb not null default '{}'
);
-- For databases created before these columns existed:
alter table campaigns add column if not exists member_ids jsonb not null default '[]';
alter table settings add column if not exists certifications jsonb not null default '{}';

create table if not exists tiers (
  id text primary key,
  name text not null,
  min_points int not null,
  multiplier numeric not null default 1,
  color text not null,
  perks jsonb not null default '[]',
  sort int not null default 0
);

create table if not exists services (
  id text primary key,
  name text not null,
  category text not null,
  price numeric not null,
  points int not null default 0,
  revisit_days int
);

create table if not exists customers (
  id text primary key,
  name text not null,
  phone text not null unique,
  email text,
  gender text check (gender in ('female','male','other')),
  birthday date,
  channel text not null default 'walk_in' check (channel in ('app','whatsapp','walk_in','pos')),
  kyc_status text not null default 'pending' check (kyc_status in ('pending','verified','rejected')),
  pan text,
  is_business boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  points int not null default 0,
  lifetime_points int not null default 0,
  tier_id text references tiers(id),
  referral_code text not null unique,
  referred_by text references customers(id),
  segment jsonb not null default '[]',
  joined_at timestamptz not null default now(),
  last_visit_at timestamptz,
  total_spend numeric not null default 0,
  visit_count int not null default 0
);

create table if not exists visits (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  service_id text not null references services(id),
  amount numeric not null,
  points_earned int not null default 0,
  at timestamptz not null default now()
);
create index if not exists visits_customer_at on visits (customer_id, at desc);

create table if not exists rewards (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('flat_off','percent_off','free_service','gift')),
  value numeric not null,
  cost_points int not null,
  tier_id text references tiers(id),
  validity_days int not null default 30,
  active boolean not null default true,
  emoji text not null default '🎁'
);

create table if not exists coupons (
  id text primary key,
  code text not null unique,
  customer_id text references customers(id) on delete cascade,
  reward_id text references rewards(id),
  label text not null,
  value numeric not null default 0,
  source text not null check (source in ('milestone','campaign','referral','manual','redemption')),
  status text not null default 'active' check (status in ('active','redeemed','expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

create table if not exists automation_rules (
  id text primary key,
  type text not null check (type in ('revisit_reminder','milestone_offer','expiry_nudge','winback','birthday')),
  name text not null,
  enabled boolean not null default true,
  config jsonb not null,
  template text not null,
  send_hour int not null default 10,
  audience text not null default 'all'
);

create table if not exists messages (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  rule_id text references automation_rules(id) on delete set null,
  campaign_id text,
  dedupe_key text not null unique, -- one message per trigger, ever
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

create table if not exists campaigns (
  id text primary key,
  name text not null,
  segment text not null,
  member_ids jsonb not null default '[]',
  channel text not null default 'whatsapp',
  offer text not null,
  status text not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sent int not null default 0,
  converted int not null default 0,
  revenue numeric not null default 0,
  cost numeric not null default 0
);

create table if not exists experiments (
  id text primary key,
  name text not null,
  hypothesis text not null,
  metric text not null,
  status text not null default 'draft',
  started_at timestamptz not null default now(),
  variants jsonb not null default '[]'
);

create table if not exists referrals (
  id text primary key,
  referrer_id text not null references customers(id) on delete cascade,
  referee_id text not null references customers(id) on delete cascade,
  level int not null check (level in (1,2)),
  status text not null default 'pending' check (status in ('pending','qualified','rewarded')),
  points_awarded int not null default 0,
  created_at timestamptz not null default now()
);

-- Dashboard sign-in. Passwords are scrypt hashes; create/reset with `npm run manager -- "Name" "Password1"`.
create table if not exists managers (
  id text primary key,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists managers_name_ci on managers (lower(name));

-- WhatsApp connection, managed from Settings → WhatsApp (not .env). Tokens are encrypted by the app (AES-256-GCM).
create table if not exists whatsapp_connection (
  id text primary key default 'default',
  mode text not null default 'click_to_chat' check (mode in ('click_to_chat','cloud_api')),
  phone text not null default '',
  phone_confirmed boolean not null default false,
  status text not null default 'not_connected' check (status in ('not_connected','connected','error')),
  connected_via text check (connected_via in ('manual','facebook')),
  phone_number_id text,
  waba_id text,
  access_token_enc text,
  app_secret_enc text,
  webhook_verify_token text not null default replace(gen_random_uuid()::text, '-', ''),
  verified_name text,
  display_phone text,
  last_error text,
  connected_at timestamptz
);

-- The dashboard talks to Supabase with the service-role key from the server only.
-- RLS on, with no policies, blocks the anon key from reading customer PII.
alter table settings enable row level security;
alter table tiers enable row level security;
alter table services enable row level security;
alter table customers enable row level security;
alter table visits enable row level security;
alter table rewards enable row level security;
alter table coupons enable row level security;
alter table automation_rules enable row level security;
alter table messages enable row level security;
alter table campaigns enable row level security;
alter table experiments enable row level security;
alter table referrals enable row level security;
alter table managers enable row level security;
alter table whatsapp_connection enable row level security;

-- ---------- Upgrades (safe to re-run) ----------
-- Meta-approved WhatsApp templates per rule / campaign, and on each queued message.
alter table automation_rules add column if not exists wa_template jsonb;
alter table campaigns add column if not exists wa_template jsonb;
-- "No message" control group for campaigns.
alter table campaigns add column if not exists holdout_pct int not null default 0;
alter table campaigns add column if not exists holdout_ids jsonb not null default '[]';
-- Background sending queue.
alter table messages add column if not exists template jsonb;
alter table messages add column if not exists attempts int not null default 0;

-- Sign-in lockout shared by every server instance.
create table if not exists login_attempts (
  id text primary key,          -- "name:<manager>" or "ip:<address>"
  n int not null default 0,
  until timestamptz not null
);
alter table login_attempts enable row level security;

-- Indexes for the queries the dashboard and API run (so pages don't scan whole tables).
create index if not exists messages_status_created on messages (status, created_at);
create index if not exists messages_campaign on messages (campaign_id);
create index if not exists visits_at on visits (at desc);
create index if not exists coupons_status_expires on coupons (status, expires_at);
create index if not exists coupons_customer on coupons (customer_id);
create index if not exists referrals_referee on referrals (referee_id);
create index if not exists referrals_referrer on referrals (referrer_id);

-- ---------- Free scheduler (Supabase pg_cron + pg_net) ----------
-- Vercel's free plan only runs crons once a day, so Supabase calls the app instead.
-- 1. Dashboard → Database → Extensions: enable pg_cron and pg_net.
-- 2. Replace YOUR-APP and YOUR_CRON_SECRET below, then run these two statements.
-- Automations: every hour (each rule only fires in its own send hour).
-- select cron.schedule('ownicx-automations', '0 * * * *', $$
--   select net.http_get(url := 'https://YOUR-APP.vercel.app/api/automations/run',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'));
-- $$);
-- Sending queue (automatic WhatsApp mode): every 5 minutes.
-- select cron.schedule('ownicx-dispatch', '*/5 * * * *', $$
--   select net.http_get(url := 'https://YOUR-APP.vercel.app/api/messages/dispatch',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'));
-- $$);

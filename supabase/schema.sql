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

-- =====================================================================================
-- Salon operations: bookings, billing, stock, staff, attendance, payroll, expenses.
-- Safe to re-run. Same model as above: the app talks to these tables only from the server
-- with the service-role key; RLS is on with no policies, so the anon key reads nothing.
-- =====================================================================================

-- Roles: 'admin' = owner (everything), 'manager' = front desk (bookings, bills, attendance, members).
-- Existing managers stay owners. Create a front-desk login with: npm run manager -- "Name" "Password1" manager
alter table managers add column if not exists role text not null default 'admin';
do $$ begin
  alter table managers add constraint managers_role_check check (role in ('admin','manager'));
exception when duplicate_object then null; end $$;

-- Salon hours and billing details (Settings → Salon hours & billing).
alter table settings add column if not exists salon_address text not null default '';
alter table settings add column if not exists salon_phone text not null default '';
alter table settings add column if not exists gstin text not null default '';
alter table settings add column if not exists invoice_prefix text not null default 'INV';
alter table settings add column if not exists opening_time text not null default '10:00';
alter table settings add column if not exists closing_time text not null default '21:00';
alter table settings add column if not exists weekly_off jsonb not null default '[]';
alter table settings add column if not exists slot_minutes int not null default 15;
alter table settings add column if not exists paid_leave boolean not null default false;

-- Services gain chair time (blocks the stylist's calendar), gender and a retire switch.
alter table services add column if not exists duration_min int not null default 30 check (duration_min > 0);
alter table services add column if not exists gender text not null default 'unisex' check (gender in ('men','women','unisex'));
alter table services add column if not exists is_active boolean not null default true;

create table if not exists staff (
  id text primary key,
  name text not null,
  phone text,
  email text,
  position text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  base_salary numeric(12,2) not null default 0 check (base_salary >= 0),
  commission_rate numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists inventory (
  id text primary key,
  name text not null,
  category text,
  description text,
  quantity int not null default 0 check (quantity >= 0), -- never negative: overselling fails
  price numeric(10,2) not null default 0 check (price >= 0),
  reorder_level int not null default 0 check (reorder_level >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id text primary key,
  inventory_id text not null references inventory(id) on delete restrict,
  delta int not null,
  reason text not null check (reason in ('purchase','sale','adjustment','return','void')),
  ref_invoice_id text,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item on stock_movements (inventory_id, created_at desc);
create index if not exists stock_movements_created on stock_movements (created_at desc);

-- Appointments. The exclusion constraint makes double-booking a stylist impossible even when two
-- tills book the same slot at the same instant (the app checks first; this is the backstop).
create extension if not exists btree_gist;
create table if not exists appointments (
  id text primary key,
  customer_id text not null references customers(id) on delete restrict,
  staff_id text not null references staff(id) on delete restrict,
  service_id text not null references services(id) on delete restrict,
  service_name text not null,
  service_price numeric(10,2) not null,
  date date not null,
  time time not null,
  duration_min int not null default 30 check (duration_min > 0),
  status text not null default 'upcoming' check (status in ('upcoming','in_progress','completed','cancelled','no_show')),
  invoice_id text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slot tsrange generated always as (tsrange(date + time, date + time + make_interval(mins => duration_min))) stored,
  constraint appointments_no_overlap exclude using gist (staff_id with =, slot with &&) where (status in ('upcoming','in_progress'))
);
create index if not exists appointments_date on appointments (date, time);
create index if not exists appointments_staff_date on appointments (staff_id, date);
create index if not exists appointments_customer on appointments (customer_id);

-- Invoices: numbered consecutively per Indian financial year (e.g. INV2627-00042), voided not deleted.
create table if not exists invoice_counters (
  id text primary key, -- financial year, e.g. '2627'
  last_no int not null default 0
);

create table if not exists invoices (
  id text primary key,
  invoice_no text not null unique check (length(invoice_no) <= 16),
  invoice_date date not null,
  customer_id text references customers(id) on delete set null,
  client_name text not null,
  client_phone text not null,
  client_address text,
  appointment_id text references appointments(id) on delete set null,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0 check (discount >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash','upi','card','other')),
  payment_status text not null default 'paid' check (payment_status in ('paid','partial','unpaid')),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  status text not null default 'issued' check (status in ('issued','void')),
  void_reason text,
  voided_at timestamptz,
  loyalty_points int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists invoices_date on invoices (invoice_date, created_at desc);
create index if not exists invoices_unpaid on invoices (payment_status) where status = 'issued' and payment_status <> 'paid';

create table if not exists invoice_items (
  id text primary key,
  invoice_id text not null references invoices(id) on delete restrict,
  invoice_date date not null,
  item_type text not null check (item_type in ('service','inventory')),
  service_id text references services(id) on delete restrict,
  inventory_id text references inventory(id) on delete restrict,
  description text not null,
  quantity int not null check (quantity > 0),
  rate numeric(10,2) not null check (rate >= 0),
  amount numeric(12,2) not null,
  staff_id text not null references staff(id) on delete restrict, -- every line credits a stylist
  check ((item_type = 'service' and service_id is not null) or (item_type = 'inventory' and inventory_id is not null))
);
create index if not exists invoice_items_invoice on invoice_items (invoice_id);
create index if not exists invoice_items_staff_date on invoice_items (staff_id, invoice_date);
create index if not exists invoice_items_date on invoice_items (invoice_date);

create table if not exists expenses (
  id text primary key,
  date date not null,
  name text not null,
  category text not null default 'Other',
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_date on expenses (date);

create table if not exists staff_attendance (
  id text primary key, -- att_<staff>_<date>: one row per person per day
  staff_id text not null references staff(id) on delete restrict,
  date date not null,
  status text not null check (status in ('present','half_day','leave','absent')),
  check_in text,
  check_out text,
  updated_at timestamptz not null default now(),
  unique (staff_id, date)
);
create index if not exists staff_attendance_date on staff_attendance (date);

create table if not exists staff_payroll (
  id text primary key, -- pay_<staff>_<yyyy>_<mm>: one row per person per month
  staff_id text not null references staff(id) on delete restrict,
  year int not null,
  month int not null check (month between 1 and 12),
  base_salary numeric(12,2) not null default 0,
  working_days int not null default 0,
  paid_days numeric(5,1) not null default 0,
  earned_base numeric(12,2) not null default 0,
  billed numeric(12,2) not null default 0,
  commission_rate numeric(5,2) not null default 0,
  commission numeric(12,2) not null default 0,
  bonus numeric(12,2) not null default 0,
  advance numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','processing','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, year, month)
);
create index if not exists staff_payroll_month on staff_payroll (year, month);

-- Paid salaries are locked: no edit, no delete (fix mistakes deliberately in SQL by disabling the trigger).
create or replace function staff_payroll_lock() returns trigger language plpgsql as $$
begin
  if old.status = 'paid' then
    raise exception 'Payroll % is paid and locked', old.id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists staff_payroll_lock on staff_payroll;
create trigger staff_payroll_lock before update or delete on staff_payroll for each row execute function staff_payroll_lock();

-- Bills are never deleted, a void bill stays void, and the number and total can't change after issue.
create or replace function invoices_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoices are voided, not deleted (%)', old.invoice_no;
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'Invoice % is void', old.invoice_no;
  end if;
  if new.invoice_no <> old.invoice_no or new.total <> old.total then
    raise exception 'Invoice number and total cannot change after issue (%)', old.invoice_no;
  end if;
  return new;
end $$;
drop trigger if exists invoices_guard on invoices;
create trigger invoices_guard before update or delete on invoices for each row execute function invoices_guard();

create table if not exists audit_log (
  id text primary key,
  table_name text not null,
  row_id text not null,
  action text not null,
  actor text,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists audit_log_row on audit_log (table_name, row_id, at desc);

alter table staff enable row level security;
alter table inventory enable row level security;
alter table stock_movements enable row level security;
alter table appointments enable row level security;
alter table invoice_counters enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table expenses enable row level security;
alter table staff_attendance enable row level security;
alter table staff_payroll enable row level security;
alter table audit_log enable row level security;

// Row shapes mirror the Supabase tables in supabase/schema.sql (snake_case on purpose,
// so rows round-trip without a mapping layer).

export type Channel = "app" | "whatsapp" | "walk_in" | "pos";

export interface Customer {
  id: string;
  name: string;
  phone: string; // E.164 without "+", e.g. 919876543210
  email: string | null;
  gender: "female" | "male" | "other" | null;
  birthday: string | null; // YYYY-MM-DD
  channel: Channel;
  pan: string | null;
  is_business: boolean; // partner, influencer or corporate member (PAN required)
  whatsapp_opt_in: boolean;
  points: number; // spendable balance
  lifetime_points: number; // drives tier
  tier_id: string;
  referral_code: string;
  referred_by: string | null;
  segment: string[];
  joined_at: string;
  last_visit_at: string | null;
  total_spend: number;
  visit_count: number;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
  points: number; // points earned per booking
  revisit_days: number | null; // typical cycle, used by revisit reminders
  duration_min?: number; // chair time, used to block the stylist's calendar (default 30)
  gender?: "men" | "women" | "unisex";
  is_active?: boolean; // retired services stay for history but leave the pickers
}

export interface Visit {
  id: string;
  customer_id: string;
  service_id: string;
  amount: number;
  points_earned: number;
  at: string;
}

export interface Tier {
  id: string;
  name: string;
  min_points: number; // lifetime points needed
  multiplier: number; // points multiplier on every visit
  color: string;
  perks: string[];
  sort: number;
}

export type RewardKind = "flat_off" | "percent_off" | "free_service" | "gift";

export interface Reward {
  id: string;
  name: string;
  kind: RewardKind;
  value: number; // ₹ for flat_off, % for percent_off, ₹ cost for free_service/gift
  cost_points: number;
  tier_id: string | null; // minimum tier to unlock
  validity_days: number;
  active: boolean;
  emoji: string;
}

export type CouponStatus = "active" | "redeemed" | "expired";
export type CouponSource = "milestone" | "campaign" | "referral" | "manual" | "redemption";

export interface Coupon {
  id: string;
  code: string;
  customer_id: string | null;
  reward_id: string | null;
  label: string;
  value: number; // ₹ benefit value
  source: CouponSource;
  status: CouponStatus;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

export type RuleType =
  | "revisit_reminder"
  | "milestone_offer"
  | "expiry_nudge"
  | "winback"
  | "birthday";

export interface RevisitConfig {
  service_id: string; // "any" = any service
  days_after: number;
  cooldown_days: number;
}
export interface MilestoneConfig {
  points_threshold: number;
  discount_value: number; // ₹ off
  validity_days: number;
  deduct_points: boolean;
}
export interface ExpiryConfig {
  days_before: number[];
}
export interface WinbackConfig {
  inactive_days: number;
  bonus_points: number;
}
export interface BirthdayConfig {
  discount_value: number;
  validity_days: number;
}

export interface RuleConfigMap {
  revisit_reminder: RevisitConfig;
  milestone_offer: MilestoneConfig;
  expiry_nudge: ExpiryConfig;
  winback: WinbackConfig;
  birthday: BirthdayConfig;
}

/** A Meta-approved WhatsApp template: its name, language and which of our variables fill {{1}}, {{2}}… */
export interface WaTemplate {
  name: string;
  language: string; // e.g. "en", "en_US", "hi"
  params: string[]; // variable names in order, e.g. ["first_name", "days", "booking_link"]
}

export interface AutomationRule<T extends RuleType = RuleType> {
  id: string;
  type: T;
  name: string;
  enabled: boolean;
  config: RuleConfigMap[T];
  template: string;
  send_hour: number; // local hour the runner is allowed to send
  audience: string; // segment filter, "all" for everyone
  wa_template?: WaTemplate | null; // used for automatic sending outside the 24h window
}

export type MessageStatus = "queued" | "sent" | "failed" | "skipped";

export interface Message {
  id: string;
  customer_id: string;
  rule_id: string | null;
  campaign_id: string | null;
  dedupe_key: string;
  body: string;
  status: MessageStatus;
  created_at: string;
  sent_at: string | null;
  error: string | null;
  template?: { name: string; language: string; values: string[] } | null; // filled Meta template for automatic sending
  attempts?: number; // automatic send attempts (max 3)
}

export interface Campaign {
  id: string;
  name: string;
  segment: string; // "all", a segment tag, "tier:<id>", or "members" (hand-picked, see member_ids)
  member_ids: string[];
  channel: "whatsapp" | "app";
  offer: string;
  status: "draft" | "scheduled" | "live" | "ended";
  starts_at: string;
  ends_at: string;
  sent: number;
  converted: number;
  revenue: number;
  cost: number;
  wa_template?: WaTemplate | null;
  holdout_pct?: number; // % of the audience kept as a no-message control group
  holdout_ids?: string[];
}

export interface Referral {
  id: string;
  referrer_id: string;
  referee_id: string;
  level: 1 | 2;
  status: "pending" | "qualified" | "rewarded";
  points_awarded: number;
  created_at: string;
}

export interface ReferralMilestone {
  count: number;
  label: string;
  points: number;
}

export interface Settings {
  id: string;
  salon_name: string;
  timezone: string;
  whatsapp_number: string;
  booking_link: string;
  margin_goal_pct: number; // target gross margin after loyalty cost
  reward_budget_pct: number; // max % of loyalty-member revenue spent on rewards
  referral_level1_points: number;
  referral_level2_points: number;
  referral_milestones: ReferralMilestone[];
  // Salon operations (all optional so databases created before them keep working).
  salon_address?: string;
  salon_phone?: string;
  gstin?: string;
  invoice_prefix?: string; // invoice numbers look like <prefix><FY>-00042, e.g. INV2627-00042
  opening_time?: string; // "HH:MM", India time
  closing_time?: string;
  weekly_off?: number[]; // 0 = Sunday … 6 = Saturday
  slot_minutes?: number; // booking grid
  paid_leave?: boolean; // payroll: does "leave" count as a paid day
}

/** admin = owner (everything); manager = front desk (appointments, invoices, attendance, members). */
export type Role = "admin" | "manager";

export interface Manager {
  id: string;
  name: string; // sign-in name (case-insensitive)
  password_hash: string; // scrypt, never sent to the browser
  created_at: string;
  last_login_at: string | null;
  role?: Role; // rows created before roles existed are owners
}

// ---------- Salon operations ----------

export interface Staff {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  position: string;
  status: "active" | "inactive";
  base_salary: number; // monthly ₹
  commission_rate: number; // % of what they bill
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  quantity: number;
  price: number; // retail ₹ per unit
  reorder_level: number;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  inventory_id: string;
  delta: number;
  reason: "purchase" | "sale" | "adjustment" | "return" | "void";
  ref_invoice_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type AppointmentStatus = "upcoming" | "in_progress" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  customer_id: string;
  staff_id: string;
  service_id: string;
  service_name: string; // copied at booking, so history survives price/name changes
  service_price: number;
  date: string; // YYYY-MM-DD, India time
  time: string; // HH:MM, India time
  duration_min: number;
  status: AppointmentStatus;
  invoice_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = "cash" | "upi" | "card" | "other";

export interface Invoice {
  id: string;
  invoice_no: string; // <prefix><FY>-<00001>, consecutive per Indian financial year
  invoice_date: string; // YYYY-MM-DD, India time
  customer_id: string | null;
  client_name: string;
  client_phone: string; // digits, e.g. 919876543210
  client_address: string | null;
  appointment_id: string | null;
  subtotal: number;
  discount: number;
  tax_rate: number; // % applied after discount (0 when not GST-registered)
  tax: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: "paid" | "partial" | "unpaid";
  amount_paid: number;
  status: "issued" | "void";
  void_reason: string | null;
  voided_at: string | null;
  loyalty_points: number; // points the guest earned on this bill
  created_by: string | null;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  invoice_date: string; // copied from the invoice so staff sales can be summed without a join
  item_type: "service" | "inventory";
  service_id: string | null;
  inventory_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  staff_id: string;
}

export interface InvoiceCounter {
  id: string; // financial year, e.g. "2627"
  last_no: number;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD, the day the money went out
  name: string;
  category: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type AttendanceStatus = "present" | "half_day" | "leave" | "absent";

export interface Attendance {
  id: string; // att_<staff>_<date> — one row per staff per day
  staff_id: string;
  date: string;
  status: AttendanceStatus;
  check_in: string | null; // HH:MM
  check_out: string | null;
  updated_at: string;
}

export interface Payroll {
  id: string; // pay_<staff>_<yyyy>_<mm> — one row per staff per month
  staff_id: string;
  year: number;
  month: number; // 1–12
  base_salary: number;
  working_days: number;
  paid_days: number;
  earned_base: number;
  billed: number; // what the stylist billed this month (issued invoices)
  commission_rate: number;
  commission: number;
  bonus: number;
  advance: number;
  deductions: number;
  total: number;
  status: "pending" | "processing" | "paid";
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  table_name: string;
  row_id: string;
  action: string;
  actor: string | null;
  detail: Record<string, unknown>;
  at: string;
}

export interface WhatsAppConnection {
  id: string; // always "default"
  mode: "click_to_chat" | "cloud_api"; // what the manager chose
  phone: string; // salon's WhatsApp number, digits only (e.g. 919876543210)
  phone_confirmed: boolean; // manager confirmed it (tap-to-send) or Meta verified it (automatic)
  status: "not_connected" | "connected" | "error"; // automatic-sending connection
  connected_via: "manual" | "facebook" | null;
  phone_number_id: string | null;
  waba_id: string | null;
  access_token_enc: string | null; // AES-256-GCM, never sent to the browser
  app_secret_enc: string | null; // manual connections only; Facebook sign-in uses the platform app secret
  webhook_verify_token: string;
  verified_name: string | null;
  display_phone: string | null;
  last_error: string | null;
  connected_at: string | null;
}

export interface LoginAttempt {
  id: string; // "name:<manager>" or "ip:<address>"
  n: number;
  until: string;
}

export interface Tables {
  customers: Customer;
  services: Service;
  visits: Visit;
  tiers: Tier;
  rewards: Reward;
  coupons: Coupon;
  automation_rules: AutomationRule;
  messages: Message;
  campaigns: Campaign;
  referrals: Referral;
  settings: Settings;
  managers: Manager;
  whatsapp_connection: WhatsAppConnection;
  login_attempts: LoginAttempt;
  staff: Staff;
  inventory: InventoryItem;
  stock_movements: StockMovement;
  appointments: Appointment;
  invoices: Invoice;
  invoice_items: InvoiceItem;
  invoice_counters: InvoiceCounter;
  expenses: Expense;
  staff_attendance: Attendance;
  staff_payroll: Payroll;
  audit_log: AuditEntry;
}

export type TableName = keyof Tables;

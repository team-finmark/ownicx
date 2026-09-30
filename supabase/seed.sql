-- Ownicx for Salons — starter configuration (generated from lib/seed.ts). Safe to re-run.

insert into settings (id, salon_name, timezone, whatsapp_number, booking_link, margin_goal_pct, reward_budget_pct, referral_level1_points, referral_level2_points, referral_milestones, tds_threshold, tds_rate, tds_rate_no_pan) values
  ('default', 'Luxe Studio', 'Asia/Kolkata', '919800000000', 'https://luxe.studio/book', 55, 6, 100, 25, '[{"count":1,"label":"+100 points","points":100},{"count":3,"label":"+1,000 points","points":1000},{"count":5,"label":"Special gift","points":0}]'::jsonb, 20000, 10, 20)
on conflict (id) do nothing;

insert into tiers (id, name, min_points, multiplier, color, perks, sort) values
  ('silver', 'Silver', 0, 1, '#9aa0a6', '["Earn points on every service","Birthday offer"]'::jsonb, 1),
  ('gold', 'Gold', 100, 1.25, '#d4a017', '["1.25× points","Priority weekend slots","Free hair spa every quarter"]'::jsonb, 2),
  ('platinum', 'Platinum', 220, 1.5, '#6b7a8f', '["1.5× points","Complimentary add-on each visit","Early access to new services"]'::jsonb, 3),
  ('diamond', 'Diamond', 400, 2, '#5b3fd9', '["2× points","Dedicated stylist","Luxury gift every half-year"]'::jsonb, 4)
on conflict (id) do nothing;

insert into services (id, name, category, price, points, revisit_days) values
  ('haircut', 'Haircut', 'Hair', 600, 5, 60),
  ('beard', 'Beard trim', 'Grooming', 250, 2, 21),
  ('colour', 'Hair colour', 'Hair', 2800, 20, 45),
  ('keratin', 'Keratin treatment', 'Hair', 5500, 40, 120),
  ('spa', 'Hair spa', 'Hair', 1400, 12, 30),
  ('facial', 'Facial', 'Skin', 1800, 15, 30),
  ('mani', 'Manicure', 'Nails', 700, 6, 21),
  ('pedi', 'Pedicure', 'Nails', 900, 8, 28),
  ('bridal', 'Bridal makeup', 'Makeup', 18000, 120, null)
on conflict (id) do nothing;

insert into rewards (id, name, kind, value, cost_points, tier_id, validity_days, active, emoji) values
  ('rw_beard', 'Free beard trim', 'free_service', 250, 40, null, 30, true, '🧔'),
  ('rw_150', '₹150 off any service', 'flat_off', 150, 150, null, 14, true, '💸'),
  ('rw_spa', 'Free hair spa', 'free_service', 1400, 120, 'gold', 30, true, '💆'),
  ('rw_colour10', '10% off hair colour', 'percent_off', 10, 200, 'gold', 30, true, '🎨'),
  ('rw_mani', 'Free manicure', 'free_service', 700, 90, 'platinum', 30, true, '💅'),
  ('rw_kit', 'Luxury haircare kit', 'gift', 3500, 600, 'diamond', 45, true, '🎁')
on conflict (id) do nothing;

insert into automation_rules (id, type, name, enabled, config, template, send_hour, audience) values
  ('rule_revisit_haircut', 'revisit_reminder', 'Haircut revisit reminder', true, '{"service_id":"haircut","days_after":60,"cooldown_days":30}'::jsonb, 'Hi {{first_name}} ✂️ It''s been {{days}} days since your last {{service}} at {{salon}}. Ready for a fresh look? You have {{points}} points waiting. Book here: {{booking_link}}', 10, 'all'),
  ('rule_revisit_colour', 'revisit_reminder', 'Root touch-up reminder', true, '{"service_id":"colour","days_after":45,"cooldown_days":21}'::jsonb, 'Hi {{first_name}} 🎨 Your {{service}} is {{days}} days old — roots usually show around now. Book a touch-up at {{salon}}: {{booking_link}}', 11, 'all'),
  ('rule_milestone_150', 'milestone_offer', '150-point milestone offer', true, '{"points_threshold":150,"discount_value":150,"validity_days":14,"deduct_points":true}'::jsonb, '🎉 Congrats {{first_name}}! You''ve hit {{points}} points at {{salon}}. Enjoy ₹{{offer}} off any service — code {{code}}. Valid till {{expiry}} only, so don''t miss it!', 10, 'all'),
  ('rule_expiry', 'expiry_nudge', 'Offer expiry countdown', true, '{"days_before":[7,3,1]}'::jsonb, '⏳ {{first_name}}, your {{offer_label}} (code {{code}}) expires in {{days_left}} day(s) — on {{expiry}}. Grab a slot before it''s gone: {{booking_link}}', 12, 'all'),
  ('rule_winback', 'winback', 'Win back lapsed guests', true, '{"inactive_days":120,"bonus_points":20}'::jsonb, 'We miss you, {{first_name}} 💛 We''ve added {{bonus}} bonus points to your {{salon}} account. Come back and treat yourself: {{booking_link}}', 17, 'all'),
  ('rule_birthday', 'birthday', 'Birthday treat', false, '{"discount_value":200,"validity_days":7}'::jsonb, 'Happy birthday {{first_name}} 🎂 Here''s ₹{{offer}} off from all of us at {{salon}} — code {{code}}, valid till {{expiry}}.', 9, 'all')
on conflict (id) do nothing;


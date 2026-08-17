-- Local dev seed. Runs after migrations on `supabase start` (first boot) and on
-- every `supabase db reset`. Never runs against cloud — `supabase db push` only
-- applies migrations/.
--
-- Gives you: demo@moneypal.local / demo1234, four accounts, three months of
-- transactions, a budget, a goal, two holdings. Sign up with any other email
-- instead to start from blank.

-- Invite-only signup (20260817090000) is a production guard. Locally it would
-- block both this seed and anyone creating their own account.
drop trigger if exists on_auth_user_check_allowlist on auth.users;

-- -----------------------------------------------------------------------------
-- Demo user
-- -----------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated',
  'demo@moneypal.local',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Demo"}',
  now() - interval '3 months', now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"demo@moneypal.local","email_verified":true,"phone_verified":false}',
  'email', now(), now(), now()
);

-- -----------------------------------------------------------------------------
-- Accounts (opening balances in paise). The default "Mine" slice is created by
-- trg_account_default_slice with the full opening balance.
-- -----------------------------------------------------------------------------

insert into public.accounts
  (id, user_id, name, institution, kind, currency_code, opening_balance, is_primary,
   credit_limit, bill_generation_day, due_day)
values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'HDFC Savings', 'HDFC Bank', 'bank', 'INR', 45000000, true, null, null, null),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Cash Wallet', null, 'cash', 'INR', 500000, false, null, null, null),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'Amazon Pay Card', 'ICICI Bank', 'credit_card', 'INR', 0, false, 20000000, 5, 25),
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'Zerodha', 'Zerodha', 'investment', 'INR', 0, false, null, null, null);

-- The point of slices: ₹50,000 of the savings balance is Mom's, so it is held
-- but not owned. Splitting the opening balance keeps allocated == balance.
update public.labels
   set opening_amount = 40000000
 where account_id = 'a0000000-0000-4000-8000-000000000001' and is_default;

insert into public.labels (user_id, name, color_token, account_id, kind, opening_amount)
values ('11111111-1111-4111-8111-111111111111', 'Mom''s money', 'chart-4',
        'a0000000-0000-4000-8000-000000000001', 'custodial', 5000000);

-- -----------------------------------------------------------------------------
-- Three months of transactions
-- Written straight to the ledger tables: fn_record_transaction needs auth.uid(),
-- which is null in a seed session.
-- -----------------------------------------------------------------------------

create temp table seed_plan as
select
  gen_random_uuid() as txn_id,
  m + (t.day - 1) * interval '1 day' + interval '10 hours' as occurred_at,
  t.type::public.txn_type,
  t.merchant,
  t.amount,
  (select id from public.categories where name = t.category and user_id is null) as category_id,
  t.from_account::uuid,
  t.to_account::uuid
from generate_series(
       date_trunc('month', now()) - interval '2 months',
       date_trunc('month', now()),
       interval '1 month'
     ) as m,
     (values
       -- day, type, merchant, category, paise, from account, to account
       (1,  'income',   'Acme Corp payroll',  'Salary',        12000000, 'a0000000-0000-4000-8000-000000000001', null),
       (3,  'expense',  'Landlord',           'Rent',           2500000, 'a0000000-0000-4000-8000-000000000001', null),
       (5,  'transfer', 'SIP — Nifty 50',     'Investments',    1500000, 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004'),
       (6,  'expense',  'Big Basket',         'Groceries',       420000, 'a0000000-0000-4000-8000-000000000003', null),
       (7,  'expense',  'Tata Power',         'Utilities',       185000, 'a0000000-0000-4000-8000-000000000001', null),
       (9,  'expense',  'Uber',               'Transport',        62000, 'a0000000-0000-4000-8000-000000000003', null),
       (11, 'expense',  'Swiggy',             'Dining',          118000, 'a0000000-0000-4000-8000-000000000003', null),
       (13, 'expense',  'Big Basket',         'Groceries',       385000, 'a0000000-0000-4000-8000-000000000003', null),
       (15, 'expense',  'Apollo Pharmacy',    'Healthcare',       94000, 'a0000000-0000-4000-8000-000000000002', null),
       (17, 'expense',  'PVR Cinemas',        'Entertainment',    76000, 'a0000000-0000-4000-8000-000000000003', null),
       (19, 'expense',  'Amazon',             'Shopping',        249000, 'a0000000-0000-4000-8000-000000000003', null),
       (20, 'expense',  'Big Basket',         'Groceries',       410000, 'a0000000-0000-4000-8000-000000000003', null),
       (22, 'expense',  'Third Wave Coffee',  'Dining',           52000, 'a0000000-0000-4000-8000-000000000002', null),
       (24, 'transfer', 'Card payment',       'Transfer',       1400000, 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003'),
       (26, 'expense',  'Indian Oil',         'Transport',       210000, 'a0000000-0000-4000-8000-000000000003', null),
       (27, 'expense',  'Big Basket',         'Groceries',       368000, 'a0000000-0000-4000-8000-000000000003', null)
     ) as t(day, type, merchant, category, amount, from_account, to_account)
-- The current month is only seeded up to today, so charts do not show a future.
where m + (t.day - 1) * interval '1 day' <= now();

insert into public.transactions
  (id, user_id, occurred_at, type, merchant, category_id, source, confidence)
select txn_id, '11111111-1111-4111-8111-111111111111', occurred_at, type, merchant,
       category_id, 'seed', 1
from seed_plan;

-- Outgoing leg (income is the only positive one).
insert into public.transaction_entries
  (transaction_id, user_id, account_id, amount, currency_code)
select txn_id, '11111111-1111-4111-8111-111111111111', from_account,
       case when type = 'income' then amount else -amount end, 'INR'
from seed_plan;

-- Incoming leg of transfers.
insert into public.transaction_entries
  (transaction_id, user_id, account_id, amount, currency_code)
select txn_id, '11111111-1111-4111-8111-111111111111', to_account, amount, 'INR'
from seed_plan
where to_account is not null;

-- -----------------------------------------------------------------------------
-- Budget for the current month, from the Balanced 50/30/20 template on ₹1,20,000
-- -----------------------------------------------------------------------------

insert into public.budgets (id, user_id, period_month, currency_code, note)
values ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        date_trunc('month', now())::date, 'INR', 'Balanced 50/30/20');

insert into public.budget_lines (budget_id, user_id, category_id, planned)
select 'b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
       bt.category_id, (12000000::bigint * bt.share_bps / 10000)
from public.budget_templates bt
where bt.name = 'Balanced 50/30/20' and bt.deleted_at is null;

-- -----------------------------------------------------------------------------
-- Goal + contributions
-- -----------------------------------------------------------------------------

insert into public.goals
  (id, user_id, name, blurb, icon, target_amount, currency_code, target_date,
   account_id, monthly_contribution)
values ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'Japan trip', 'Cherry blossom season', 'plane', 20000000, 'INR',
        (date_trunc('month', now()) + interval '8 months')::date,
        'a0000000-0000-4000-8000-000000000001', 1500000);

insert into public.goal_contributions (goal_id, user_id, amount, contributed_on)
select 'c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
       1500000, (m + interval '5 days')::date
from generate_series(
       date_trunc('month', now()) - interval '2 months',
       date_trunc('month', now()),
       interval '1 month'
     ) as m;

-- -----------------------------------------------------------------------------
-- Holdings (paise; last_price is per unit)
-- -----------------------------------------------------------------------------

insert into public.holdings
  (user_id, account_id, name, asset_class, units, invested, last_price, prev_price,
   priced_at, currency_code, symbol)
values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004',
   'Nippon India Nifty 50 BeES', 'equity', 120, 3000000, 28450, 28210,
   now(), 'INR', 'NIFTYBEES.NS'),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004',
   'Parag Parikh Flexi Cap', 'mutual_fund', 340.5, 2000000, 7420, 7385,
   now(), 'INR', '122639');

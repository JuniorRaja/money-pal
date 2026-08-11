-- Baseline 2/4: profiles, accounts (CC schedule + loan terms), slices, ledger,
-- credit card cycle history, transaction RPCs (RPC-only writes) + RLS

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  base_currency text not null default 'INR' references public.currencies(code),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  number_format text not null default 'indian' check (number_format in ('indian','international')),
  round_to_nearest boolean not null default false,
  theme text not null default 'light' check (theme in ('light','dark')),
  accent text,
  sidebar text not null default 'expanded' check (sidebar in ('expanded','collapsed')),
  reduce_motion boolean not null default false,
  assistant_tone text not null default 'concise' check (assistant_tone in ('concise','detailed')),
  assistant_context boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_profiles before insert or update on public.profiles
  for each row execute function public.fn_touch_audit();

-- -----------------------------------------------------------------------------
-- Accounts
-- Credit cards: schedule fields on account; cycle amounts live in credit_card_cycles.
-- Loans: EMI / rate / tenure / lender on the account itself.
-- Slices: bank + cash only (enforced by fn_slice_guard).
-- -----------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  kind public.account_kind not null,
  currency_code text not null references public.currencies(code),
  opening_balance bigint not null default 0,
  is_primary boolean not null default false,

  -- credit card schedule (nullable; meaningful when kind = credit_card)
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  bill_generation_day smallint check (bill_generation_day is null or bill_generation_day between 1 and 31),
  due_day smallint check (due_day is null or due_day between 1 and 31),

  -- loan terms (nullable; meaningful when kind = loan)
  interest_rate_bps int check (interest_rate_bps is null or interest_rate_bps >= 0),
  emi_amount bigint check (emi_amount is null or emi_amount >= 0),
  tenure_months int check (tenure_months is null or tenure_months > 0),
  lender text,

  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true,

  constraint accounts_cc_fields_ck check (
    kind = 'credit_card'
    or (credit_limit is null and bill_generation_day is null and due_day is null)
  ),
  constraint accounts_loan_fields_ck check (
    kind = 'loan'
    or (
      interest_rate_bps is null
      and emi_amount is null
      and tenure_months is null
      and lender is null
    )
  )
);
create trigger trg_audit_accounts before insert or update on public.accounts
  for each row execute function public.fn_touch_audit();
create index ix_accounts_user on public.accounts(user_id) where deleted_at is null;
create unique index ux_accounts_primary on public.accounts(user_id)
  where is_primary and deleted_at is null;
create unique index ux_accounts_name on public.accounts(user_id, lower(name))
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Labels (global tags + account slices)
-- -----------------------------------------------------------------------------

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color_token text,
  account_id uuid references public.accounts(id) on delete cascade,
  kind public.slice_kind not null default 'owned',
  opening_amount bigint not null default 0,
  target_amount bigint,
  target_date date,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_labels before insert or update on public.labels
  for each row execute function public.fn_touch_audit();
create unique index labels_slice_name_uq
  on public.labels (account_id, lower(name))
  where account_id is not null and deleted_at is null;
create unique index labels_slice_default_uq
  on public.labels (account_id)
  where account_id is not null and is_default and deleted_at is null;
create unique index labels_global_name_uq
  on public.labels (user_id, lower(name))
  where account_id is null and deleted_at is null;
create index labels_user_account_idx on public.labels (user_id, account_id);

create or replace function public.fn_slice_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_kind public.account_kind;
  v_remaining int;
begin
  if new.account_id is not null then
    select user_id, kind into v_owner, v_kind
      from public.accounts where id = new.account_id;
    if v_owner is null then
      raise exception 'account % not found', new.account_id;
    end if;
    if v_owner <> new.user_id then
      raise exception 'slice must belong to the account owner';
    end if;
    if v_kind not in ('bank','cash') then
      raise exception 'slices are only supported on bank and cash accounts';
    end if;
  end if;

  if new.kind <> 'earmark' and (new.target_amount is not null or new.target_date is not null) then
    raise exception 'target amount/date are only valid on earmark slices';
  end if;

  if tg_op = 'UPDATE'
     and old.deleted_at is null and new.deleted_at is not null
     and old.account_id is not null then
    select count(*) into v_remaining
      from public.labels
     where account_id = old.account_id and deleted_at is null and id <> old.id;
    if v_remaining = 0 then
      raise exception 'an account must keep at least one slice';
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.fn_slice_guard() from public, anon, authenticated;
drop trigger if exists trg_slice_guard on public.labels;
create trigger trg_slice_guard
before insert or update on public.labels
for each row execute function public.fn_slice_guard();

create or replace function public.fn_account_default_slice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('bank','cash') then
    insert into public.labels (user_id, name, color_token, account_id, kind, opening_amount, is_default)
    values (new.user_id, 'Mine', 'chart-2', new.id, 'owned', new.opening_balance, true);
  end if;
  return new;
end $$;

revoke execute on function public.fn_account_default_slice() from public, anon, authenticated;
drop trigger if exists trg_account_default_slice on public.accounts;
create trigger trg_account_default_slice
after insert on public.accounts
for each row execute function public.fn_account_default_slice();

-- -----------------------------------------------------------------------------
-- Credit card billing cycles (history)
-- "used" for the current card = ledger outstanding (see views).
-- Per-cycle statement_balance is the billed/used amount for that statement.
-- -----------------------------------------------------------------------------

create table public.credit_card_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  statement_date date not null,
  due_date date not null,
  credit_limit bigint not null check (credit_limit >= 0),
  statement_balance bigint not null,
  payment_due_amount bigint not null check (payment_due_amount >= 0),
  minimum_due bigint not null check (minimum_due >= 0),
  amount_paid bigint not null default 0 check (amount_paid >= 0),
  is_current boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true,
  constraint credit_card_cycles_dates_ck check (due_date >= statement_date)
);
create trigger trg_audit_credit_card_cycles before insert or update on public.credit_card_cycles
  for each row execute function public.fn_touch_audit();
create unique index ux_cc_cycle_statement
  on public.credit_card_cycles (account_id, statement_date)
  where deleted_at is null;
create unique index ux_cc_cycle_current
  on public.credit_card_cycles (account_id)
  where is_current and deleted_at is null;
create index ix_cc_cycles_user on public.credit_card_cycles (user_id, account_id)
  where deleted_at is null;

create or replace function public.fn_credit_card_cycle_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_kind public.account_kind;
begin
  select user_id, kind into v_owner, v_kind
    from public.accounts where id = new.account_id;
  if v_owner is null then
    raise exception 'account % not found', new.account_id;
  end if;
  if v_owner <> new.user_id then
    raise exception 'cycle must belong to the account owner';
  end if;
  if v_kind <> 'credit_card' then
    raise exception 'billing cycles are only valid on credit_card accounts';
  end if;
  return new;
end $$;

revoke execute on function public.fn_credit_card_cycle_guard() from public, anon, authenticated;
create trigger trg_credit_card_cycle_guard
before insert or update on public.credit_card_cycles
for each row execute function public.fn_credit_card_cycle_guard();

-- -----------------------------------------------------------------------------
-- Ledger
-- -----------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  type public.txn_type not null,
  merchant text,
  descriptor text,
  note text,
  category_id uuid references public.categories(id),
  label_id uuid references public.labels(id),
  payment_method text,
  source text not null default 'manual',
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  attachments int not null default 0 check (attachments >= 0),
  external_ref text,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_transactions before insert or update on public.transactions
  for each row execute function public.fn_touch_audit();
create index ix_txn_user_time on public.transactions(user_id, occurred_at desc) where deleted_at is null;
create index ix_txn_category on public.transactions(user_id, category_id) where deleted_at is null;
create index ix_txn_label on public.transactions(user_id, label_id) where deleted_at is null;
create unique index ux_txn_external on public.transactions(user_id, external_ref)
  where external_ref is not null and deleted_at is null;

create table public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  amount bigint not null check (amount <> 0),
  currency_code text not null references public.currencies(code),
  label_id uuid references public.labels(id),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_entries before insert or update on public.transaction_entries
  for each row execute function public.fn_touch_audit();
create index ix_entries_account on public.transaction_entries(account_id) where deleted_at is null;
create index ix_entries_txn on public.transaction_entries(transaction_id);
create index ix_entries_user on public.transaction_entries(user_id) where deleted_at is null;
create index ix_entries_label on public.transaction_entries(label_id)
  where label_id is not null and deleted_at is null;

create or replace function public.fn_entry_currency_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare acct_currency text;
begin
  select currency_code into acct_currency from public.accounts where id = new.account_id;
  if acct_currency is null then
    raise exception 'account % not found', new.account_id;
  end if;
  if acct_currency <> new.currency_code then
    raise exception 'entry currency % must match account currency %', new.currency_code, acct_currency;
  end if;
  return new;
end $$;

revoke execute on function public.fn_entry_currency_guard() from public, anon, authenticated;
create trigger trg_entry_currency before insert or update on public.transaction_entries
  for each row execute function public.fn_entry_currency_guard();

create or replace function public.fn_entry_label_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_deleted timestamptz;
begin
  if new.label_id is null then
    return new;
  end if;

  select account_id, deleted_at into v_account, v_deleted
    from public.labels
   where id = new.label_id;

  if not found then
    raise exception 'slice % not found', new.label_id;
  end if;
  if v_deleted is not null then
    raise exception 'slice % is archived', new.label_id;
  end if;
  if v_account is null then
    raise exception 'label % is not a slice (missing account_id)', new.label_id;
  end if;
  if v_account <> new.account_id then
    raise exception 'slice % belongs to account %, not entry account %',
      new.label_id, v_account, new.account_id;
  end if;

  return new;
end $$;

revoke execute on function public.fn_entry_label_guard() from public, anon, authenticated;
create trigger trg_entry_label
before insert or update on public.transaction_entries
for each row execute function public.fn_entry_label_guard();

-- -----------------------------------------------------------------------------
-- Helpers + transaction RPCs (authenticated writes go through these only)
-- -----------------------------------------------------------------------------

create or replace function public.fn_account_balance(p_account uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select (a.opening_balance + coalesce(sum(e.amount), 0))::bigint
  from public.accounts a
  left join public.transaction_entries e on e.account_id = a.id and e.deleted_at is null
  where a.id = p_account and a.deleted_at is null
  group by a.id, a.opening_balance;
$$;

create or replace function public.fn_convert(
  p_amount bigint,
  p_from text,
  p_to text,
  p_on date default current_date
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p_amount is null then null
    when p_from = p_to then p_amount
    else round(p_amount * (
      select r.rate from public.fx_rates r
      where r.base_code = p_from and r.quote_code = p_to and r.as_of <= p_on and r.deleted_at is null
      order by r.as_of desc limit 1))::bigint
  end;
$$;

create or replace function public.fn_assert_slice_on_account(
  p_label uuid,
  p_account uuid,
  p_uid uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account uuid;
begin
  if p_label is null then
    return;
  end if;
  select account_id into v_account
    from public.labels
   where id = p_label and user_id = p_uid and deleted_at is null;
  if v_account is null then
    raise exception 'slice not found';
  end if;
  if v_account <> p_account then
    raise exception 'slice does not belong to account';
  end if;
end $$;

create or replace function public.fn_record_transaction(
  p_occurred_at timestamptz,
  p_type public.txn_type,
  p_from_account uuid,
  p_amount bigint,
  p_to_account uuid default null,
  p_category uuid default null,
  p_merchant text default null,
  p_descriptor text default null,
  p_from_label uuid default null,
  p_to_label uuid default null,
  p_payment_method text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_txn uuid;
  v_from_ccy text;
  v_to_ccy text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'p_amount must be positive; direction comes from p_type'; end if;
  if p_type = 'transfer' then
    if p_to_account is null then raise exception 'transfer needs p_to_account'; end if;
    if p_to_account = p_from_account then raise exception 'transfer accounts must differ'; end if;
  elsif p_to_account is not null then
    raise exception 'p_to_account is only valid for transfers';
  end if;

  select currency_code into v_from_ccy from public.accounts
   where id = p_from_account and user_id = v_uid and deleted_at is null;
  if v_from_ccy is null then raise exception 'account not found'; end if;

  perform public.fn_assert_slice_on_account(p_from_label, p_from_account, v_uid);
  if p_type = 'transfer' then
    select currency_code into v_to_ccy from public.accounts
     where id = p_to_account and user_id = v_uid and deleted_at is null;
    if v_to_ccy is null then raise exception 'destination account not found'; end if;
    perform public.fn_assert_slice_on_account(p_to_label, p_to_account, v_uid);
  end if;

  insert into public.transactions
    (user_id, occurred_at, type, merchant, descriptor, note, category_id, label_id, payment_method, source, confidence)
  values (
    v_uid, p_occurred_at, p_type, p_merchant, p_descriptor, p_note, p_category,
    p_from_label,
    p_payment_method, 'manual', 1
  )
  returning id into v_txn;

  insert into public.transaction_entries
    (transaction_id, user_id, account_id, amount, currency_code, label_id)
  values (
    v_txn, v_uid, p_from_account,
    case when p_type = 'income' then p_amount else -p_amount end,
    v_from_ccy,
    p_from_label
  );

  if p_type = 'transfer' then
    insert into public.transaction_entries
      (transaction_id, user_id, account_id, amount, currency_code, label_id)
    values (
      v_txn, v_uid, p_to_account,
      public.fn_convert(p_amount, v_from_ccy, v_to_ccy, p_occurred_at::date),
      v_to_ccy,
      p_to_label
    );
  end if;

  return v_txn;
end $$;

create or replace function public.fn_update_transaction(
  p_transaction_id uuid,
  p_occurred_at timestamptz default null,
  p_type public.txn_type default null,
  p_from_account uuid default null,
  p_to_account uuid default null,
  p_amount bigint default null,
  p_category uuid default null,
  p_merchant text default null,
  p_descriptor text default null,
  p_from_label uuid default null,
  p_to_label uuid default null,
  p_clear_from_label boolean default false,
  p_clear_to_label boolean default false,
  p_payment_method text default null,
  p_note text default null,
  p_clear_note boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_txn public.transactions%rowtype;
  v_type public.txn_type;
  v_amount bigint;
  v_from_account uuid;
  v_to_account uuid;
  v_from_label uuid;
  v_to_label uuid;
  v_from_ccy text;
  v_to_ccy text;
  v_from_entry uuid;
  v_occurred timestamptz;
  r record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_txn from public.transactions
   where id = p_transaction_id and user_id = v_uid and deleted_at is null;
  if not found then raise exception 'transaction not found'; end if;

  v_type := coalesce(p_type, v_txn.type);
  v_occurred := coalesce(p_occurred_at, v_txn.occurred_at);

  v_from_entry := null;
  for r in
    select id, account_id, amount, label_id
      from public.transaction_entries
     where transaction_id = p_transaction_id and deleted_at is null
     order by amount asc, id
  loop
    if v_from_entry is null then
      v_from_entry := r.id;
      v_from_account := r.account_id;
      v_from_label := r.label_id;
      v_amount := abs(r.amount);
    else
      v_to_account := r.account_id;
      v_to_label := r.label_id;
    end if;
  end loop;

  if v_from_entry is null then raise exception 'transaction has no entries'; end if;

  if p_from_account is not null then v_from_account := p_from_account; end if;
  if p_to_account is not null then v_to_account := p_to_account; end if;
  if p_amount is not null then
    if p_amount <= 0 then raise exception 'p_amount must be positive'; end if;
    v_amount := p_amount;
  end if;

  if p_clear_from_label then
    v_from_label := null;
  elsif p_from_label is not null then
    v_from_label := p_from_label;
  end if;

  if p_clear_to_label then
    v_to_label := null;
  elsif p_to_label is not null then
    v_to_label := p_to_label;
  end if;

  if v_type = 'transfer' then
    if v_to_account is null then raise exception 'transfer needs destination account'; end if;
    if v_to_account = v_from_account then raise exception 'transfer accounts must differ'; end if;
  else
    v_to_account := null;
    v_to_label := null;
  end if;

  select currency_code into v_from_ccy from public.accounts
   where id = v_from_account and user_id = v_uid and deleted_at is null;
  if v_from_ccy is null then raise exception 'account not found'; end if;
  perform public.fn_assert_slice_on_account(v_from_label, v_from_account, v_uid);

  if v_type = 'transfer' then
    select currency_code into v_to_ccy from public.accounts
     where id = v_to_account and user_id = v_uid and deleted_at is null;
    if v_to_ccy is null then raise exception 'destination account not found'; end if;
    perform public.fn_assert_slice_on_account(v_to_label, v_to_account, v_uid);
  end if;

  update public.transactions set
    occurred_at = v_occurred,
    type = v_type,
    merchant = coalesce(p_merchant, merchant),
    descriptor = coalesce(p_descriptor, descriptor),
    category_id = coalesce(p_category, category_id),
    label_id = v_from_label,
    payment_method = coalesce(p_payment_method, payment_method),
    note = case when p_clear_note then null else coalesce(p_note, note) end,
    modified_at = now()
  where id = p_transaction_id;

  update public.transaction_entries
     set deleted_at = now(), is_active = false, modified_at = now()
   where transaction_id = p_transaction_id and deleted_at is null;

  insert into public.transaction_entries
    (transaction_id, user_id, account_id, amount, currency_code, label_id)
  values (
    p_transaction_id, v_uid, v_from_account,
    case when v_type = 'income' then v_amount else -v_amount end,
    v_from_ccy,
    v_from_label
  );

  if v_type = 'transfer' then
    insert into public.transaction_entries
      (transaction_id, user_id, account_id, amount, currency_code, label_id)
    values (
      p_transaction_id, v_uid, v_to_account,
      public.fn_convert(v_amount, v_from_ccy, v_to_ccy, v_occurred::date),
      v_to_ccy,
      v_to_label
    );
  end if;

  return p_transaction_id;
end $$;

create or replace function public.fn_delete_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  update public.transactions
     set deleted_at = v_now, is_active = false, modified_at = v_now, modified_by = v_uid
   where id = p_transaction_id
     and user_id = v_uid
     and deleted_at is null;

  if not found then
    raise exception 'transaction not found';
  end if;

  update public.transaction_entries
     set deleted_at = v_now, is_active = false, modified_at = v_now, modified_by = v_uid
   where transaction_id = p_transaction_id
     and user_id = v_uid
     and deleted_at is null;

  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Grants + RLS
-- Ledger writes are RPC-only (SECURITY DEFINER). Authenticated: SELECT only.
-- SELECT policies omit deleted_at so soft-delete UPDATEs succeed under RLS.
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select, insert, update, delete on public.accounts to authenticated;
grant all on public.accounts to service_role;
grant select, insert, update, delete on public.labels to authenticated;
grant all on public.labels to service_role;
grant select, insert, update, delete on public.credit_card_cycles to authenticated;
grant all on public.credit_card_cycles to service_role;

grant select on public.transactions to authenticated;
grant all on public.transactions to service_role;
grant select on public.transaction_entries to authenticated;
grant all on public.transaction_entries to service_role;

-- Supabase default privileges often grant ALL to anon/authenticated on new tables.
revoke all on table public.transactions from anon, authenticated, public;
revoke all on table public.transaction_entries from anon, authenticated, public;
grant select on table public.transactions to authenticated;
grant select on table public.transaction_entries to authenticated;
grant all on table public.transactions to service_role;
grant all on table public.transaction_entries to service_role;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.labels enable row level security;
alter table public.credit_card_cycles enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete on public.profiles for delete to authenticated
  using (user_id = auth.uid());

create policy accounts_select on public.accounts for select to authenticated
  using (user_id = auth.uid());
create policy accounts_insert on public.accounts for insert to authenticated
  with check (user_id = auth.uid());
create policy accounts_update on public.accounts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_delete on public.accounts for delete to authenticated
  using (user_id = auth.uid());

create policy labels_select on public.labels for select to authenticated
  using (user_id = auth.uid());
create policy labels_insert on public.labels for insert to authenticated
  with check (user_id = auth.uid());
create policy labels_update on public.labels for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy labels_delete on public.labels for delete to authenticated
  using (user_id = auth.uid());

create policy credit_card_cycles_select on public.credit_card_cycles for select to authenticated
  using (user_id = auth.uid());
create policy credit_card_cycles_insert on public.credit_card_cycles for insert to authenticated
  with check (user_id = auth.uid());
create policy credit_card_cycles_update on public.credit_card_cycles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy credit_card_cycles_delete on public.credit_card_cycles for delete to authenticated
  using (user_id = auth.uid());

create policy transactions_select on public.transactions for select to authenticated
  using (user_id = auth.uid());

create policy entries_select on public.transaction_entries for select to authenticated
  using (user_id = auth.uid());

revoke execute on function public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text
) from public, anon;
revoke execute on function public.fn_update_transaction(
  uuid, timestamptz, public.txn_type, uuid, uuid, bigint, uuid, text, text, uuid, uuid, boolean, boolean, text, text, boolean
) from public, anon;
revoke execute on function public.fn_delete_transaction(uuid) from public, anon;

grant execute on function public.fn_account_balance(uuid) to authenticated;
grant execute on function public.fn_convert(bigint, text, text, date) to authenticated;
grant execute on function public.fn_assert_slice_on_account(uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text
) to authenticated;
grant execute on function public.fn_update_transaction(
  uuid, timestamptz, public.txn_type, uuid, uuid, bigint, uuid, text, text, uuid, uuid, boolean, boolean, text, text, boolean
) to authenticated;
grant execute on function public.fn_delete_transaction(uuid) to authenticated;

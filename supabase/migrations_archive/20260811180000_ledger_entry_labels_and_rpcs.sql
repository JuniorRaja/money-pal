-- Ledger hardening:
-- 1. Slice tags live on transaction_entries (per-leg) so transfers can have from/to slices
-- 2. Atomic create / update / delete RPCs for dual-entry transactions
-- 3. Views updated to derive slice amounts from entry.label_id

-- =============================================================================
-- 1. ENTRY-LEVEL LABEL (SLICE)
-- =============================================================================

alter table public.transaction_entries
  add column if not exists label_id uuid references public.labels(id);

create index if not exists ix_entries_label
  on public.transaction_entries(label_id)
  where label_id is not null and deleted_at is null;

-- Backfill: copy header label onto every active entry of that transaction
update public.transaction_entries e
set label_id = t.label_id
from public.transactions t
where e.transaction_id = t.id
  and e.deleted_at is null
  and t.label_id is not null
  and e.label_id is null;

-- Guard: entry label must be an active slice on the same account
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

drop trigger if exists trg_entry_label on public.transaction_entries;
create trigger trg_entry_label
before insert or update on public.transaction_entries
for each row execute function public.fn_entry_label_guard();

-- =============================================================================
-- 2. VIEWS
-- Postgres CREATE OR REPLACE VIEW cannot rename/reorder columns, so drop first.
-- =============================================================================

drop view if exists public.v_net_worth_owned;
drop view if exists public.v_account_allocation;
drop view if exists public.v_account_slices;
drop view if exists public.v_transactions_flat;

create view public.v_account_slices
with (security_invoker = true) as
select
  l.id                        as slice_id,
  l.user_id,
  l.account_id,
  a.name                      as account_name,
  a.currency_code,
  l.name,
  l.kind,
  l.color_token,
  l.is_default,
  l.target_amount,
  l.target_date,
  (l.opening_amount + coalesce(sum(e.amount), 0))::bigint as amount,
  l.opening_amount
from public.labels l
join public.accounts a on a.id = l.account_id and a.deleted_at is null
left join public.transaction_entries e
  on e.label_id = l.id
 and e.account_id = l.account_id
 and e.deleted_at is null
where l.account_id is not null and l.deleted_at is null
group by l.id, l.user_id, l.account_id, a.name, a.currency_code,
         l.name, l.kind, l.color_token, l.is_default, l.target_amount, l.target_date, l.opening_amount;

create view public.v_account_allocation
with (security_invoker = true) as
select
  b.account_id,
  b.user_id,
  b.name,
  b.kind as account_kind,
  b.currency_code,
  b.balance,
  coalesce(s.slice_count, 0)                as slice_count,
  coalesce(s.allocated, 0)::bigint          as allocated,
  (b.balance - coalesce(s.allocated, 0))::bigint as unallocated,
  coalesce(s.owned, 0)::bigint              as owned_amount,
  coalesce(s.custodial, 0)::bigint          as custodial_amount,
  coalesce(s.earmarked, 0)::bigint          as earmarked_amount
from public.v_account_balances b
left join (
  select account_id,
         count(*)                                                as slice_count,
         sum(amount)                                             as allocated,
         sum(amount) filter (where kind = 'owned')               as owned,
         sum(amount) filter (where kind = 'custodial')           as custodial,
         sum(amount) filter (where kind = 'earmark')             as earmarked
  from public.v_account_slices
  group by account_id
) s on s.account_id = b.account_id;

create view public.v_net_worth_owned
with (security_invoker = true) as
select
  a.user_id,
  sum(a.balance)::bigint                                as net_worth,
  coalesce(sum(a.custodial_amount), 0)::bigint          as custodial_total,
  coalesce(sum(a.earmarked_amount), 0)::bigint          as earmarked_total,
  (sum(a.balance) - coalesce(sum(a.custodial_amount), 0))::bigint as owned_net_worth
from public.v_account_allocation a
group by a.user_id;

-- Flat ledger: label_id from entry; expose header id as transaction_id (appended)
create view public.v_transactions_flat
with (security_invoker = true) as
select
  t.id,
  t.user_id,
  t.occurred_at,
  t.type,
  t.merchant,
  t.descriptor,
  t.note,
  t.category_id,
  cat.name as category_name,
  cat.color_token as category_color,
  e.label_id,
  t.payment_method,
  t.source,
  t.confidence,
  t.attachments,
  e.id as entry_id,
  e.account_id,
  e.amount,
  e.currency_code,
  cur.symbol as currency_symbol,
  cur.minor_unit,
  a.name as account_name,
  a.kind as account_kind,
  t.id as transaction_id
from public.transactions t
join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
join public.accounts a on a.id = e.account_id
join public.currencies cur on cur.code = e.currency_code
left join public.categories cat on cat.id = t.category_id
where t.deleted_at is null;

grant select on public.v_account_slices to authenticated;
grant select on public.v_account_allocation to authenticated;
grant select on public.v_net_worth_owned to authenticated;
grant select on public.v_transactions_flat to authenticated;
grant all on public.v_transactions_flat to service_role;
grant all on public.v_account_slices to service_role;
grant all on public.v_account_allocation to service_role;
grant all on public.v_net_worth_owned to service_role;

-- =============================================================================
-- 3. HELPERS
-- =============================================================================

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

-- =============================================================================
-- 4. CREATE TRANSACTION (dual-entry transfers)
-- Drop old signature and replace with from/to label params
-- =============================================================================

drop function if exists public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, text, text
);

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
security invoker
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
    p_from_label, -- mirror primary/from slice on header for legacy readers
    p_payment_method, 'manual', 1
  )
  returning id into v_txn;

  -- From / sole leg
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

-- =============================================================================
-- 5. UPDATE TRANSACTION
-- =============================================================================

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
security invoker
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
  v_to_entry uuid;
  v_occurred timestamptz;
  r record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_txn from public.transactions
   where id = p_transaction_id and user_id = v_uid and deleted_at is null;
  if not found then raise exception 'transaction not found'; end if;

  v_type := coalesce(p_type, v_txn.type);
  v_occurred := coalesce(p_occurred_at, v_txn.occurred_at);

  -- Resolve current legs: negative (or sole) = from; positive = to (transfers)
  v_from_entry := null;
  v_to_entry := null;
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
      v_to_entry := r.id;
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

  -- Soft-delete existing entries, then re-insert correct legs (simplest reshape)
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

-- =============================================================================
-- 6. DELETE TRANSACTION (soft-delete header + all legs)
-- =============================================================================

create or replace function public.fn_delete_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security invoker
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

grant execute on function public.fn_assert_slice_on_account(uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text
) to authenticated;
grant execute on function public.fn_update_transaction(
  uuid, timestamptz, public.txn_type, uuid, uuid, bigint, uuid, text, text, uuid, uuid, boolean, boolean, text, text, boolean
) to authenticated;
grant execute on function public.fn_delete_transaction(uuid) to authenticated;

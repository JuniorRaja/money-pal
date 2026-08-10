-- 1. Slice kind enum
do $$ begin
  create type public.slice_kind as enum ('owned','custodial','earmark');
exception when duplicate_object then null; end $$;

-- 2. Extend labels into slices
alter table public.labels
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists kind public.slice_kind not null default 'owned',
  add column if not exists opening_amount bigint not null default 0,
  add column if not exists target_amount bigint,
  add column if not exists target_date date,
  add column if not exists is_default boolean not null default false;

create unique index if not exists labels_slice_name_uq
  on public.labels (account_id, lower(name))
  where account_id is not null and deleted_at is null;

create unique index if not exists labels_slice_default_uq
  on public.labels (account_id)
  where account_id is not null and is_default and deleted_at is null;

create index if not exists labels_user_account_idx on public.labels (user_id, account_id);

-- 3. Validation guard
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
    if v_kind not in ('bank','cash','investment') then
      raise exception 'slices are only supported on bank, cash and investment accounts';
    end if;
  end if;

  if new.kind <> 'earmark' and (new.target_amount is not null or new.target_date is not null) then
    raise exception 'target amount/date are only valid on earmark slices';
  end if;

  -- Block removing the last active slice of an account
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

drop trigger if exists trg_slice_guard on public.labels;
create trigger trg_slice_guard
before insert or update on public.labels
for each row execute function public.fn_slice_guard();

-- 4. Default slice on new accounts
create or replace function public.fn_account_default_slice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('bank','cash','investment') then
    insert into public.labels (user_id, name, color_token, account_id, kind, opening_amount, is_default)
    values (new.user_id, 'Mine', 'chart-2', new.id, 'owned', new.opening_balance, true);
  end if;
  return new;
end $$;

drop trigger if exists trg_account_default_slice on public.accounts;
create trigger trg_account_default_slice
after insert on public.accounts
for each row execute function public.fn_account_default_slice();

-- 5. Backfill existing accounts
insert into public.labels (user_id, name, color_token, account_id, kind, opening_amount, is_default)
select a.user_id, 'Mine', 'chart-2', a.id, 'owned', a.opening_balance, true
from public.accounts a
where a.deleted_at is null
  and a.kind in ('bank','cash','investment')
  and not exists (
    select 1 from public.labels l
     where l.account_id = a.id and l.deleted_at is null
  );

-- 6. Views
create or replace view public.v_account_slices
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
  (l.opening_amount + coalesce(sum(e.amount), 0))::bigint as amount
from public.labels l
join public.accounts a on a.id = l.account_id and a.deleted_at is null
left join public.transactions t
  on t.label_id = l.id and t.deleted_at is null
left join public.transaction_entries e
  on e.transaction_id = t.id and e.account_id = l.account_id and e.deleted_at is null
where l.account_id is not null and l.deleted_at is null
group by l.id, l.user_id, l.account_id, a.name, a.currency_code,
         l.name, l.kind, l.color_token, l.is_default, l.target_amount, l.target_date, l.opening_amount;

create or replace view public.v_account_allocation
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

create or replace view public.v_net_worth_owned
with (security_invoker = true) as
select
  a.user_id,
  sum(a.balance)::bigint                                as net_worth,
  coalesce(sum(a.custodial_amount), 0)::bigint          as custodial_total,
  coalesce(sum(a.earmarked_amount), 0)::bigint          as earmarked_total,
  (sum(a.balance) - coalesce(sum(a.custodial_amount), 0))::bigint as owned_net_worth
from public.v_account_allocation a
group by a.user_id;

grant select on public.v_account_slices to authenticated;
grant select on public.v_account_allocation to authenticated;
grant select on public.v_net_worth_owned to authenticated;
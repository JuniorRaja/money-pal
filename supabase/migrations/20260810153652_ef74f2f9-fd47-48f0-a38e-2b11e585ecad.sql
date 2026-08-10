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

create or replace function public.fn_entry_currency_guard()
returns trigger language plpgsql security definer set search_path = public as $$
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

grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;
grant select, insert, update, delete on public.transaction_entries to authenticated;
grant all on public.transaction_entries to service_role;

alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;

create policy transactions_select on public.transactions for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy transactions_insert on public.transactions for insert to authenticated
  with check (user_id = auth.uid());
create policy transactions_update on public.transactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_delete on public.transactions for delete to authenticated
  using (user_id = auth.uid());

create policy entries_select on public.transaction_entries for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy entries_insert on public.transaction_entries for insert to authenticated
  with check (user_id = auth.uid());
create policy entries_update on public.transaction_entries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy entries_delete on public.transaction_entries for delete to authenticated
  using (user_id = auth.uid());
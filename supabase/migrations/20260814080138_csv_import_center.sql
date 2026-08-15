-- CSV Import Center: remembered bank mappings, staged rows, merchant rules.
-- Privacy: persist parsed rows only; never store the original file.
--
-- Types regen: this repo has no `supabase gen types` script. Data-layer agent
-- should regenerate src/integrations/supabase/types.ts (or add tables/RPCs below).
--
-- New tables
--   import_profiles(
--     id uuid, user_id uuid, account_id uuid, source_id uuid null,
--     bank_preset bank_preset, mapping jsonb,
--     audit columns)
--   import_job_rows(
--     id uuid, job_id uuid, user_id uuid, account_id uuid,
--     occurred_at timestamptz, merchant text, descriptor text,
--     amount_paise bigint, type txn_type (income|expense),
--     raw_line jsonb, import_hash text, status import_row_status,
--     suggested_category_id uuid null, transaction_id uuid null, confidence numeric,
--     audit columns)
--   import_rules(
--     id uuid, user_id uuid, match text, category_id uuid, account_id uuid null,
--     audit columns)
--
-- RPC signatures
--   fn_record_transaction(
--     p_occurred_at timestamptz,
--     p_type txn_type,
--     p_from_account uuid,
--     p_amount bigint,
--     p_to_account uuid default null,
--     p_category uuid default null,
--     p_merchant text default null,
--     p_descriptor text default null,
--     p_from_label uuid default null,
--     p_to_label uuid default null,
--     p_payment_method text default null,
--     p_note text default null,
--     p_source text default 'manual',
--     p_external_ref text default null,
--     p_confidence numeric default 1
--   ) returns uuid
--
--   fn_commit_import_row(p_row_id uuid) returns uuid
--     -- null when marked skipped_duplicate with no matching live txn
--     -- returns existing or new transaction id otherwise
--
-- Hash (client): sha256(account_id | date | signed_amount | normalized_narration | n)

create type public.bank_preset as enum ('hdfc_savings', 'hdfc_cc', 'dbs', 'custom');
create type public.import_row_status as enum (
  'pending',
  'imported',
  'skipped_duplicate',
  'skipped',
  'held'
);

create table public.import_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  source_id uuid references public.import_sources(id) on delete set null,
  bank_preset public.bank_preset not null,
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_profiles before insert or update on public.import_profiles
  for each row execute function public.fn_touch_audit();
create unique index ux_import_profile_account_preset
  on public.import_profiles(user_id, account_id, bank_preset)
  where deleted_at is null;
create index ix_import_profiles_user on public.import_profiles(user_id) where deleted_at is null;
create index ix_import_profiles_source on public.import_profiles(source_id)
  where source_id is not null and deleted_at is null;

create table public.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  occurred_at timestamptz not null,
  merchant text,
  descriptor text,
  amount_paise bigint not null check (amount_paise > 0),
  type public.txn_type not null check (type = any (array['income','expense']::public.txn_type[])),
  raw_line jsonb not null default '{}'::jsonb,
  import_hash text not null,
  status public.import_row_status not null default 'pending',
  suggested_category_id uuid references public.categories(id),
  transaction_id uuid references public.transactions(id) on delete set null,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_job_rows before insert or update on public.import_job_rows
  for each row execute function public.fn_touch_audit();
create unique index ux_import_job_row_hash
  on public.import_job_rows(job_id, import_hash)
  where deleted_at is null;
create index ix_import_job_rows_user on public.import_job_rows(user_id) where deleted_at is null;
create index ix_import_job_rows_queue on public.import_job_rows(user_id, job_id, status)
  where deleted_at is null and status in ('pending', 'held');

create table public.import_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match text not null check (length(btrim(match)) > 0),
  category_id uuid not null references public.categories(id),
  account_id uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_rules before insert or update on public.import_rules
  for each row execute function public.fn_touch_audit();
create unique index ux_import_rule_match
  on public.import_rules(
    user_id,
    lower(btrim(match)),
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where deleted_at is null;
create index ix_import_rules_user on public.import_rules(user_id) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- fn_record_transaction: optional source / external_ref / confidence
-- -----------------------------------------------------------------------------

drop function if exists public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text
);

create function public.fn_record_transaction(
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
  p_note text default null,
  p_source text default 'manual',
  p_external_ref text default null,
  p_confidence numeric default 1
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
  v_source text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_external_ref text := nullif(btrim(p_external_ref), '');
  v_confidence numeric := coalesce(p_confidence, 1);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'p_amount must be positive; direction comes from p_type'; end if;
  if v_confidence < 0 or v_confidence > 1 then raise exception 'p_confidence must be between 0 and 1'; end if;
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
    (user_id, occurred_at, type, merchant, descriptor, note, category_id, label_id,
     payment_method, source, confidence, external_ref)
  values (
    v_uid, p_occurred_at, p_type, p_merchant, p_descriptor, p_note, p_category,
    p_from_label,
    p_payment_method, v_source, v_confidence, v_external_ref
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

-- -----------------------------------------------------------------------------
-- fn_commit_import_row: accept one staged row (atomic vs duplicate hash)
-- -----------------------------------------------------------------------------

create or replace function public.fn_commit_import_row(p_row_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.import_job_rows%rowtype;
  v_existing uuid;
  v_txn uuid;
  v_label uuid;
  v_account uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row
    from public.import_job_rows
   where id = p_row_id
     and user_id = v_uid
     and deleted_at is null
   for update;

  if not found then raise exception 'import row not found'; end if;

  if v_row.status in ('imported', 'skipped_duplicate') then
    return v_row.transaction_id;
  end if;

  if v_row.status = 'skipped' then
    raise exception 'import row was skipped';
  end if;

  perform 1 from public.import_jobs
   where id = v_row.job_id and user_id = v_uid and deleted_at is null
   for update;
  if not found then raise exception 'import job not found'; end if;

  select id into v_account
    from public.accounts
   where id = v_row.account_id and user_id = v_uid and deleted_at is null;
  if v_account is null then raise exception 'account not found'; end if;

  select id into v_existing
    from public.transactions
   where user_id = v_uid
     and external_ref = v_row.import_hash
     and deleted_at is null;

  if v_existing is not null then
    update public.import_job_rows
       set status = 'skipped_duplicate',
           transaction_id = v_existing,
           modified_at = now()
     where id = v_row.id;

    update public.import_jobs
       set duplicates = duplicates + 1,
           rows_done = rows_done + 1,
           finished_at = case
             when rows_total > 0 and rows_done + 1 >= rows_total then now()
             else finished_at
           end
     where id = v_row.job_id;

    return v_existing;
  end if;

  select id into v_label
    from public.labels
   where user_id = v_uid
     and account_id = v_row.account_id
     and is_default
     and deleted_at is null
   limit 1;

  begin
    v_txn := public.fn_record_transaction(
      v_row.occurred_at,
      v_row.type,
      v_row.account_id,
      v_row.amount_paise,
      null,
      v_row.suggested_category_id,
      v_row.merchant,
      v_row.descriptor,
      v_label,
      null,
      'Import',
      null,
      'csv',
      v_row.import_hash,
      coalesce(v_row.confidence, 1)
    );
  exception
    when unique_violation then
      select id into v_existing
        from public.transactions
       where user_id = v_uid
         and external_ref = v_row.import_hash
         and deleted_at is null;
      if v_existing is null then
        raise;
      end if;
      update public.import_job_rows
         set status = 'skipped_duplicate',
             transaction_id = v_existing,
             modified_at = now()
       where id = v_row.id;
      update public.import_jobs
         set duplicates = duplicates + 1,
             rows_done = rows_done + 1,
             finished_at = case
               when rows_total > 0 and rows_done + 1 >= rows_total then now()
               else finished_at
             end
       where id = v_row.job_id;
      return v_existing;
  end;

  update public.import_job_rows
     set status = 'imported',
         transaction_id = v_txn,
         modified_at = now()
   where id = v_row.id;

  update public.import_jobs
     set imported = imported + 1,
         rows_done = rows_done + 1,
         finished_at = case
           when rows_total > 0 and rows_done + 1 >= rows_total then now()
           else finished_at
         end
   where id = v_row.job_id;

  return v_txn;
end $$;

grant select, insert, update, delete on public.import_profiles to authenticated;
grant all on public.import_profiles to service_role;
grant select, insert, update, delete on public.import_job_rows to authenticated;
grant all on public.import_job_rows to service_role;
grant select, insert, update, delete on public.import_rules to authenticated;
grant all on public.import_rules to service_role;

alter table public.import_profiles enable row level security;
alter table public.import_job_rows enable row level security;
alter table public.import_rules enable row level security;

create policy import_profiles_select on public.import_profiles for select to authenticated
  using (user_id = auth.uid());
create policy import_profiles_insert on public.import_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy import_profiles_update on public.import_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_profiles_delete on public.import_profiles for delete to authenticated
  using (user_id = auth.uid());

create policy import_job_rows_select on public.import_job_rows for select to authenticated
  using (user_id = auth.uid());
create policy import_job_rows_insert on public.import_job_rows for insert to authenticated
  with check (user_id = auth.uid());
create policy import_job_rows_update on public.import_job_rows for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_job_rows_delete on public.import_job_rows for delete to authenticated
  using (user_id = auth.uid());

create policy import_rules_select on public.import_rules for select to authenticated
  using (user_id = auth.uid());
create policy import_rules_insert on public.import_rules for insert to authenticated
  with check (user_id = auth.uid());
create policy import_rules_update on public.import_rules for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_rules_delete on public.import_rules for delete to authenticated
  using (user_id = auth.uid());

revoke execute on function public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text, text, text, numeric
) from public, anon;
revoke execute on function public.fn_commit_import_row(uuid) from public, anon;

grant execute on function public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text, text, text, numeric
) to authenticated;
grant execute on function public.fn_commit_import_row(uuid) to authenticated;

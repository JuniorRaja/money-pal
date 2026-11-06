-- P6: Category-Centric Migration - Phase 1
-- Shift from merchant-centric to category-centric transaction model.
--
-- Changes:
--   transactions: merchant → payee, add narration
--   import_job_rows: merchant → payee, add narration
--   import_rules: match → pattern, add match_field enum
--   v_transactions_flat: merchant → payee, add narration
--   fn_record_transaction: p_merchant → p_payee, add p_narration
--   fn_update_transaction: p_merchant → p_payee, add p_narration
--   fn_commit_import_row: pass narration through

-- -----------------------------------------------------------------------------
-- Schema changes
-- -----------------------------------------------------------------------------

-- transactions: rename merchant → payee, add narration
alter table public.transactions rename column merchant to payee;
alter table public.transactions add column if not exists narration text;

-- import_job_rows: rename merchant → payee, add narration
alter table public.import_job_rows rename column merchant to payee;
alter table public.import_job_rows add column if not exists narration text;

-- import_rules: rename match → pattern, add match_field
create type public.import_match_field as enum ('note', 'narration', 'payee');

alter table public.import_rules rename column match to pattern;

alter table public.import_rules
  add column if not exists match_field public.import_match_field not null default 'narration';

-- Update unique index on import_rules (uses old column name)
drop index if exists public.ux_import_rule_match;
create unique index ux_import_rule_pattern
  on public.import_rules(
    user_id,
    lower(btrim(pattern)),
    match_field,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Update v_transactions_flat view
-- -----------------------------------------------------------------------------

drop view if exists public.v_transactions_flat;

create view public.v_transactions_flat
with (security_invoker = true) as
select
  t.id,
  t.user_id,
  t.occurred_at,
  t.type,
  t.payee,
  t.narration,
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

-- -----------------------------------------------------------------------------
-- Update fn_record_transaction
-- -----------------------------------------------------------------------------

drop function if exists public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text, text, text, numeric
);

create function public.fn_record_transaction(
  p_occurred_at timestamptz,
  p_type public.txn_type,
  p_from_account uuid,
  p_amount bigint,
  p_to_account uuid default null,
  p_category uuid default null,
  p_payee text default null,
  p_descriptor text default null,
  p_from_label uuid default null,
  p_to_label uuid default null,
  p_payment_method text default null,
  p_note text default null,
  p_source text default 'manual',
  p_external_ref text default null,
  p_confidence numeric default 1,
  p_narration text default null
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
    (user_id, occurred_at, type, payee, narration, descriptor, note, category_id, label_id,
     payment_method, source, confidence, external_ref)
  values (
    v_uid, p_occurred_at, p_type, p_payee, p_narration, p_descriptor, p_note, p_category,
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
-- Update fn_update_transaction
-- -----------------------------------------------------------------------------

drop function if exists public.fn_update_transaction(
  uuid, timestamptz, public.txn_type, uuid, uuid, bigint, uuid, text, text, uuid, uuid, boolean, boolean, text, text, boolean
);

create function public.fn_update_transaction(
  p_transaction_id uuid,
  p_occurred_at timestamptz default null,
  p_type public.txn_type default null,
  p_from_account uuid default null,
  p_to_account uuid default null,
  p_amount bigint default null,
  p_category uuid default null,
  p_payee text default null,
  p_descriptor text default null,
  p_from_label uuid default null,
  p_to_label uuid default null,
  p_clear_from_label boolean default false,
  p_clear_to_label boolean default false,
  p_payment_method text default null,
  p_note text default null,
  p_clear_note boolean default false,
  p_narration text default null,
  p_clear_narration boolean default false
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
    payee = coalesce(p_payee, payee),
    narration = case when p_clear_narration then null else coalesce(p_narration, narration) end,
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

-- -----------------------------------------------------------------------------
-- Update fn_commit_import_row to pass narration
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
      v_row.payee,
      v_row.descriptor,
      v_label,
      null,
      'Import',
      nullif(btrim(coalesce(v_row.note, '')), ''),
      'csv',
      v_row.import_hash,
      coalesce(v_row.confidence, 1),
      v_row.narration
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

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

revoke execute on function public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text, text, text, numeric, text
) from public, anon;

revoke execute on function public.fn_update_transaction(
  uuid, timestamptz, public.txn_type, uuid, uuid, bigint, uuid, text, text, uuid, uuid, boolean, boolean, text, text, boolean, text, boolean
) from public, anon;

grant execute on function public.fn_record_transaction(
  timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, uuid, text, text, text, text, numeric, text
) to authenticated;

grant execute on function public.fn_update_transaction(
  uuid, timestamptz, public.txn_type, uuid, uuid, bigint, uuid, text, text, uuid, uuid, boolean, boolean, text, text, boolean, text, boolean
) to authenticated;

-- Import rows carry the note typed at payment time.
--
-- Indian UPI/IMPS narration usually ends with the free text entered when the
-- payment was made ("...-192342317477-TEA"). It was parsed and thrown away.
-- `extractNote` in src/lib/import/heuristics.ts now pulls it out client-side;
-- this stores it on the staged row and hands it to fn_record_transaction's
-- p_note, which fn_commit_import_row previously passed as null.
--
-- Nothing here touches import_hash (hashed over the raw descriptor), so rows
-- already imported keep their hashes and stay deduped.

alter table public.import_job_rows
  add column if not exists note text;

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
      nullif(btrim(coalesce(v_row.note, '')), ''),
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

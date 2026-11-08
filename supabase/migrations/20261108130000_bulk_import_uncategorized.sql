create or replace function public.fn_bulk_commit_import_rows(p_rows jsonb, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_row_id uuid;
  v_category_id uuid;
  v_status public.import_row_status;
  v_transaction_id uuid;
  v_pattern text;
  v_match_field public.import_match_field;
  v_account_id uuid;
  v_rule_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_rule_ids jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'at least one row is required';
  end if;
  if p_rules is null then p_rules := '[]'::jsonb; end if;
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'rules must be an array'; end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_row_id := nullif(v_item->>'row_id', '')::uuid;
    v_category_id := nullif(v_item->>'suggested_category_id', '')::uuid;
    if v_row_id is null then raise exception 'row_id is required'; end if;
    if v_category_id is not null and not exists (
      select 1 from public.categories
       where id = v_category_id
         and (user_id is null or user_id = v_uid)
         and deleted_at is null
         and is_active
    ) then
      raise exception 'category not found';
    end if;

    update public.import_job_rows
       set suggested_category_id = v_category_id,
           modified_at = now()
     where id = v_row_id
       and user_id = v_uid
       and deleted_at is null
       and status in ('pending', 'held');

    if not found then
      select status into v_status
        from public.import_job_rows
       where id = v_row_id and user_id = v_uid and deleted_at is null;
      if v_status is null or v_status not in ('imported', 'skipped_duplicate') then
        raise exception 'import row not found or not committable';
      end if;
    end if;

    v_transaction_id := public.fn_commit_import_row(v_row_id);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'row_id', v_row_id,
      'transaction_id', v_transaction_id
    ));
  end loop;

  for v_item in select value from jsonb_array_elements(p_rules)
  loop
    v_pattern := nullif(btrim(v_item->>'pattern'), '');
    v_category_id := nullif(v_item->>'category_id', '')::uuid;
    v_match_field := coalesce(nullif(v_item->>'match_field', ''), 'narration')::public.import_match_field;
    v_account_id := nullif(v_item->>'account_id', '')::uuid;
    if v_pattern is null or v_category_id is null then
      raise exception 'each rule needs a pattern and category_id';
    end if;
    if not exists (
      select 1 from public.categories
       where id = v_category_id
         and (user_id is null or user_id = v_uid)
         and deleted_at is null
         and is_active
    ) then
      raise exception 'rule category not found';
    end if;
    if v_account_id is not null and not exists (
      select 1 from public.accounts
       where id = v_account_id and user_id = v_uid and deleted_at is null
    ) then
      raise exception 'rule account not found';
    end if;

    insert into public.import_rules (user_id, pattern, match_field, category_id, account_id, is_active)
    values (v_uid, v_pattern, v_match_field, v_category_id, v_account_id, true)
    on conflict (
      user_id,
      lower(btrim(pattern)),
      match_field,
      (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid))
    ) where deleted_at is null
    do update set
      category_id = excluded.category_id,
      is_active = true,
      modified_at = now()
    returning id into v_rule_id;

    v_rule_ids := v_rule_ids || jsonb_build_array(v_rule_id);
  end loop;

  return jsonb_build_object('rows', v_rows, 'rule_ids', v_rule_ids);
end $$;

revoke execute on function public.fn_bulk_commit_import_rows(jsonb, jsonb) from public, anon;
grant execute on function public.fn_bulk_commit_import_rows(jsonb, jsonb) to authenticated;

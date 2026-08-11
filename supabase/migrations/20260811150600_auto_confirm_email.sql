-- Auto-confirm email on signup so email/password works without mailbox setup.
-- You can instead disable Confirm email in the Auth dashboard; this keeps personal use unblocked.

create or replace function public.fn_auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = new.id
     and email_confirmed_at is null;
  return new;
end $$;

revoke execute on function public.fn_auto_confirm_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  after insert on auth.users
  for each row execute function public.fn_auto_confirm_user();

update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where email_confirmed_at is null;

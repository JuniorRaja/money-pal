-- Seed global categories, Balanced 50/30/20 budget template, and profile-on-signup trigger.

insert into public.categories (user_id, name, kind, icon, color_token, sort_order) values
  (null, 'Salary', 'income', 'banknote', 'chart-1', 10),
  (null, 'Freelance', 'income', 'laptop', 'chart-2', 20),
  (null, 'Interest', 'income', 'percent', 'chart-3', 30),
  (null, 'Groceries', 'essentials', 'shopping-cart', 'chart-1', 110),
  (null, 'Rent', 'essentials', 'home', 'chart-2', 120),
  (null, 'Utilities', 'essentials', 'zap', 'chart-3', 130),
  (null, 'Transport', 'essentials', 'car', 'chart-4', 140),
  (null, 'Healthcare', 'essentials', 'heart', 'chart-5', 150),
  (null, 'Dining', 'lifestyle', 'utensils', 'chart-1', 210),
  (null, 'Shopping', 'lifestyle', 'shopping-bag', 'chart-2', 220),
  (null, 'Entertainment', 'lifestyle', 'film', 'chart-3', 230),
  (null, 'Travel', 'lifestyle', 'plane', 'chart-4', 240),
  (null, 'Transfer', 'transfer', 'arrow-left-right', 'chart-1', 310),
  (null, 'Investments', 'investment', 'trending-up', 'chart-1', 410),
  (null, 'EMI', 'essentials', 'credit-card', 'chart-5', 160)
on conflict do nothing;

insert into public.budget_templates (name, category_id, share_bps)
select 'Balanced 50/30/20', c.id, v.share_bps
from (values
  ('Rent', 2500),
  ('Groceries', 1000),
  ('Utilities', 500),
  ('Transport', 500),
  ('Healthcare', 500),
  ('Dining', 1000),
  ('Shopping', 1000),
  ('Entertainment', 500),
  ('Travel', 500),
  ('Investments', 2000)
) as v(name, share_bps)
join public.categories c on c.name = v.name and c.user_id is null and c.deleted_at is null
on conflict do nothing;

create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

revoke execute on function public.fn_handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

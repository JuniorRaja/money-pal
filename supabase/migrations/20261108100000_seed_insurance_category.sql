insert into public.categories (user_id, name, kind, icon, color_token, sort_order)
values (null, 'Insurance', 'essentials', 'shield-check', 'chart-5', 170)
on conflict do nothing;
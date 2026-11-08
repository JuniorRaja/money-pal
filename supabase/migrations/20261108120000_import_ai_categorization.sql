alter table public.profiles
  add column if not exists ai_categorization boolean not null default true;
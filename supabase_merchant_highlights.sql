-- ============================================================
-- PROMOCITY — Destaques da loja (tabela dedicada)
-- ============================================================
-- Estratégia nova: usar tabela própria merchant_highlights
-- em vez de coluna jsonb na tabela de perfil.

create table if not exists public.merchant_highlights (
  id uuid primary key,
  merchant_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text null,
  image_url text null,
  price numeric(12,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_merchant_highlights_merchant_user_id
  on public.merchant_highlights (merchant_user_id);

create index if not exists idx_merchant_highlights_created_at
  on public.merchant_highlights (created_at desc);

alter table public.merchant_highlights enable row level security;

drop policy if exists "public_read_highlights" on public.merchant_highlights;
create policy "public_read_highlights"
on public.merchant_highlights
for select
using (true);

drop policy if exists "owner_insert_highlights" on public.merchant_highlights;
create policy "owner_insert_highlights"
on public.merchant_highlights
for insert
with check (auth.uid() = merchant_user_id);

drop policy if exists "owner_update_highlights" on public.merchant_highlights;
create policy "owner_update_highlights"
on public.merchant_highlights
for update
using (auth.uid() = merchant_user_id)
with check (auth.uid() = merchant_user_id);

drop policy if exists "owner_delete_highlights" on public.merchant_highlights;
create policy "owner_delete_highlights"
on public.merchant_highlights
for delete
using (auth.uid() = merchant_user_id);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.merchant_highlights to anon;
grant select, insert, update, delete on public.merchant_highlights to authenticated;
grant all on public.merchant_highlights to service_role;

notify pgrst, 'reload schema';

-- PROMOCITY - Hardening de cadastro (Auth -> public.users)
-- Objetivo: evitar usuário órfão quando o front falhar ao criar perfil.
-- Execute no Supabase SQL Editor.

begin;

-- 1) Garantias de grants mínimos para uso da API
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.users to anon, authenticated;
grant insert, update on table public.users to authenticated, service_role;

-- 2) RLS mínima para leitura/edição do próprio perfil (sem remover lógica existente)
alter table public.users enable row level security;

drop policy if exists "users_select_own_profile" on public.users;
create policy "users_select_own_profile"
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or user_id = auth.uid()
);

drop policy if exists "users_insert_own_profile" on public.users;
create policy "users_insert_own_profile"
on public.users
for insert
to authenticated
with check (
  id = auth.uid()
  or user_id = auth.uid()
);

drop policy if exists "users_update_own_profile" on public.users;
create policy "users_update_own_profile"
on public.users
for update
to authenticated
using (
  id = auth.uid()
  or user_id = auth.uid()
)
with check (
  id = auth.uid()
  or user_id = auth.uid()
);

-- 3) Função de bootstrap de perfil no sign up
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_name text;
  v_phone text;
  v_user_type text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Usuário'
  );

  v_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), '');
  v_user_type := coalesce(nullif(new.raw_user_meta_data ->> 'user_type', ''), 'consumer');

  insert into public.users (
    id,
    user_id,
    name,
    email,
    phone,
    user_type,
    avatar_url,
    favorites,
    created_at,
    business_name,
    business_address,
    business_category,
    business_description,
    business_hours,
    business_store_link,
    latitude,
    longitude
  )
  values (
    new.id,
    new.id,
    v_name,
    new.email,
    v_phone,
    v_user_type,
    null,
    '[]'::jsonb,
    now(),
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 4) Trigger no Auth
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user_profile();

-- 5) Backfill idempotente para usuários já existentes sem perfil
insert into public.users (
  id,
  user_id,
  name,
  email,
  phone,
  user_type,
  avatar_url,
  favorites,
  created_at,
  business_name,
  business_address,
  business_category,
  business_description,
  business_hours,
  business_store_link,
  latitude,
  longitude
)
select
  au.id,
  au.id,
  coalesce(
    nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(au.email, ''), '@', 1),
    'Usuário'
  ) as name,
  au.email,
  nullif(regexp_replace(coalesce(au.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), '') as phone,
  coalesce(nullif(au.raw_user_meta_data ->> 'user_type', ''), 'consumer') as user_type,
  null as avatar_url,
  '[]'::jsonb as favorites,
  coalesce(au.created_at, now()) as created_at,
  null as business_name,
  null as business_address,
  null as business_category,
  null as business_description,
  null as business_hours,
  null as business_store_link,
  null as latitude,
  null as longitude
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
on conflict (id) do nothing;

commit;

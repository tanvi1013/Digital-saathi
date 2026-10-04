create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Senior learner' check (char_length(name) <= 80),
  language text not null default 'en' check (language in ('en', 'hi', 'mr')),
  senior_mode boolean not null default false,
  role text not null default 'senior' check (role in ('senior', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role text not null default 'senior';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('senior', 'admin'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and confrelid = 'auth.users'::regclass
      and contype = 'f'
  ) and not exists (
    select 1 from public.profiles p left join auth.users u on u.id = p.id where u.id is null
  ) then
    alter table public.profiles
      add constraint profiles_id_auth_users_fkey foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

create table if not exists public.lesson_progress (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 100),
  completed_at timestamptz not null default now(),
  primary key (profile_id, lesson_id)
);

create table if not exists public.app_catalog (
  id text primary key check (id = 'default'),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (jsonb_typeof(payload) = 'object')
);

create or replace function public.is_saathi_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.create_saathi_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_language text;
begin
  selected_language := new.raw_user_meta_data ->> 'language';
  if selected_language is null or selected_language not in ('en', 'hi', 'mr') then selected_language := 'en'; end if;

  insert into public.profiles (id, name, language, role)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Senior learner'), 80),
    selected_language,
    'senior'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_saathi on auth.users;
create trigger on_auth_user_created_saathi
  after insert on auth.users
  for each row execute procedure public.create_saathi_profile();

alter table public.profiles enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.app_catalog enable row level security;

drop policy if exists "profile owners and admins can read profiles" on public.profiles;
create policy "profile owners and admins can read profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_saathi_admin()));

drop policy if exists "profile owners can update preferences" on public.profiles;
create policy "profile owners can update preferences"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "learners can read their progress" on public.lesson_progress;
create policy "learners can read their progress"
  on public.lesson_progress for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "learners can add their progress" on public.lesson_progress;
create policy "learners can add their progress"
  on public.lesson_progress for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists "learners can update their progress" on public.lesson_progress;
create policy "learners can update their progress"
  on public.lesson_progress for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "public can read app catalog" on public.app_catalog;
create policy "public can read app catalog"
  on public.app_catalog for select to anon, authenticated
  using (true);

drop policy if exists "admins can update app catalog" on public.app_catalog;
create policy "admins can update app catalog"
  on public.app_catalog for update to authenticated
  using ((select public.is_saathi_admin()))
  with check ((select public.is_saathi_admin()) and updated_by = (select auth.uid()));

revoke all on public.profiles, public.lesson_progress from anon;
revoke all on public.app_catalog from anon;
grant select on public.app_catalog to anon, authenticated;
grant update (payload, updated_at, updated_by) on public.app_catalog to authenticated;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (name, language, senior_mode) on public.profiles to authenticated;
grant select, insert, update on public.lesson_progress to authenticated;

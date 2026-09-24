-- Ride Trainer V5 server progress storage.
-- Run this once in Supabase: SQL Editor -> New query -> Run.
-- Your Supabase publishable/anon key may live in server-config.json.
-- Your private Ride Trainer sync key is entered only in the app on your devices.

create extension if not exists pgcrypto;

create table if not exists public.lesson_progress (
  sync_key_hash text not null,
  lesson_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (sync_key_hash, lesson_id)
);

alter table public.lesson_progress enable row level security;
revoke all on public.lesson_progress from anon, authenticated;

create or replace function public.get_lesson_progress(p_sync_key text, p_lesson_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select lp.data
  from public.lesson_progress lp
  where lp.sync_key_hash = encode(digest(coalesce(p_sync_key, ''), 'sha256'), 'hex')
    and lp.lesson_id = p_lesson_id
  limit 1;
$$;

create or replace function public.set_lesson_progress(p_sync_key text, p_lesson_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(coalesce(p_sync_key, '')) < 20 then
    raise exception 'Sync key is too short';
  end if;

  insert into public.lesson_progress(sync_key_hash, lesson_id, data, updated_at)
  values (
    encode(digest(p_sync_key, 'sha256'), 'hex'),
    p_lesson_id,
    p_data,
    now()
  )
  on conflict (sync_key_hash, lesson_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

grant execute on function public.get_lesson_progress(text, text) to anon, authenticated;
grant execute on function public.set_lesson_progress(text, text, jsonb) to anon, authenticated;

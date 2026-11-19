-- Persistent AI Advisor Chat History (protected by forced single-owner + AAL2 RLS)
-- Stored strictly in Postgres under owner RLS; zero localStorage or unauthenticated access.

create table if not exists public.advisor_threads (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advisor_threads_user_updated_idx
  on public.advisor_threads (user_id, updated_at desc);

alter table public.advisor_threads enable row level security;
alter table public.advisor_threads force row level security;
revoke all on table public.advisor_threads from public, anon;
grant select, insert, update, delete on table public.advisor_threads to authenticated;

create policy "advisor_threads_select_owner" on public.advisor_threads
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "advisor_threads_insert_owner" on public.advisor_threads
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "advisor_threads_update_owner" on public.advisor_threads
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "advisor_threads_delete_owner" on public.advisor_threads
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create table if not exists public.advisor_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id bigint not null references public.advisor_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model text,
  fallback_note text,
  usage jsonb,
  created_at timestamptz not null default now()
);

create index if not exists advisor_messages_thread_created_idx
  on public.advisor_messages (thread_id, created_at asc);

create index if not exists advisor_messages_user_id_idx
  on public.advisor_messages (user_id);

alter table public.advisor_messages enable row level security;
alter table public.advisor_messages force row level security;
revoke all on table public.advisor_messages from public, anon;
grant select, insert, update, delete on table public.advisor_messages to authenticated;

create policy "advisor_messages_select_owner" on public.advisor_messages
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "advisor_messages_insert_owner" on public.advisor_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.can_access_vault())
    and exists (
      select 1 from public.advisor_threads t
      where t.id = thread_id and t.user_id = (select auth.uid())
    )
  );

create policy "advisor_messages_update_owner" on public.advisor_messages
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check (
    (select auth.uid()) = user_id
    and (select private.can_access_vault())
    and exists (
      select 1 from public.advisor_threads t
      where t.id = thread_id and t.user_id = (select auth.uid())
    )
  );

create policy "advisor_messages_delete_owner" on public.advisor_messages
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

grant usage, select on all sequences in schema public to authenticated;

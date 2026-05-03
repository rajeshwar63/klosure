-- =============================================================================
-- Phase 17 — Ask Klo for individual reps
-- =============================================================================
-- Mirrors the Phase 4 manager <> Klo channel, but scoped to a single rep's own
-- pipeline. A rep with 20+ deals shouldn't have to enter every Deal Room to
-- ask "which deals are slipping?" or "what should I focus on today?". This
-- adds a third Klo surface (the first two are per-deal `messages` and
-- team-level `manager_messages`) at a route reachable from the sidebar tab
-- next to "Today" and "Deals".
--
-- Scope is enforced two ways:
--   1. RLS on rep_threads: user_id = auth.uid()
--   2. The klo-rep edge function only loads deals where seller_id = caller
-- =============================================================================

-- ----- Tables ---------------------------------------------------------------

create table if not exists public.rep_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  last_message_at timestamptz default now()
);

create index if not exists rep_threads_user_idx
  on public.rep_threads(user_id, last_message_at desc);

create table if not exists public.rep_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.rep_threads(id) on delete cascade,
  sender text not null check (sender in ('rep', 'klo')),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists rep_messages_thread_idx
  on public.rep_messages(thread_id, created_at);

-- ----- RLS ------------------------------------------------------------------

alter table public.rep_threads enable row level security;
alter table public.rep_messages enable row level security;

-- REP THREADS — only the owning rep can read/write their own threads.
drop policy if exists "rep_threads owner all" on public.rep_threads;
create policy "rep_threads owner all" on public.rep_threads
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- REP MESSAGES — gated through the parent thread (matches manager_messages).
drop policy if exists "rep_messages owner read" on public.rep_messages;
create policy "rep_messages owner read" on public.rep_messages
  for select using (
    exists (
      select 1 from public.rep_threads rt
      where rt.id = thread_id and rt.user_id = auth.uid()
    )
  );

drop policy if exists "rep_messages owner insert" on public.rep_messages;
create policy "rep_messages owner insert" on public.rep_messages
  for insert with check (
    exists (
      select 1 from public.rep_threads rt
      where rt.id = thread_id and rt.user_id = auth.uid()
    )
  );

-- ----- Realtime -------------------------------------------------------------
-- Without this, the panel's INSERT subscription on rep_messages never fires
-- and Klo's reply only appears on page refresh.
do $$
begin
  alter publication supabase_realtime add table public.rep_messages;
exception when duplicate_object then null;
end $$;

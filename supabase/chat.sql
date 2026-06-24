-- Run this in Supabase SQL Editor AFTER the main schema.sql
-- Adds chat threads and messages tables

create table public.chat_threads (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade not null,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  title        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table public.chat_messages (
  id                  uuid primary key default gen_random_uuid(),
  thread_id           uuid references public.chat_threads(id) on delete cascade not null,
  role                text not null check (role in ('user', 'assistant')),
  content             text not null,
  suggested_followups jsonb not null default '[]',
  created_at          timestamptz default now()
);

create trigger trg_chat_threads_updated
  before update on public.chat_threads
  for each row execute procedure public.handle_updated_at();

-- RLS
alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_threads_all" on public.chat_threads
  using (public.is_household_member(household_id));

create policy "chat_messages_all" on public.chat_messages
  using (
    exists (
      select 1 from public.chat_threads t
      where t.id = thread_id
        and public.is_household_member(t.household_id)
    )
  );

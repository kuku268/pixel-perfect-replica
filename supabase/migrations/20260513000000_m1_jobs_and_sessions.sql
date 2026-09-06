-- M1 schema: jobs + job_sessions (TXT-only, no SRT/VTT/reviewed)

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  video_source_url text not null,
  topic text,
  language text not null default 'zh',
  status text not null default 'pending'
    check (status in ('pending', 'downloading', 'transcribe', 'done')),
  current_session_id uuid
);

create table public.job_sessions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  session_number int not null default 1,
  created_at timestamptz not null default now(),
  subtitle_txt_content text
);

alter table public.jobs
  add constraint fk_current_session
  foreign key (current_session_id) references public.job_sessions(id);

-- RLS: users only see their own jobs + sessions.
-- The worker connects with the Supabase Secret key (sb_secret_*) and bypasses RLS.
alter table public.jobs enable row level security;
alter table public.job_sessions enable row level security;

create policy "users read own jobs" on public.jobs
  for select using (auth.uid() = user_id);

create policy "users insert own jobs" on public.jobs
  for insert with check (auth.uid() = user_id);

create policy "users read own sessions" on public.job_sessions
  for select using (
    exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid())
  );

-- Adds the AI summary produced on demand from job_sessions.subtitle_txt_content.
-- Nullable: existing rows (and any job whose owner never asks for a summary)
-- simply stay empty. Read access rides on the existing
-- "users read own sessions" RLS policy; writes go through the API route with
-- the Supabase secret key, same as the transcript.
alter table public.job_sessions
  add column summary_content text;

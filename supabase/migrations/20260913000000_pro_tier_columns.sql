-- Pro tier (Step 1): additive schema for business-tier jobs, speaker
-- diarization, in-browser editing, local uploads. No column is dropped or
-- renamed and every new column is nullable or defaulted, so the M4 web app
-- and worker keep running unchanged on this schema. Down file:
-- 20260913000000_pro_tier_columns_down.sql
--
-- Safe to re-run (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS everywhere).

-- 1. jobs: tier, requested formats, unlock lineage, audio retention, source
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS formats text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parent_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS speakers_expected int,
  ADD COLUMN IF NOT EXISTS audio_key text,
  ADD COLUMN IF NOT EXISTS edit_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'url',
  ADD COLUMN IF NOT EXISTS upload_key text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_tier_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_tier_check
  CHECK (tier IN ('standard', 'pro'));

-- formats may only contain the three business-tier outputs (any subset, any order)
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_formats_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_formats_check
  CHECK (formats <@ ARRAY['docx', 'pdf', 'srt']::text[]);

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_speakers_expected_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_speakers_expected_check
  CHECK (speakers_expected IS NULL OR speakers_expected BETWEEN 1 AND 20);

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_kind_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_source_kind_check
  CHECK (source_kind IN ('url', 'upload'));

-- 'failed' = worker gave up (bad media, engine error). Never charged.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('pending', 'downloading', 'transcribe', 'done',
                    'insufficient_credits', 'failed'));

-- unlock child jobs are looked up by parent; the audio reaper scans by deadline
CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id
  ON public.jobs (parent_job_id) WHERE parent_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_audio_reaper
  ON public.jobs (edit_deadline) WHERE audio_key IS NOT NULL;

-- 2. job_sessions: structured transcript + speaker map + user edits
--   segments : [{i, start, end, text, speaker}]           (worker writes once)
--   speakers : {"A": {"name": "...", "color": "#..."}, …}  (user edits)
--   overrides: {"12": {"speaker": "B", "text": "...", "start": 1.2, "end": 3.4}}
--   engine   : 'whisper-1' | 'whisper-1+assemblyai'        (what produced segments)
ALTER TABLE public.job_sessions
  ADD COLUMN IF NOT EXISTS segments jsonb,
  ADD COLUMN IF NOT EXISTS speakers jsonb,
  ADD COLUMN IF NOT EXISTS overrides jsonb,
  ADD COLUMN IF NOT EXISTS engine text;

-- 3. ledger: post-hoc unlock is its own transaction type
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('purchase', 'deduction', 'signup_bonus', 'admin_grant', 'pro_unlock'));

-- RLS: unchanged. All writes still go through the admin client in API routes /
-- the worker's secret key; users keep SELECT on their own rows, and the new
-- columns are covered by the existing row-level policies.

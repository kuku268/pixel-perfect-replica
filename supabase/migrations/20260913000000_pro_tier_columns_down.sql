-- DOWN for 20260913000000_pro_tier_columns.sql
-- Run only if the pro tier is being fully backed out. The M4 code never reads
-- these columns, so leaving them in place is also a valid "rollback".
-- Data note: rows that only make sense with the new schema are folded back
-- into M4 vocabulary rather than deleted (nothing here drops a row).

-- 1. ledger: pro_unlock rows become plain deductions, then restore the M2 CHECK
UPDATE public.credit_transactions SET type = 'deduction' WHERE type = 'pro_unlock';
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('purchase', 'deduction', 'signup_bonus', 'admin_grant'));

-- 2. job_sessions
ALTER TABLE public.job_sessions
  DROP COLUMN IF EXISTS segments,
  DROP COLUMN IF EXISTS speakers,
  DROP COLUMN IF EXISTS overrides,
  DROP COLUMN IF EXISTS engine;

-- 3. jobs: 'failed' was never charged, same as insufficient_credits — map it
--    there so the M2 CHECK can be restored, then drop the columns.
UPDATE public.jobs SET status = 'insufficient_credits' WHERE status = 'failed';
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('pending', 'downloading', 'transcribe', 'done', 'insufficient_credits'));

DROP INDEX IF EXISTS public.idx_jobs_parent_job_id;
DROP INDEX IF EXISTS public.idx_jobs_audio_reaper;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_tier_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_formats_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_speakers_expected_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_kind_check;

ALTER TABLE public.jobs
  DROP COLUMN IF EXISTS tier,
  DROP COLUMN IF EXISTS formats,
  DROP COLUMN IF EXISTS parent_job_id,
  DROP COLUMN IF EXISTS speakers_expected,
  DROP COLUMN IF EXISTS audio_key,
  DROP COLUMN IF EXISTS edit_deadline,
  DROP COLUMN IF EXISTS exported_at,
  DROP COLUMN IF EXISTS source_kind,
  DROP COLUMN IF EXISTS upload_key,
  DROP COLUMN IF EXISTS original_filename,
  DROP COLUMN IF EXISTS error_message;

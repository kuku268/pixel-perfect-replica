-- M4: idempotency column for the serverless distributor.
-- The Lambda only spawns sessions WHERE fargate_task_arn IS NULL and stamps
-- the ECS task ARN right after RunTask, so a stateless once-a-minute tick
-- never launches the same job twice.
alter table public.job_sessions add column if not exists fargate_task_arn text;

create index if not exists idx_job_sessions_unspawned
  on public.job_sessions (id) where fargate_task_arn is null;

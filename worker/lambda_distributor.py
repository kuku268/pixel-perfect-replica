"""
M4 distributor: replaces distributor.py's EC2 poll loop.

EventBridge fires this Lambda every minute. One pass:

  1. SELECT jobs WHERE status='pending'
  2. for each: make sure a job_sessions row exists AND jobs.current_session_id
     points at it (_ensure_session — the link is the easy-to-miss part)
  3. skip sessions that already carry a fargate_task_arn (idempotency — this
     Lambda is stateless, so the DB column is the only memory it has)
  4. ecs:RunTask one Fargate task for the job, forwarding the three creds
     worker.py needs as container env
  5. stamp job_sessions.fargate_task_arn so the next tick skips it

Imports only boto3 + supabase. It never calls OpenAI itself — it forwards
OPENAI_API_KEY to the Fargate task, which does the work.

Deployed via `aws lambda create-function` from handler.zip (record-only in git:
pushing this file does not deploy it — see the m4-serverless skill, Step 5).
"""

import os
import sys

import boto3
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

ECS_CLUSTER = os.environ["ECS_CLUSTER"]
TASK_DEFINITION = os.environ["TASK_DEFINITION"]
SUBNETS = [s for s in os.environ["SUBNETS"].split(",") if s]
SECURITY_GROUPS = [s for s in os.environ.get("SECURITY_GROUPS", "").split(",") if s]
CONTAINER_NAME = os.environ.get("CONTAINER_NAME", "worker")

# Cost guard: a bug that leaves jobs 'pending' forever must not fan out into
# dozens of Fargate tasks per minute. Raise via env once real traffic needs it.
MAX_SPAWN_PER_TICK = int(os.environ.get("MAX_SPAWN_PER_TICK", "10"))

db = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
ecs = boto3.client("ecs")


def _log(msg: str) -> None:
    print(msg, flush=True)


def _ensure_session(job_id: str) -> str:
    """Return the job's current session id, creating + LINKING one if missing.

    POST /api/jobs creates both rows and sets the link, so production jobs
    already have current_session_id. Direct-INSERT test jobs may not — and a
    null current_session_id crashes worker.py at its first update_session().
    """
    job = (
        db.table("jobs")
        .select("current_session_id")
        .eq("id", job_id)
        .single()
        .execute()
        .data
    )
    if job and job.get("current_session_id"):
        return job["current_session_id"]

    row = (
        db.table("job_sessions")
        .insert({"job_id": job_id, "session_number": 1})
        .execute()
        .data[0]
    )
    db.table("jobs").update({"current_session_id": row["id"]}).eq("id", job_id).execute()
    _log(f"[{job_id}] created + linked session {row['id']}")
    return row["id"]


def _session_task_arn(session_id: str) -> str | None:
    row = (
        db.table("job_sessions")
        .select("fargate_task_arn")
        .eq("id", session_id)
        .single()
        .execute()
        .data
    )
    return (row or {}).get("fargate_task_arn")


def _run_task(job_id: str) -> str:
    net = {"subnets": SUBNETS, "assignPublicIp": "ENABLED"}
    if SECURITY_GROUPS:
        net["securityGroups"] = SECURITY_GROUPS

    resp = ecs.run_task(
        cluster=ECS_CLUSTER,
        taskDefinition=TASK_DEFINITION,
        launchType="FARGATE",
        count=1,
        startedBy=f"distributor:{job_id[:8]}",
        networkConfiguration={"awsvpcConfiguration": net},
        overrides={
            "containerOverrides": [
                {
                    "name": CONTAINER_NAME,
                    "environment": [
                        {"name": "JOB_ID", "value": job_id},
                        {"name": "SUPABASE_URL", "value": SUPABASE_URL},
                        {"name": "SUPABASE_SECRET_KEY", "value": SUPABASE_SECRET_KEY},
                        {"name": "OPENAI_API_KEY", "value": OPENAI_API_KEY},
                    ],
                }
            ]
        },
    )
    if resp.get("failures"):
        raise RuntimeError(f"RunTask failed: {resp['failures']}")
    return resp["tasks"][0]["taskArn"]


def spawn_pending() -> dict:
    pending = db.table("jobs").select("id").eq("status", "pending").execute().data
    spawned, skipped, errors = 0, 0, 0

    for job in pending:
        job_id = job["id"]
        if spawned >= MAX_SPAWN_PER_TICK:
            _log(f"cap reached ({MAX_SPAWN_PER_TICK}/tick) — {len(pending) - spawned - skipped} left for next tick")
            break
        try:
            session_id = _ensure_session(job_id)
            if _session_task_arn(session_id):
                skipped += 1
                continue
            arn = _run_task(job_id)
            db.table("job_sessions").update({"fargate_task_arn": arn}).eq("id", session_id).execute()
            spawned += 1
            _log(f"[{job_id}] spawned {arn}")
        except Exception as e:  # one bad job must not block the others
            errors += 1
            _log(f"[{job_id}] ERROR {e}")

    summary = {"pending": len(pending), "spawned": spawned, "skipped": skipped, "errors": errors}
    _log(f"tick {summary}")
    return summary


def handler(event, context):
    return spawn_pending()


if __name__ == "__main__":  # local smoke test: python lambda_distributor.py
    sys.exit(0 if spawn_pending()["errors"] == 0 else 1)

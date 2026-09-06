"""
M1 distributor: polls jobs.status='pending' every 10 s and spawns one
worker.py process per pending job. The worker flips the row to 'downloading'
as its first action, so the next poll skips it.

SUPABASE_URL + SUPABASE_SECRET_KEY come from AWS Secrets Manager — same auth
model as worker.py, via the EC2's IAM instance profile.

Known limitation, accepted for M1: if worker.py dies before flipping the row to
'downloading', the next poll spawns another worker for the same job. M4 fixes
this with Lambda + Fargate and ARN-based idempotency.
"""

import os
import subprocess
import sys
import time
from pathlib import Path

import boto3
from supabase import create_client


def _load_secrets() -> dict[str, str]:
    sm = boto3.client("secretsmanager")
    return {
        "SUPABASE_URL": sm.get_secret_value(SecretId="supabase-url")["SecretString"],
        "SUPABASE_SECRET_KEY": sm.get_secret_value(SecretId="supabase-secret-key")["SecretString"],
    }


_secrets = _load_secrets()
db = create_client(_secrets["SUPABASE_URL"], _secrets["SUPABASE_SECRET_KEY"])

WORKER = Path(__file__).parent / "worker.py"
PYTHON = sys.executable  # the venv interpreter this process is running under


def poll_once() -> None:
    rows = db.table("jobs").select("id").eq("status", "pending").execute().data
    for row in rows:
        env = {**os.environ, "JOB_ID": row["id"]}
        subprocess.Popen([PYTHON, str(WORKER)], env=env)
        print(f"spawned worker for job {row['id']}", flush=True)


def main() -> None:
    print("distributor: polling every 10s. Ctrl+C to stop.", flush=True)
    while True:
        try:
            poll_once()
        except Exception as e:
            print(f"poll error: {e}", file=sys.stderr, flush=True)
        time.sleep(10)


if __name__ == "__main__":
    main()

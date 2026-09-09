"""
M1/M2 worker: handles one job — downloads the media, runs Whisper, writes the
TXT back to job_sessions.subtitle_txt_content, and (M2) meters credits:
1 credit per started minute, checked before Whisper and deducted on done.

Reads JOB_ID from env. Two launch paths share this file unchanged:

  M1  distributor.py spawns one Popen per pending job on the EC2. Credentials
      come from AWS Secrets Manager via the instance profile.
  M4  lambda_distributor.py launches one Fargate task per pending job and
      injects OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SECRET_KEY as container
      env (containerOverrides). The Fargate task role is deliberately minimal
      (no secretsmanager:GetSecretValue), so env must win when present.

_load_secrets() is therefore env-first with a Secrets Manager fallback: the same
image runs in both places, and no credentials ever live on disk either way.
"""

import math
import os
import subprocess
import sys
import tempfile
import traceback
from datetime import datetime, timezone
from pathlib import Path

import boto3
from openai import OpenAI
from supabase import create_client


def _get_secret(client, name: str) -> str:
    return client.get_secret_value(SecretId=name)["SecretString"]


SECRET_KEYS = ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY")


def _load_secrets() -> dict[str, str]:
    # M4 / Fargate: the Lambda distributor injected all three as env vars.
    if all(os.environ.get(k) for k in SECRET_KEYS):
        return {k: os.environ[k] for k in SECRET_KEYS}
    # M1 / EC2: read them from Secrets Manager via the instance profile.
    sm = boto3.client("secretsmanager")
    return {
        "OPENAI_API_KEY": _get_secret(sm, "openai-api-key"),
        "SUPABASE_URL": _get_secret(sm, "supabase-url"),
        "SUPABASE_SECRET_KEY": _get_secret(sm, "supabase-secret-key"),
    }


_secrets = _load_secrets()
db = create_client(_secrets["SUPABASE_URL"], _secrets["SUPABASE_SECRET_KEY"])
openai_client = OpenAI(api_key=_secrets["OPENAI_API_KEY"])

# Whisper rejects uploads over 25 MB. 10 minutes of 64 kbps mono mp3 is ~4.8 MB,
# so 600-second chunks stay well clear of the limit.
CHUNK_SECONDS = 600

# Whisper accepts a prompt (~224 tokens) that biases decoding toward the spelling
# and vocabulary it contains. Without it, near-homophones of product names come
# out wrong and stay wrong all the way through to the summary — a real run
# transcribed "Claude Code" as "Cloud Code" seventeen times.
#
# The user's own Topic field is the better hint, so it goes first; this list is
# the fallback for when they leave it blank.
DEFAULT_WHISPER_PROMPT = (
    "Claude Code, Anthropic, GitHub Copilot, Google Jules, Cursor, OpenAI, "
    "codebase, repository, snippet, context window, embedding, prompt, agent"
)

# The API caps the prompt at 224 tokens and silently ignores the overflow.
MAX_PROMPT_CHARS = 600


def _utc_now() -> str:
    # PostgREST sends this straight into the UPDATE, so it has to be a real
    # timestamp literal. The string "now()" is NOT valid Postgres input and
    # fails with 'invalid input syntax for type timestamp with time zone'.
    return datetime.now(timezone.utc).isoformat()


def get_job(job_id: str) -> dict:
    return db.table("jobs").select("*").eq("id", job_id).single().execute().data


def update_job(job_id: str, **fields) -> None:
    db.table("jobs").update({**fields, "updated_at": _utc_now()}).eq("id", job_id).execute()


def update_session(session_id: str, **fields) -> None:
    db.table("job_sessions").update(fields).eq("id", session_id).execute()


def download_video(url: str, dest_dir: Path) -> Path:
    """yt-dlp for URLs; pass through for local file paths."""
    if url.startswith(("http://", "https://")):
        out_template = str(dest_dir / "video.%(ext)s")
        subprocess.run(["yt-dlp", "-o", out_template, url], check=True)
        return next(dest_dir.glob("video.*"))
    return Path(url).expanduser().resolve()


def to_mp3(video_path: Path, dest_dir: Path) -> Path:
    """Any container -> 64 kbps mono 16 kHz mp3, which is what Whisper likes."""
    mp3 = dest_dir / "audio.mp3"
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-ac", "1",
            "-ar", "16000", "-ab", "64k",
            "-acodec", "libmp3lame",
            str(mp3),
        ],
        check=True,
        capture_output=True,
    )
    return mp3


def get_duration_seconds(audio_path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(out.stdout.strip())


# ---- M2: credit metering -------------------------------------------------

def minutes_from_seconds(seconds: float) -> int:
    # Always round UP, minimum 1: a 61-second clip is 2 credits. Never round
    # down or users can game it with just-under-60s clips.
    return max(1, math.ceil(seconds / 60))


def probe_duration_minutes_cheap(video_url: str) -> int | None:
    """Duration WITHOUT downloading, via the source's manifest.

    Returns None when the source doesn't expose it — yt-dlp prints the literal
    string 'NA' for direct mp4/mp3 URLs (CloudFront, S3, archive.org files).
    float('NA') would raise and crash the worker, so None means "decide after
    download with ffprobe", not an error.
    """
    if not video_url.startswith(("http://", "https://")):
        return None
    try:
        out = subprocess.run(
            ["yt-dlp", "--print", "duration", "--no-warnings", "--no-download", video_url],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.strip()
    except (subprocess.SubprocessError, OSError):
        return None
    if not out or out.upper() == "NA":
        return None
    try:
        return minutes_from_seconds(float(out))
    except ValueError:
        return None


def get_balance(user_id: str) -> float:
    row = db.table("profiles").select("credits_balance").eq("id", user_id).single().execute().data
    return float(row["credits_balance"])


def mark_insufficient(job_id: str, user_id: str, minutes: int, balance: float) -> None:
    """Terminal state: no Whisper call, nothing deducted, one zero-amount ledger
    row so the user can see WHY in /credits history."""
    update_job(job_id, status="insufficient_credits")
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": 0,
        "type": "deduction",
        "description": f"Insufficient credits: video is {minutes} min, you have {int(balance)}",
        "job_id": job_id,
    }).execute()
    print(f"[{job_id}] insufficient_credits — needs {minutes}, has {int(balance)}", flush=True)


def deduct_credits(job_id: str, user_id: str, minutes: int) -> None:
    """Ledger row first (source of truth), then the derived balance.
    Read-then-write is acceptable for M2: the distributor runs one worker per
    job, so the same user is never deducted concurrently."""
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": -minutes,
        "type": "deduction",
        "description": f"Transcribed {minutes} min video",
        "job_id": job_id,
    }).execute()
    new_balance = max(0.0, get_balance(user_id) - minutes)
    db.table("profiles").update({"credits_balance": new_balance}).eq("id", user_id).execute()
    print(f"[{job_id}] deducted {minutes} credit(s) — balance now {int(new_balance)}", flush=True)


def split_chunks(mp3_path: Path, dest_dir: Path) -> list[Path]:
    duration = get_duration_seconds(mp3_path)
    n_chunks = max(1, math.ceil(duration / CHUNK_SECONDS))
    chunks = []
    for i in range(n_chunks):
        chunk = dest_dir / f"chunk_{i:03d}.mp3"
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(mp3_path),
                "-ss", str(i * CHUNK_SECONDS),
                "-t", str(CHUNK_SECONDS),
                "-acodec", "libmp3lame",
                "-ab", "64k",
                str(chunk),
            ],
            check=True,
            capture_output=True,
        )
        chunks.append(chunk)
    return chunks


def build_whisper_prompt(topic: str | None) -> str:
    """Topic first (it is specific to this video), then the standing glossary."""
    parts = [p.strip() for p in (topic, DEFAULT_WHISPER_PROMPT) if p and p.strip()]
    return ", ".join(parts)[:MAX_PROMPT_CHARS]


def transcribe_chunk(chunk_path: Path, language: str, prompt: str) -> str:
    with open(chunk_path, "rb") as f:
        return openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text",
            language=language,
            prompt=prompt,
        )


def main() -> None:
    job_id = os.environ["JOB_ID"]
    job = get_job(job_id)
    session_id = job["current_session_id"]

    # Claim FIRST. If anything below crashes, the job sits in 'downloading'
    # instead of 'pending', so the distributor doesn't respawn it in a loop.
    update_job(job_id, status="downloading")
    print(f"[{job_id}] downloading {job['video_source_url']}", flush=True)

    user_id = job["user_id"]
    balance = get_balance(user_id)

    # Gate 1 (free): manifest-based duration, no bytes downloaded.
    minutes = probe_duration_minutes_cheap(job["video_source_url"])
    if minutes is not None and minutes > balance:
        mark_insufficient(job_id, user_id, minutes, balance)
        return

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        video = download_video(job["video_source_url"], tmp_path)
        mp3 = to_mp3(video, tmp_path)

        # Gate 2 (precise): ffprobe on the actual audio. Also covers the 'NA'
        # case where Gate 1 couldn't read a duration.
        minutes = minutes_from_seconds(get_duration_seconds(mp3))
        if minutes > balance:
            mark_insufficient(job_id, user_id, minutes, balance)
            return

        update_job(job_id, status="transcribe")
        chunks = split_chunks(mp3, tmp_path)
        print(f"[{job_id}] transcribing {len(chunks)} chunk(s) — {minutes} credit(s)", flush=True)

        prompt = build_whisper_prompt(job.get("topic"))
        full_text = "\n\n".join(
            transcribe_chunk(c, job["language"], prompt) for c in chunks
        )

        update_session(session_id, subtitle_txt_content=full_text)
        # Deduct only on success: a failed job (any exception above) costs nothing.
        deduct_credits(job_id, user_id, minutes)
        update_job(job_id, status="done")

    print(f"[{job_id}] done — {len(full_text)} chars", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # There is still no 'error' status (jobs.status allows pending /
        # downloading / transcribe / done / insufficient_credits) and no retry.
        # A failed job just stops moving — and is never charged — so make the
        # reason loud in /var/log/m1-distributor.log.
        print(f"[{os.environ.get('JOB_ID', '?')}] FAILED", file=sys.stderr, flush=True)
        traceback.print_exc()
        sys.exit(1)

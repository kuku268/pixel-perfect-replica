"""
Worker: handles one job — fetches the media, runs Whisper (and, for the
business tier, AssemblyAI speaker labels), writes the transcript back to
job_sessions, and meters credits.

Launch: lambda_distributor.py runs one Fargate task per pending job and injects
JOB_ID / OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SECRET_KEY as container env.
Everything else comes from the task definition's env (see step 2 notes):

  PRO_TIER_ENABLED        "true" to run the AssemblyAI branch for tier='pro'
                          jobs. Default "false" = a pro job is FAILED, never
                          silently downgraded and charged.
  AUDIO_BUCKET            S3 bucket holding uploads/* (browser uploads) and
                          audio/* (pro-tier mp3 kept for the 3-day edit window)
  PRO_CREDITS_PER_MINUTE  credits per started minute for tier='pro' (default 2;
                          standard is always 1). A post-hoc unlock (child job
                          with parent_job_id) charges the DIFFERENCE.
  AUDIO_RETENTION_DAYS    edit window after a pro job finishes (default 3)

Secrets: OpenAI / Supabase arrive as env from the Lambda; the AssemblyAI key is
read from Secrets Manager `assemblyai-api-key` on demand (task role policy
worker-secrets-read) so the Lambda needs no change for the pro tier.

Outcomes (jobs.status):
  done                  charged
  insufficient_credits  not charged (zero-amount ledger row explains why)
  failed                not charged; jobs.error_message says what broke.
                        Bad uploads (not a media file) land here too.
Whatever the outcome, a browser-uploaded original in uploads/ is deleted
before the task exits — the only copy we keep is the pro-tier mp3, and only
until export or the edit deadline.
"""

from __future__ import annotations

import math
import os
import subprocess
import sys
import tempfile
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from openai import OpenAI
from supabase import create_client

from align import assign_speakers, speaker_map
from punctuate import needs_punctuation, punctuate
from transcribe_assemblyai import diarize
from transcribe_whisper import CHUNK_SECONDS, segments_to_text, transcribe_chunks


# ---- config / secrets ------------------------------------------------------

def _get_secret(client, name: str) -> str:
    return client.get_secret_value(SecretId=name)["SecretString"]


SECRET_KEYS = ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY")


def _load_secrets() -> dict[str, str]:
    # Fargate: the Lambda distributor injected all three as env vars.
    if all(os.environ.get(k) for k in SECRET_KEYS):
        return {k: os.environ[k] for k in SECRET_KEYS}
    # EC2 fallback (M1): read them from Secrets Manager via the instance profile.
    sm = boto3.client("secretsmanager")
    return {
        "OPENAI_API_KEY": _get_secret(sm, "openai-api-key"),
        "SUPABASE_URL": _get_secret(sm, "supabase-url"),
        "SUPABASE_SECRET_KEY": _get_secret(sm, "supabase-secret-key"),
    }


def _assemblyai_key() -> str:
    """Only fetched when a pro job actually needs it."""
    if os.environ.get("ASSEMBLYAI_API_KEY"):
        return os.environ["ASSEMBLYAI_API_KEY"]
    return _get_secret(boto3.client("secretsmanager"), "assemblyai-api-key")


def _flag(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in {"1", "true", "yes", "on"}


PRO_TIER_ENABLED = _flag("PRO_TIER_ENABLED")
AUDIO_BUCKET = os.environ.get("AUDIO_BUCKET", "videoreader-artifacts-134580876888")
PRO_CREDITS_PER_MINUTE = int(os.environ.get("PRO_CREDITS_PER_MINUTE", "2"))
STANDARD_CREDITS_PER_MINUTE = 1
AUDIO_RETENTION_DAYS = int(os.environ.get("AUDIO_RETENTION_DAYS", "3"))

_secrets = _load_secrets()
db = create_client(_secrets["SUPABASE_URL"], _secrets["SUPABASE_SECRET_KEY"])
openai_client = OpenAI(api_key=_secrets["OPENAI_API_KEY"])
s3 = boto3.client("s3")

# Whisper accepts a prompt (~224 tokens) that biases decoding toward the spelling
# and vocabulary it contains. Without it, near-homophones of product names come
# out wrong and stay wrong all the way through to the summary — a real run
# transcribed "Claude Code" as "Cloud Code" seventeen times.
#
# The prompt ALSO sets the punctuation style: Whisper copies whatever the prompt
# does, and a comma-separated English glossary taught it to write Chinese with
# spaces and no punctuation at all. So the prompt now opens with one natural
# sentence in the job's language, fully punctuated (Traditional Chinese for
# zh/auto), then the user's Topic, then the standing glossary.
DEFAULT_WHISPER_PROMPT = (
    "Claude Code, Anthropic, GitHub Copilot, Google Jules, Cursor, OpenAI, "
    "codebase, repository, snippet, context window, embedding, prompt, agent"
)

PROMPT_PREFIX = {
    "zh": "大家好，歡迎收看今天的節目。我們今天要聊的主題是：",
    "en": "Hello, and welcome to the show. Today we're talking about: ",
    "ja": "皆さん、こんにちは。今日のテーマは、",
}

# The API caps the prompt at 224 tokens and silently ignores the overflow.
MAX_PROMPT_CHARS = 600


class BadMediaError(RuntimeError):
    """The uploaded bytes are not something ffmpeg can read as audio/video."""


class ProTierDisabled(RuntimeError):
    """A tier='pro' job reached a worker with PRO_TIER_ENABLED=false."""


# ---- db helpers ------------------------------------------------------------

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    # PostgREST sends this straight into the UPDATE, so it has to be a real
    # timestamp literal. The string "now()" is NOT valid Postgres input.
    return dt.isoformat()


def get_job(job_id: str) -> dict:
    return db.table("jobs").select("*").eq("id", job_id).single().execute().data


def update_job(job_id: str, **fields) -> None:
    db.table("jobs").update({**fields, "updated_at": _iso(_utc_now())}).eq("id", job_id).execute()


def update_session(session_id: str, **fields) -> None:
    db.table("job_sessions").update(fields).eq("id", session_id).execute()


def get_balance(user_id: str) -> float:
    row = db.table("profiles").select("credits_balance").eq("id", user_id).single().execute().data
    return float(row["credits_balance"])


# ---- media -----------------------------------------------------------------

def download_video(url: str, dest_dir: Path) -> Path:
    """yt-dlp for URLs; pass through for local file paths."""
    if url.startswith(("http://", "https://")):
        out_template = str(dest_dir / "video.%(ext)s")
        subprocess.run(["yt-dlp", "-o", out_template, url], check=True)
        return next(dest_dir.glob("video.*"))
    return Path(url).expanduser().resolve()


def download_s3(key: str, dest: Path) -> Path:
    s3.download_file(AUDIO_BUCKET, key, str(dest))
    return dest


def delete_s3(key: str | None) -> None:
    if not key:
        return
    try:
        s3.delete_object(Bucket=AUDIO_BUCKET, Key=key)
    except Exception as e:  # never let cleanup mask the real outcome
        print(f"warn: could not delete s3://{AUDIO_BUCKET}/{key}: {e}", flush=True)


def probe_is_media(path: Path) -> bool:
    """True when ffprobe sees at least one audio stream. A renamed text file,
    an executable, a PDF — anything that is not really media — fails here
    BEFORE ffmpeg ever decodes it."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=codec_type",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=False, capture_output=True, text=True, timeout=60,
    )
    return out.returncode == 0 and "audio" in out.stdout


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


def build_whisper_prompt(topic: str | None, language: str | None = None) -> str:
    """A punctuated opening sentence in the job's language, then the Topic
    (specific to this video), then the standing glossary.

    zh and auto both get the Traditional-Chinese opener: KO's recordings are
    Mandarin with English terms mixed in, and the opener is what makes Whisper
    emit 「，。？」 instead of space-separated runs.
    """
    lang = (language or "auto").strip().lower()
    key = "zh" if lang in ("zh", "auto", "") else (lang if lang in PROMPT_PREFIX else "en")
    cjk = key in ("zh", "ja")
    parts = [p.strip() for p in (topic, DEFAULT_WHISPER_PROMPT) if p and p.strip()]
    body = ("、" if cjk else ", ").join(parts)
    return (PROMPT_PREFIX[key] + body + ("。" if cjk else "."))[:MAX_PROMPT_CHARS]


# ---- credits ---------------------------------------------------------------

def minutes_from_seconds(seconds: float) -> int:
    # Always round UP, minimum 1: a 61-second clip is 2 credits. Never round
    # down or users can game it with just-under-60s clips.
    return max(1, math.ceil(seconds / 60))


def probe_duration_minutes_cheap(video_url: str) -> int | None:
    """Duration WITHOUT downloading, via the source's manifest.

    Returns None when the source doesn't expose it — yt-dlp prints the literal
    string 'NA' for direct mp4/mp3 URLs (CloudFront, S3, archive.org files).
    """
    if not video_url.startswith(("http://", "https://")):
        return None
    try:
        out = subprocess.run(
            ["yt-dlp", "--print", "duration", "--no-warnings", "--no-download", video_url],
            check=False, capture_output=True, text=True, timeout=30,
        ).stdout.strip()
    except (subprocess.SubprocessError, OSError):
        return None
    if not out or out.upper() == "NA":
        return None
    try:
        return minutes_from_seconds(float(out))
    except ValueError:
        return None


def mark_insufficient(job_id: str, user_id: str, minutes: int, cost: int, balance: float) -> None:
    """Terminal state: no engine call, nothing deducted, one zero-amount ledger
    row so the user can see WHY in /credits history."""
    update_job(job_id, status="insufficient_credits")
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": 0,
        "type": "deduction",
        "description": f"Insufficient credits: video is {minutes} min ({cost} credits), you have {int(balance)}",
        "job_id": job_id,
    }).execute()
    print(f"[{job_id}] insufficient_credits — needs {cost}, has {int(balance)}", flush=True)


def deduct_credits(job_id: str, user_id: str, minutes: int, cost: int, tx_type: str, label: str) -> None:
    """Ledger row first (source of truth), then the derived balance.
    Read-then-write is acceptable: one worker per job, and the same user is
    never deducted concurrently in practice."""
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": -cost,
        "type": tx_type,
        "description": f"{label} {minutes} min video",
        "job_id": job_id,
    }).execute()
    new_balance = max(0.0, get_balance(user_id) - cost)
    db.table("profiles").update({"credits_balance": new_balance}).eq("id", user_id).execute()
    print(f"[{job_id}] deducted {cost} credit(s) — balance now {int(new_balance)}", flush=True)


# ---- the job ---------------------------------------------------------------

def plan_job(job: dict) -> dict:
    """Decide tier / rate / source once, up front."""
    parent = get_job(job["parent_job_id"]) if job.get("parent_job_id") else None
    is_pro = job.get("tier") == "pro"
    if is_pro and not PRO_TIER_ENABLED:
        raise ProTierDisabled("business tier is not enabled on this worker")

    if parent:
        # post-hoc unlock: the user already paid the standard rate on the
        # parent, so charge only the difference and reuse the parent's audio.
        rate = max(0, PRO_CREDITS_PER_MINUTE - STANDARD_CREDITS_PER_MINUTE)
        tx_type, label = "pro_unlock", "Unlocked business tier for"
    elif is_pro:
        rate = PRO_CREDITS_PER_MINUTE
        tx_type, label = "deduction", "Transcribed (business)"
    else:
        rate = STANDARD_CREDITS_PER_MINUTE
        tx_type, label = "deduction", "Transcribed"

    if parent and parent.get("audio_key"):
        source = ("audio", parent["audio_key"])
    elif parent and parent.get("source_kind") == "upload":
        raise BadMediaError("original upload is gone and no audio copy exists — please re-upload")
    elif job.get("source_kind") == "upload":
        if not job.get("upload_key"):
            raise BadMediaError("upload job has no upload_key")
        source = ("upload", job["upload_key"])
    else:
        source = ("url", (parent or job)["video_source_url"])

    return {"is_pro": is_pro, "parent": parent, "rate": rate,
            "tx_type": tx_type, "label": label, "source": source}


def fetch_audio(job_id: str, source: tuple[str, str], tmp: Path) -> Path:
    kind, ref = source
    if kind == "audio":
        print(f"[{job_id}] reusing s3://{AUDIO_BUCKET}/{ref}", flush=True)
        return download_s3(ref, tmp / "audio.mp3")
    if kind == "upload":
        print(f"[{job_id}] fetching upload s3://{AUDIO_BUCKET}/{ref}", flush=True)
        raw = download_s3(ref, tmp / "upload.bin")
        if not probe_is_media(raw):
            raise BadMediaError("uploaded file is not a readable audio/video file")
        return to_mp3(raw, tmp)
    print(f"[{job_id}] downloading {ref}", flush=True)
    return to_mp3(download_video(ref, tmp), tmp)


def main() -> None:
    job_id = os.environ["JOB_ID"]
    job = get_job(job_id)
    session_id = job["current_session_id"]
    user_id = job["user_id"]
    upload_key = job.get("upload_key") if job.get("source_kind") == "upload" else None

    # Claim FIRST so a crash below leaves the job in 'downloading'/'failed',
    # never back in 'pending' for the distributor to respawn in a loop.
    update_job(job_id, status="downloading")

    try:
        plan = plan_job(job)
        rate = plan["rate"]
        balance = get_balance(user_id)

        # Gate 1 (free): manifest-based duration, no bytes downloaded.
        if plan["source"][0] == "url":
            minutes = probe_duration_minutes_cheap(plan["source"][1])
            if minutes is not None and minutes * rate > balance:
                mark_insufficient(job_id, user_id, minutes, minutes * rate, balance)
                return

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            mp3 = fetch_audio(job_id, plan["source"], tmp_path)
            # The browser upload has served its purpose the moment we have an
            # mp3; nothing below needs it and we never keep originals.
            delete_s3(upload_key)
            upload_key = None

            # Gate 2 (precise): ffprobe on the actual audio.
            minutes = minutes_from_seconds(get_duration_seconds(mp3))
            cost = minutes * rate
            if cost > balance:
                mark_insufficient(job_id, user_id, minutes, cost, balance)
                return

            update_job(job_id, status="transcribe")
            chunks = split_chunks(mp3, tmp_path)
            print(f"[{job_id}] whisper: {len(chunks)} chunk(s), tier={job.get('tier')}, "
                  f"{minutes} min × {rate} = {cost} credit(s)", flush=True)

            segments = transcribe_chunks(
                openai_client, chunks, job.get("language"),
                build_whisper_prompt(job.get("topic"), job.get("language")),
            )

            # Whisper leaves Taiwan Mandarin unpunctuated; a small chat model
            # adds 「，。？」 without touching a single character (see punctuate.py).
            if needs_punctuation(segments, job.get("language")):
                segments, changed = punctuate(openai_client, segments)
                print(f"[{job_id}] punctuate: {changed}/{len(segments)} lines", flush=True)

            session_fields: dict = {
                "subtitle_txt_content": segments_to_text(segments),
                "engine": "whisper-1",
            }
            job_fields: dict = {}

            if plan["is_pro"]:
                print(f"[{job_id}] assemblyai: speaker labels", flush=True)
                turns = diarize(_assemblyai_key(), mp3, job.get("language"), job.get("speakers_expected"))
                segments = assign_speakers(segments, turns)
                session_fields["speakers"] = speaker_map(segments)
                session_fields["engine"] = "whisper-1+assemblyai"

                # Keep the mp3 for the in-browser editor until export or deadline.
                audio_key = plan["parent"]["audio_key"] if plan["parent"] and plan["parent"].get("audio_key") \
                    else f"audio/{job_id}.mp3"
                if audio_key == f"audio/{job_id}.mp3":
                    s3.upload_file(str(mp3), AUDIO_BUCKET, audio_key,
                                   ExtraArgs={"ContentType": "audio/mpeg"})
                job_fields["audio_key"] = audio_key
                job_fields["edit_deadline"] = _iso(_utc_now() + timedelta(days=AUDIO_RETENTION_DAYS))

            session_fields["segments"] = segments
            update_session(session_id, **session_fields)

            # Deduct only on success: a failed job (any exception above) costs nothing.
            if cost > 0:
                deduct_credits(job_id, user_id, minutes, cost, plan["tx_type"], plan["label"])
            update_job(job_id, status="done", **job_fields)

            # Post-hoc unlock: fold the result back onto the parent so the
            # web app reads one job, and the child is just the work record.
            if plan["parent"]:
                parent = plan["parent"]
                update_job(parent["id"], tier="pro",
                           formats=sorted(set(parent.get("formats") or []) | set(job.get("formats") or [])),
                           **job_fields)
                if parent.get("current_session_id"):
                    update_session(parent["current_session_id"], **session_fields)

        print(f"[{job_id}] done — {len(segments)} segments", flush=True)

    except Exception as e:
        # Terminal, never charged. Message is for the job list ("why did it fail").
        reason = f"{type(e).__name__}: {e}"[:500]
        update_job(job_id, status="failed", error_message=reason)
        print(f"[{job_id}] FAILED {reason}", file=sys.stderr, flush=True)
        raise
    finally:
        delete_s3(upload_key)  # no-op when already deleted / not an upload


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)

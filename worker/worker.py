"""
M1 worker: handles one job — downloads the media, runs Whisper, writes the TXT
back to job_sessions.subtitle_txt_content.

Started by distributor.py (one Popen per pending job); reads JOB_ID from env.
OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SECRET_KEY come from AWS Secrets
Manager. The EC2's IAM instance profile grants secretsmanager:GetSecretValue on
exactly those secret names, so no credentials ever live on disk.
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


def _load_secrets() -> dict[str, str]:
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


def transcribe_chunk(chunk_path: Path, language: str) -> str:
    with open(chunk_path, "rb") as f:
        return openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text",
            language=language,
        )


def main() -> None:
    job_id = os.environ["JOB_ID"]
    job = get_job(job_id)
    session_id = job["current_session_id"]

    update_job(job_id, status="downloading")
    print(f"[{job_id}] downloading {job['video_source_url']}", flush=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        video = download_video(job["video_source_url"], tmp_path)
        mp3 = to_mp3(video, tmp_path)

        update_job(job_id, status="transcribe")
        chunks = split_chunks(mp3, tmp_path)
        print(f"[{job_id}] transcribing {len(chunks)} chunk(s)", flush=True)

        full_text = "\n\n".join(transcribe_chunk(c, job["language"]) for c in chunks)

        update_session(session_id, subtitle_txt_content=full_text)
        update_job(job_id, status="done")

    print(f"[{job_id}] done — {len(full_text)} chars", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # M1 has no error status (the jobs.status check constraint only allows
        # pending/downloading/transcribe/done) and no retry. A failed job just
        # stops moving, so make the reason loud in /var/log/m1-distributor.log.
        print(f"[{os.environ.get('JOB_ID', '?')}] FAILED", file=sys.stderr, flush=True)
        traceback.print_exc()
        sys.exit(1)

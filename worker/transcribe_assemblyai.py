"""
AssemblyAI → speaker timeline ONLY.

Step 0 bake-off: AssemblyAI's Chinese text was poor (simplified, space-
separated characters, wrong homophones) but its diarization was the best of
the three engines tested (4/4 speakers, 2 turn errors in 25). So the pro tier
sends the same mp3 to AssemblyAI purely for `utterances` (start / end /
speaker) and discards its text; the words come from whisper-1 (see
transcribe_whisper.py) and align.py stitches the two together.

Plain REST via httpx (already a dependency of the openai SDK) — no extra
package, no SDK API drift. The transcript is deleted from AssemblyAI as soon
as the utterances are in hand.
"""

from __future__ import annotations

import time
from pathlib import Path

import httpx

BASE = "https://api.assemblyai.com/v2"

# AssemblyAI language codes for the values our jobs.language column carries.
# Anything else (incl. "auto") lets the service detect the language itself.
LANGUAGE_CODES = {"zh": "zh", "en": "en", "ja": "ja", "ko": "ko"}

POLL_SECONDS = 5
MAX_WAIT_SECONDS = 30 * 60  # a 3-hour recording finishes well inside this


class AssemblyAIError(RuntimeError):
    pass


def _client(api_key: str) -> httpx.Client:
    return httpx.Client(base_url=BASE, headers={"authorization": api_key}, timeout=120)


def upload(client: httpx.Client, mp3: Path) -> str:
    with open(mp3, "rb") as f:
        r = client.post("/upload", content=f, headers={"content-type": "application/octet-stream"})
    r.raise_for_status()
    return r.json()["upload_url"]


def request_transcript(client: httpx.Client, upload_url: str, language: str | None,
                       speakers_expected: int | None) -> str:
    body: dict = {
        "audio_url": upload_url,
        "speaker_labels": True,
        # Universal is the default model; text quality is irrelevant here, only
        # the speaker turns are used.
        "punctuate": True,
        "format_text": False,
    }
    code = LANGUAGE_CODES.get((language or "").lower())
    if code:
        body["language_code"] = code
    else:
        body["language_detection"] = True
    if speakers_expected:
        body["speakers_expected"] = int(speakers_expected)

    r = client.post("/transcript", json=body)
    r.raise_for_status()
    return r.json()["id"]


def wait_for(client: httpx.Client, transcript_id: str) -> dict:
    deadline = time.monotonic() + MAX_WAIT_SECONDS
    while time.monotonic() < deadline:
        r = client.get(f"/transcript/{transcript_id}")
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if status == "completed":
            return data
        if status == "error":
            raise AssemblyAIError(data.get("error") or "transcription failed")
        time.sleep(POLL_SECONDS)
    raise AssemblyAIError("timed out waiting for AssemblyAI")


def delete_transcript(client: httpx.Client, transcript_id: str) -> None:
    try:
        client.delete(f"/transcript/{transcript_id}")
    except httpx.HTTPError:
        pass  # best effort; the audio is not kept by us either way


def utterances_to_turns(data: dict) -> list[dict]:
    """[{start, end, speaker}] in seconds, sorted. AssemblyAI reports ms."""
    turns = []
    for u in data.get("utterances") or []:
        turns.append({
            "start": round(u["start"] / 1000.0, 3),
            "end": round(u["end"] / 1000.0, 3),
            "speaker": str(u["speaker"]),
        })
    turns.sort(key=lambda t: t["start"])
    return turns


def diarize(api_key: str, mp3: Path, language: str | None, speakers_expected: int | None) -> list[dict]:
    """Upload, transcribe with speaker labels, return speaker turns, delete."""
    with _client(api_key) as client:
        upload_url = upload(client, mp3)
        tid = request_transcript(client, upload_url, language, speakers_expected)
        try:
            data = wait_for(client, tid)
            return utterances_to_turns(data)
        finally:
            delete_transcript(client, tid)

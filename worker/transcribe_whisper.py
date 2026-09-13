"""
whisper-1 → timed segments.

Step 0 finding: the old `response_format="text"` path threw the timestamps
away, and `language="zh"` on a mixed zh/en recording made Whisper TRANSLATE
the English parts into Chinese instead of transcribing them. So:

  * always ask for `verbose_json` and keep `segments` (start / end / text);
  * chunk N's timestamps are shifted by N * CHUNK_SECONDS so the whole file is
    on one timeline;
  * `language="auto"` (or empty) means: do not send `language` at all and let
    Whisper detect it per chunk.

Returns the same shape whether or not the pro tier is on, so the standard tier
also gets `segments` from now on (the plain .txt is just the joined text).
"""

from __future__ import annotations

from pathlib import Path

# Whisper rejects uploads over 25 MB. 10 minutes of 64 kbps mono mp3 is ~4.8 MB,
# so 600-second chunks stay well clear of the limit.
CHUNK_SECONDS = 600

AUTO_LANGUAGE = {"", "auto", "detect"}


def segment_dicts(resp, offset: float) -> list[dict]:
    """Normalise the SDK's verbose_json object into plain dicts on one timeline."""
    out = []
    for s in getattr(resp, "segments", None) or []:
        # The SDK returns TranscriptionSegment objects; raw JSON gives dicts.
        get = s.get if isinstance(s, dict) else lambda k, _s=s: getattr(_s, k, None)
        text = (get("text") or "").strip()
        if not text:
            continue
        out.append({
            "start": round(float(get("start") or 0.0) + offset, 3),
            "end": round(float(get("end") or 0.0) + offset, 3),
            "text": text,
            "no_speech_prob": round(float(get("no_speech_prob") or 0.0), 3),
        })
    return out


def transcribe_chunks(client, chunks: list[Path], language: str | None, prompt: str) -> list[dict]:
    """Run every chunk through whisper-1 and return offset-corrected segments.

    `client` is an `openai.OpenAI`; passed in so tests can hand over a fake.
    """
    lang = (language or "").strip().lower()
    kwargs = {} if lang in AUTO_LANGUAGE else {"language": lang}

    segments: list[dict] = []
    for i, chunk in enumerate(chunks):
        with open(chunk, "rb") as f:
            resp = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="verbose_json",
                prompt=prompt,
                **kwargs,
            )
        segments.extend(segment_dicts(resp, offset=i * CHUNK_SECONDS))

    for idx, seg in enumerate(segments):
        seg["i"] = idx
    return segments


def segments_to_text(segments: list[dict]) -> str:
    """The standard-tier .txt: one line per Whisper segment, no timestamps."""
    return "\n".join(s["text"] for s in segments)

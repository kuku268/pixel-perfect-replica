"""Offline unit tests for the pure pieces: python -m pytest worker/test_worker_units.py"""

import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace

from align import assign_speakers, speaker_map
from transcribe_assemblyai import utterances_to_turns
from transcribe_whisper import CHUNK_SECONDS, segment_dicts, segments_to_text


def test_segment_dicts_applies_chunk_offset_and_skips_blank():
    resp = SimpleNamespace(segments=[
        SimpleNamespace(start=0.0, end=2.5, text=" 你好 ", no_speech_prob=0.01),
        SimpleNamespace(start=2.5, end=4.0, text="   ", no_speech_prob=0.9),
        {"start": 4.0, "end": 6.0, "text": "hello", "no_speech_prob": 0.02},
    ])
    segs = segment_dicts(resp, offset=CHUNK_SECONDS)
    assert [s["text"] for s in segs] == ["你好", "hello"]
    assert segs[0]["start"] == 600.0 and segs[1]["end"] == 606.0


def test_assign_speakers_max_overlap_and_nearest():
    turns = [
        {"start": 0.0, "end": 5.0, "speaker": "A"},
        {"start": 5.0, "end": 9.0, "speaker": "B"},
        {"start": 20.0, "end": 25.0, "speaker": "C"},
    ]
    segs = [
        {"i": 0, "start": 0.5, "end": 4.0, "text": "a"},     # inside A
        {"i": 1, "start": 4.0, "end": 8.0, "text": "b"},     # 1 s of A, 3 s of B → B
        {"i": 2, "start": 12.0, "end": 14.0, "text": "gap"},  # no overlap → nearest: B (mid 7) vs C (mid 22.5)
        {"i": 3, "start": 21.0, "end": 30.0, "text": "c"},   # overlaps C only
    ]
    out = assign_speakers(segs, turns)
    assert [s["speaker"] for s in out] == ["A", "B", "B", "C"]
    assert segs[0].get("speaker") is None  # input untouched


def test_assign_speakers_without_turns_defaults_to_A():
    out = assign_speakers([{"start": 0, "end": 1, "text": "x"}], [])
    assert out[0]["speaker"] == "A"


def test_speaker_map_orders_by_first_appearance():
    segs = [{"speaker": "B"}, {"speaker": "A"}, {"speaker": "B"}, {"speaker": "C"}]
    m = speaker_map(segs)
    assert list(m) == ["B", "A", "C"]
    assert m["B"]["name"] == "Speaker B" and m["B"]["color"].startswith("#")


def test_utterances_ms_to_seconds_sorted():
    data = {"utterances": [
        {"start": 5000, "end": 9000, "speaker": "B"},
        {"start": 0, "end": 4990, "speaker": "A"},
    ]}
    turns = utterances_to_turns(data)
    assert turns[0] == {"start": 0.0, "end": 4.99, "speaker": "A"}
    assert turns[1]["speaker"] == "B"


def test_segments_to_text_one_line_per_segment():
    assert segments_to_text([{"text": "a"}, {"text": "b"}]) == "a\nb"


def test_probe_is_media_rejects_text_and_accepts_wav():
    # imported lazily: worker.py builds clients at import time
    import os
    os.environ.setdefault("OPENAI_API_KEY", "x")
    os.environ.setdefault("SUPABASE_URL", "http://localhost")
    os.environ.setdefault("SUPABASE_SECRET_KEY", "x")
    from worker import probe_is_media

    with tempfile.TemporaryDirectory() as d:
        fake = Path(d) / "movie.mp4"
        fake.write_text("MZ this is not a video")
        assert probe_is_media(fake) is False

        wav = Path(d) / "tone.wav"
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                        str(wav)], check=True, capture_output=True)
        assert probe_is_media(wav) is True

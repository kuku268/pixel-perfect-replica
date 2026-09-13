"""
Stitch whisper-1 segments (text + time) to AssemblyAI turns (speaker + time).

WhisperX-style: each Whisper segment gets the speaker whose turn overlaps it
the most. A segment that overlaps nothing (silence gaps, timing drift at chunk
boundaries) takes the speaker of the nearest turn by midpoint. Speaker labels
stay as AssemblyAI emits them ("A", "B", …); the user renames them in the
editor (job_sessions.speakers).

Pure functions, no I/O — see test_align.py.
"""

from __future__ import annotations

# Default palette for the speaker sidebar; the editor lets the user recolour.
SPEAKER_COLORS = [
    "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed",
    "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
]


def _overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def assign_speakers(segments: list[dict], turns: list[dict]) -> list[dict]:
    """Return a copy of `segments` with a `speaker` key on every item."""
    if not turns:
        return [{**s, "speaker": "A"} for s in segments]

    out = []
    j = 0  # turns are sorted; keep a moving lower bound so this stays O(n+m)
    for seg in segments:
        s_start, s_end = seg["start"], seg["end"]
        while j < len(turns) and turns[j]["end"] < s_start:
            j += 1

        best, best_ov = None, 0.0
        k = j
        while k < len(turns) and turns[k]["start"] < s_end:
            ov = _overlap(s_start, s_end, turns[k]["start"], turns[k]["end"])
            if ov > best_ov:
                best, best_ov = turns[k]["speaker"], ov
            k += 1

        if best is None:  # no overlap at all → nearest turn by midpoint
            mid = (s_start + s_end) / 2
            nearest = min(turns, key=lambda t: abs((t["start"] + t["end"]) / 2 - mid))
            best = nearest["speaker"]

        out.append({**seg, "speaker": best})
    return out


def speaker_map(segments: list[dict]) -> dict:
    """job_sessions.speakers seed: {"A": {"name": "Speaker A", "color": "#…"}, …}

    Ordered by first appearance so the first voice in the recording is "A"'s
    colour #1, etc.
    """
    seen: list[str] = []
    for s in segments:
        sp = s.get("speaker")
        if sp and sp not in seen:
            seen.append(sp)
    return {
        sp: {"name": f"Speaker {sp}", "color": SPEAKER_COLORS[i % len(SPEAKER_COLORS)]}
        for i, sp in enumerate(seen)
    }

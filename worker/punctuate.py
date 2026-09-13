"""
Punctuation pass for Chinese / Japanese transcripts.

whisper-1 writes Taiwan Mandarin as space-separated runs with no punctuation,
and no prompt reliably fixes it (tested 2026-09-13: five prompt styles, best
case half-width commas only). So after Whisper we hand the segment texts to a
small chat model with one job: add punctuation, change nothing else.

Safety rails — the model can only ever ADD punctuation:
  * segments are sent numbered and must come back with the same count;
  * every returned line is compared to the original with all punctuation and
    whitespace stripped — if a single character differs, that line keeps the
    original text;
  * any API/JSON error → the whole batch keeps the originals.
Timestamps and speakers are untouched (we only replace `text`).
"""

from __future__ import annotations

import json
import os
import re

PUNCT_MODEL = os.environ.get("PUNCTUATE_MODEL", "gpt-4o-mini")
BATCH = 80  # segments per request; ~2k tokens in, keeps the JSON answer small

# What counts as punctuation for "is this already punctuated?" and for the
# "nothing but punctuation changed" check.
_PUNCT_RE = re.compile(r"[\s,.!?;:'\"()\[\]{}<>\-—–…·、，。？！；：「」『』（）《》〈〉“”‘’]+")
_CJK_RE = re.compile(r"[぀-ヿ㐀-䶿一-鿿]")

SYSTEM = (
    "你是逐字稿的標點編輯。使用者會給你多行文字，每行開頭是編號。"
    "請為每一行加上適當的全形標點（，。？！、：），並在同一行內把原本用空格分開的片語接起來。"
    "嚴格規則：不可增加、刪除或更改任何字，不可翻譯，不可簡繁轉換，不可合併或拆分行，行數必須完全相同。"
    '只回傳 JSON：{"lines": ["…", "…"]}，陣列順序與編號一致，不含編號。'
)


def strip_punct(s: str) -> str:
    return _PUNCT_RE.sub("", s)


def needs_punctuation(segments: list[dict], language: str | None) -> bool:
    """CJK transcript where fewer than a third of the lines end in punctuation."""
    lang = (language or "auto").lower()
    if lang not in ("zh", "auto", "ja"):
        return False
    texts = [s["text"] for s in segments if s.get("text")]
    if not texts:
        return False
    cjk = sum(1 for t in texts if _CJK_RE.search(t))
    if cjk < len(texts) * 0.5:
        return False  # mostly not CJK (auto-detected English) — leave it alone
    ended = sum(1 for t in texts if t.rstrip()[-1:] in "，。？！、：；,.?!")
    return ended < len(texts) * 0.34


def _halfwidth_to_fullwidth(s: str) -> str:
    """The model sometimes answers with ASCII commas next to CJK; normalise."""
    out = []
    for i, ch in enumerate(s):
        if ch in ",.?!:;":
            prev = s[i - 1] if i > 0 else ""
            if _CJK_RE.match(prev):
                ch = {",": "，", ".": "。", "?": "？", "!": "！", ":": "：", ";": "；"}[ch]
        out.append(ch)
    return "".join(out)


def _punctuate_batch(client, texts: list[str]) -> list[str]:
    user = "\n".join(f"{i + 1}\t{t}" for i, t in enumerate(texts))
    resp = client.chat.completions.create(
        model=PUNCT_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
    )
    data = json.loads(resp.choices[0].message.content or "{}")
    lines = data.get("lines")
    if not isinstance(lines, list) or len(lines) != len(texts):
        raise ValueError(f"expected {len(texts)} lines, got {len(lines) if isinstance(lines, list) else type(lines)}")
    out = []
    for original, new in zip(texts, lines):
        new = _halfwidth_to_fullwidth(str(new)).strip()
        out.append(new if strip_punct(new) == strip_punct(original) else original)
    return out


def punctuate(client, segments: list[dict]) -> tuple[list[dict], int]:
    """Return (segments with punctuated text, number of lines changed).

    `client` is an `openai.OpenAI`. Never raises — a failed batch keeps its
    original text and is reported on stdout.
    """
    result = [dict(s) for s in segments]
    changed = 0
    for start in range(0, len(result), BATCH):
        chunk = result[start:start + BATCH]
        texts = [s["text"] for s in chunk]
        try:
            fixed = _punctuate_batch(client, texts)
        except Exception as e:  # API error, bad JSON, wrong count → keep originals
            print(f"punctuate: batch {start}-{start + len(chunk)} kept original ({type(e).__name__}: {e})", flush=True)
            continue
        for seg, text in zip(chunk, fixed):
            if text != seg["text"]:
                seg["text"] = text
                changed += 1
    return result, changed

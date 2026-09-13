// Transcript model shared by the export routes, the draft (editor) route and,
// in Step 4, the TranscriptDialog UI. Pure functions — no I/O — so they can
// be unit-tested with `node --experimental-strip-types`.
//
// Storage (job_sessions):
//   segments  — what the worker produced, never mutated:
//               [{ i, start, end, text, speaker?, no_speech_prob? }]
//   speakers  — { "A": { name, color }, … }  (user renames / recolours)
//   overrides — { "<i>": { speaker?, text?, start?, end? } }  (user edits)
// Every export = segments ⊕ overrides, so the original is always recoverable.

export type Segment = {
  i: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  no_speech_prob?: number;
};

export type SpeakerInfo = { name: string; color: string };
export type Speakers = Record<string, SpeakerInfo>;

export type Override = { speaker?: string; text?: string; start?: number; end?: number };
export type Overrides = Record<string, Override>;

export type Turn = { speaker: string; start: number; end: number; text: string; segments: number };

const MAX_TEXT = 5000;
const MAX_NAME = 60;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SPEAKER_ID_RE = /^[A-Za-z0-9_-]{1,8}$/;

function isFiniteNonNeg(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

// ---- parsing / validation -------------------------------------------------

export function parseSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return [];
  const out: Segment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!isFiniteNonNeg(r.start) || !isFiniteNonNeg(r.end) || typeof r.text !== "string") continue;
    out.push({
      i: typeof r.i === "number" ? r.i : out.length,
      start: r.start,
      end: r.end,
      text: r.text,
      ...(typeof r.speaker === "string" ? { speaker: r.speaker } : {}),
      ...(typeof r.no_speech_prob === "number" ? { no_speech_prob: r.no_speech_prob } : {}),
    });
  }
  return out;
}

export function parseSpeakers(value: unknown): Speakers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Speakers = {};
  for (const [id, info] of Object.entries(value as Record<string, unknown>)) {
    if (!SPEAKER_ID_RE.test(id) || !info || typeof info !== "object") continue;
    const r = info as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_NAME) : "";
    const color = typeof r.color === "string" && COLOR_RE.test(r.color) ? r.color : "#64748b";
    out[id] = { name: name || `Speaker ${id}`, color };
  }
  return out;
}

/** Returns null when the payload is malformed (the API answers 400). */
export function parseOverrides(value: unknown): Overrides | null {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const out: Overrides = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) return null;
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const o: Override = {};
    if (r.speaker !== undefined) {
      if (typeof r.speaker !== "string" || !SPEAKER_ID_RE.test(r.speaker)) return null;
      o.speaker = r.speaker;
    }
    if (r.text !== undefined) {
      if (typeof r.text !== "string" || r.text.length > MAX_TEXT) return null;
      o.text = r.text;
    }
    if (r.start !== undefined) {
      if (!isFiniteNonNeg(r.start)) return null;
      o.start = r.start;
    }
    if (r.end !== undefined) {
      if (!isFiniteNonNeg(r.end)) return null;
      o.end = r.end;
    }
    if (o.start !== undefined && o.end !== undefined && o.start >= o.end) return null;
    if (Object.keys(o).length) out[key] = o;
  }
  return out;
}

// ---- applying edits -------------------------------------------------------

export function applyOverrides(segments: Segment[], overrides: Overrides): Segment[] {
  const merged = segments.map((s) => {
    const o = overrides[String(s.i)];
    if (!o) return s;
    const next: Segment = { ...s };
    if (o.speaker !== undefined) next.speaker = o.speaker;
    if (o.text !== undefined) next.text = o.text;
    if (o.start !== undefined) next.start = o.start;
    if (o.end !== undefined) next.end = o.end;
    if (next.end < next.start) next.end = next.start;
    return next;
  });
  // A retimed line may have moved; keep the output in playback order.
  return merged.filter((s) => s.text.trim().length > 0).sort((a, b) => a.start - b.start || a.i - b.i);
}

export function speakerName(speakers: Speakers, id: string | undefined): string {
  if (!id) return "";
  return speakers[id]?.name ?? `Speaker ${id}`;
}

export function durationSeconds(segments: Segment[]): number {
  return segments.reduce((m, s) => Math.max(m, s.end), 0);
}

// ---- time formatting ------------------------------------------------------

function hms(totalSeconds: number): { h: number; m: number; s: number; ms: number } {
  const clamped = Math.max(0, totalSeconds);
  const whole = Math.floor(clamped);
  return {
    h: Math.floor(whole / 3600),
    m: Math.floor((whole % 3600) / 60),
    s: whole % 60,
    ms: Math.round((clamped - whole) * 1000) % 1000,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 00:01:02,345 */
export function formatSrtTime(sec: number): string {
  const t = hms(sec);
  return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)},${pad(t.ms, 3)}`;
}

/** 00:01:02.345 */
export function formatVttTime(sec: number): string {
  return formatSrtTime(sec).replace(",", ".");
}

/** 00:01:02 — the editor's timecode column and the docx/pdf tables. */
export function formatClock(sec: number): string {
  const t = hms(sec);
  return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;
}

/** Parses "hh:mm:ss", "mm:ss" or "ss(.ms)" typed into the editor; null if garbage. */
export function parseClock(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  let total = 0;
  for (const n of nums) total = total * 60 + n;
  return Number.isFinite(total) ? total : null;
}

// ---- output formats -------------------------------------------------------

export function toTxt(segments: Segment[]): string {
  return segments.map((s) => s.text.trim()).join("\n") + "\n";
}

export function toSrt(segments: Segment[], speakers: Speakers | null): string {
  return (
    segments
      .map((s, n) => {
        const label = speakers && s.speaker ? `${speakerName(speakers, s.speaker)}: ` : "";
        return `${n + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${label}${s.text.trim()}`;
      })
      .join("\n\n") + "\n"
  );
}

export function toVtt(segments: Segment[], speakers: Speakers | null): string {
  const body = segments
    .map((s) => {
      const voice = speakers && s.speaker ? `<v ${speakerName(speakers, s.speaker)}>` : "";
      return `${formatVttTime(s.start)} --> ${formatVttTime(s.end)}\n${voice}${s.text.trim()}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

const CJK_RE = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

/** Joins two lines: no space between CJK characters, a space otherwise. */
export function joinText(a: string, b: string): string {
  const left = a.trimEnd();
  const right = b.trimStart();
  if (!left) return right;
  if (!right) return left;
  const glue = CJK_RE.test(left.slice(-1)) && CJK_RE.test(right[0]) ? "" : " ";
  return left + glue + right;
}

/** Consecutive segments by the same speaker become one row in docx/pdf. */
export function groupTurns(segments: Segment[]): Turn[] {
  const turns: Turn[] = [];
  for (const s of segments) {
    const sp = s.speaker ?? "";
    const last = turns[turns.length - 1];
    if (last && last.speaker === sp) {
      last.end = Math.max(last.end, s.end);
      last.text = joinText(last.text, s.text);
      last.segments += 1;
    } else {
      turns.push({ speaker: sp, start: s.start, end: s.end, text: s.text.trim(), segments: 1 });
    }
  }
  return turns;
}

/** Which speaker ids actually occur, in first-appearance order. */
export function speakersInUse(segments: Segment[]): string[] {
  const seen: string[] = [];
  for (const s of segments) if (s.speaker && !seen.includes(s.speaker)) seen.push(s.speaker);
  return seen;
}

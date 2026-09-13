"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Download, Info, Merge, Palette, Pause, PenLine, Play } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useLang, useT } from "@/lib/i18n";
import {
  applyOverrides,
  formatClock,
  parseClock,
  speakerName,
  type Overrides,
  type Segment,
  type Speakers,
} from "@/lib/transcript";

import type { JobListItem } from "./jobs-types";
import { formatLabel } from "./UnlockDialog";

// MacWhisper-style transcript editor (design canvas artboard ④).
//
//   top      audio player: play/pause, time, speaker-coloured progress bar with
//            playhead, speed, "Follow playback"
//   left     speakers: click name to rename, palette to recolour, line counts,
//            merge; the terms sentence at the bottom
//   right    one row per segment: timecode (click seeks, double-click edits),
//            speaker (click → reassign / merge), text (double-click edits).
//            Hovered row + keys 1–9 reassigns. Space plays/pauses.
//   footer   draft status + time left, Save (PATCH /draft),
//            "Export & delete audio ▾" (GET export, then POST export)
//
// Edits never touch the worker's segments: they are stored as `overrides`
// keyed by segment index, and `speakers` (names/colours). Both are what the
// export routes apply.

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];
const RATES = [1, 1.25, 1.5, 2];

type Draft = {
  job: {
    id: string;
    tier: string;
    formats: string[];
    source: string;
    topic: string | null;
    audio_available: boolean;
    edit_deadline: string | null;
    exported_at: string | null;
    can_edit: boolean;
  };
  segments: Segment[];
  speakers: Speakers;
  overrides: Overrides;
  summary: string | null;
};

type Editing = { i: number; field: "text" | "time"; value: string } | null;

export function TranscriptDialog({
  job,
  open,
  onOpenChange,
}: {
  job: JobListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<Speakers>({});
  const [overrides, setOverrides] = useState<Overrides>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioGone, setAudioGone] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);

  const [editing, setEditing] = useState<Editing>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [exportConfirm, setExportConfirm] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ---- load ------------------------------------------------------------
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch(`/api/jobs/${job.id}/draft`);
      const body = (await r.json()) as Draft & { error?: string };
      if (!r.ok) {
        setLoadError(body.error ?? `HTTP ${r.status}`);
        return;
      }
      setDraft(body);
      setSpeakers(body.speakers);
      setOverrides(body.overrides ?? {});
      setDirty(false);
      setAudioGone(!body.job.audio_available);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [job.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Presigned URL lasts 15 min; refetch when the element reports an error.
  const fetchAudio = useCallback(async () => {
    const r = await fetch(`/api/jobs/${job.id}/audio`);
    if (!r.ok) {
      setAudioGone(true);
      setAudioUrl(null);
      return;
    }
    const body = (await r.json()) as { url: string };
    setAudioUrl(body.url);
  }, [job.id]);

  useEffect(() => {
    if (open && draft?.job.audio_available) void fetchAudio();
  }, [open, draft?.job.audio_available, fetchAudio]);

  // ---- derived -----------------------------------------------------------
  const rows = useMemo(() => (draft ? applyOverrides(draft.segments, overrides) : []), [draft, overrides]);
  const duration = useMemo(() => rows.reduce((m, s) => Math.max(m, s.end), 0), [rows]);
  const speakerIds = useMemo(() => {
    const seen: string[] = [];
    for (const s of rows) if (s.speaker && !seen.includes(s.speaker)) seen.push(s.speaker);
    for (const id of Object.keys(speakers)) if (!seen.includes(id)) seen.push(id);
    return seen;
  }, [rows, speakers]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of rows) if (s.speaker) c[s.speaker] = (c[s.speaker] ?? 0) + 1;
    return c;
  }, [rows]);
  const activeIdx = useMemo(() => {
    let idx = -1;
    for (let k = 0; k < rows.length; k++) if (rows[k].start <= currentTime) idx = k;
    return idx;
  }, [rows, currentTime]);
  const colorOf = (id: string | undefined) => (id && speakers[id]?.color) || "#64748b";
  const canEdit = !!draft?.job.can_edit;

  // Follow playback: keep the active row in view.
  useEffect(() => {
    if (!follow || !playing || activeIdx < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, follow, playing]);

  // ---- editing helpers --------------------------------------------------
  function setOverride(i: number, patch: Partial<Overrides[string]>) {
    setOverrides((prev) => {
      const original = draft?.segments.find((s) => s.i === i);
      const next = { ...(prev[String(i)] ?? {}), ...patch };
      // Drop keys that just restate the original so exports stay minimal.
      if (original) {
        if (next.speaker === original.speaker) delete next.speaker;
        if (next.text === original.text) delete next.text;
        if (next.start === original.start) delete next.start;
        if (next.end === original.end) delete next.end;
      }
      const out = { ...prev };
      if (Object.keys(next).length) out[String(i)] = next;
      else delete out[String(i)];
      return out;
    });
    setDirty(true);
  }

  function reassign(i: number, speakerId: string) {
    if (!canEdit) return;
    setOverride(i, { speaker: speakerId });
  }

  function renameSpeaker(id: string, name: string) {
    if (!canEdit) return;
    const clean = name.trim().slice(0, 60);
    setSpeakers((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { color: colorOf(id) }), name: clean || `Speaker ${id}` } }));
    setDirty(true);
  }

  function recolorSpeaker(id: string, color: string) {
    if (!canEdit) return;
    setSpeakers((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { name: `Speaker ${id}` }), color } }));
    setDirty(true);
  }

  function mergeSpeaker(from: string, into: string) {
    if (!canEdit || from === into) return;
    for (const s of rows) if (s.speaker === from) setOverride(s.i, { speaker: into });
    setSpeakers((prev) => {
      const next = { ...prev };
      delete next[from];
      return next;
    });
    setDirty(true);
  }

  function commitEdit() {
    if (!editing) return;
    if (editing.field === "text") {
      if (editing.value.trim()) setOverride(editing.i, { text: editing.value.trim() });
    } else {
      const sec = parseClock(editing.value);
      if (sec !== null) {
        const row = rows.find((r) => r.i === editing.i);
        setOverride(editing.i, { start: sec, ...(row && row.end < sec ? { end: sec + 1 } : {}) });
      }
    }
    setEditing(null);
  }

  // ---- audio -------------------------------------------------------------
  function seek(sec: number) {
    const a = audioRef.current;
    if (!a || audioGone) return;
    a.currentTime = sec;
    void a.play();
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a || audioGone) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  // Keyboard: Space = play/pause, 1–9 = reassign hovered row, [ in the
  // timecode editor = playhead.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (/^[1-9]$/.test(e.key) && hoverI !== null && canEdit) {
        const id = speakerIds[Number(e.key) - 1];
        if (id) reassign(hoverI, id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hoverI, speakerIds, canEdit, audioGone]);

  // ---- save / export -----------------------------------------------------
  async function save() {
    setSaveError(null);
    setSaving(true);
    try {
      const r = await fetch(`/api/jobs/${job.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakers, overrides }),
      });
      const body = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setSaveError(body?.error ?? `HTTP ${r.status}`);
        return;
      }
      setDirty(false);
      setSavedAt(Date.now());
    } catch {
      setSaveError(t("networkError"));
    } finally {
      setSaving(false);
    }
  }

  async function exportAndDelete(format: string) {
    if (dirty) await save();
    window.location.assign(`/api/jobs/${job.id}/export?format=${format}&lang=${lang}`);
    if (!audioGone) {
      await fetch(`/api/jobs/${job.id}/export`, { method: "POST" });
      audioRef.current?.pause();
      setAudioGone(true);
      setAudioUrl(null);
      await load();
      router.refresh();
    }
    setExportConfirm(null);
  }

  // ---- footer text -------------------------------------------------------
  const deadlineText = (() => {
    if (!draft?.job.edit_deadline) return null;
    const ms = new Date(draft.job.edit_deadline).getTime() - Date.now();
    if (ms <= 0) return t("windowClosed");
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const until = new Date(draft.job.edit_deadline).toLocaleString(lang === "zh" ? "zh-TW" : "en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return t("timeLeft", { d, h, until });
  })();

  const exportFormats = ["txt", ...(draft?.job.formats ?? [])];
  const minutes = Math.max(1, Math.ceil(duration / 60));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">{t("transcript")}</DialogTitle>
          <DialogDescription>
            {draft ? t("editorMeta", { source: draft.job.source, min: minutes, n: speakerIds.length }) : job.source}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("loadFailed", { reason: loadError })}
          </p>
        ) : null}

        {/* player */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
          <button
            type="button"
            onClick={togglePlay}
            disabled={audioGone || !audioUrl}
            aria-label={playing ? "pause" : "play"}
            className="grid size-9 shrink-0 place-content-center rounded-full bg-primary text-primary-foreground shadow-sm disabled:opacity-40"
          >
            {playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          </button>
          <span className="whitespace-nowrap font-mono text-xs">
            {formatClock(currentTime)} <span className="text-muted-foreground">/ {formatClock(duration)}</span>
          </span>
          <div className="flex min-w-[160px] grow flex-col gap-1">
            <div
              className="relative flex h-2.5 cursor-pointer overflow-hidden rounded-full bg-secondary"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - rect.left) / rect.width) * duration);
              }}
            >
              {duration > 0
                ? rows.map((s) => (
                    <span
                      key={s.i}
                      style={{ width: `${((s.end - s.start) / duration) * 100}%`, background: colorOf(s.speaker) }}
                      className="h-full"
                    />
                  ))
                : null}
              <span
                className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-sm bg-foreground"
                style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[11px] leading-[14px] text-muted-foreground">{audioGone ? t("audioGone") : t("playHint")}</span>
          </div>
          <button type="button" onClick={cycleRate} className="h-[26px] whitespace-nowrap rounded-full border border-border px-2.5 font-mono text-xs">
            {rate}×
          </button>
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
            <Switch checked={follow} onCheckedChange={setFollow} />
            {t("follow")}
          </label>
          {audioUrl ? (
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onError={() => void fetchAudio()}
              onLoadedMetadata={(e) => {
                e.currentTarget.playbackRate = rate;
              }}
            />
          ) : null}
        </div>

        {/* body */}
        <div className="grid min-h-0 grow grid-cols-1 items-start gap-4 overflow-y-auto md:grid-cols-[236px_minmax(0,1fr)]">
          {/* speakers sidebar */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("speakers")}</span>
            <div className="flex flex-col gap-1">
              {speakerIds.map((id, n) => (
                <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: colorOf(id) }} />
                  {renaming?.id === id ? (
                    <input
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ id, value: e.target.value })}
                      onBlur={() => {
                        renameSpeaker(id, renaming.value);
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-[26px] min-w-0 grow rounded-lg border border-primary bg-background px-2 text-[13px] font-medium ring-1 ring-primary focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setRenaming({ id, value: speakerName(speakers, id) })}
                      className="min-w-0 grow truncate text-left text-[13px] font-medium disabled:cursor-default"
                      title={canEdit ? t("renameHint") : undefined}
                    >
                      {speakerName(speakers, id)}
                    </button>
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">{n + 1}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{t("lines", { n: counts[id] ?? 0 })}</span>
                  {canEdit ? (
                    <Popover>
                      <PopoverTrigger className="text-muted-foreground hover:text-foreground" title={t("colorTitle")}>
                        <Palette aria-hidden="true" className="size-3.5" />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="end">
                        <div className="grid grid-cols-5 gap-1.5">
                          {PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => recolorSpeaker(id, c)}
                              className={`size-5 rounded-full ${colorOf(id) === c ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                              style={{ background: c }}
                              aria-label={c}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="h-px bg-border" />
            <p className="text-[11px] leading-4 text-muted-foreground">{t("renameHint")}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">{t("reassignHint")}</p>
            <div className="h-px bg-border" />
            <p className="flex gap-1.5 text-[11px] leading-4 text-accent-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              <span>{t("basicNotice")}</span>
            </p>
          </div>

          {/* rows */}
          <div ref={listRef} className="min-h-0 rounded-xl border border-border bg-card px-4 py-1 md:max-h-[52vh] md:overflow-y-auto">
            {rows.map((row, k) => {
              const active = k === activeIdx && playing;
              const ov = overrides[String(row.i)];
              const color = colorOf(row.speaker);
              const isEditingText = editing?.i === row.i && editing.field === "text";
              const isEditingTime = editing?.i === row.i && editing.field === "time";
              return (
                <div
                  key={row.i}
                  data-row={k}
                  onMouseEnter={() => setHoverI(row.i)}
                  onMouseLeave={() => setHoverI((h) => (h === row.i ? null : h))}
                  className={`grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-[84px_108px_minmax(0,1fr)] ${
                    active ? "-mx-2 rounded-lg px-2" : ""
                  }`}
                  style={active ? { background: `${color}14`, boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                >
                  {/* timecode */}
                  {isEditingTime ? (
                    <div className="flex flex-col gap-1">
                      <input
                        autoFocus
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditing(null);
                          if (e.key === "[") {
                            e.preventDefault();
                            setEditing({ ...editing, value: formatClock(currentTime) });
                          }
                        }}
                        onBlur={commitEdit}
                        className="h-6 w-[82px] rounded-md border border-primary bg-background px-1.5 font-mono text-xs ring-1 ring-primary focus:outline-none"
                      />
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">{t("tsHint")}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => seek(row.start)}
                      onDoubleClick={() => canEdit && setEditing({ i: row.i, field: "time", value: formatClock(row.start) })}
                      className={`inline-flex items-center gap-1 font-mono text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}
                      style={active ? { color } : undefined}
                    >
                      {active ? <Play aria-hidden="true" className="size-2.5" /> : null}
                      {formatClock(row.start)}
                    </button>
                  )}

                  {/* speaker */}
                  <div className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
                    {canEdit ? (
                      <Popover>
                        <PopoverTrigger
                          className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-dashed border-transparent px-1.5 text-[13px] font-semibold hover:border-current"
                          style={{ color }}
                        >
                          {speakerName(speakers, row.speaker) || "—"}
                          <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-1" align="start">
                          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("reassignTo")}</div>
                          {speakerIds.map((id, n) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => reassign(row.i, id)}
                              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${id === row.speaker ? "bg-accent text-accent-foreground" : ""}`}
                            >
                              <span className="size-2.5 rounded-full" style={{ background: colorOf(id) }} />
                              <span className="grow truncate">{speakerName(speakers, id)}</span>
                              <span className="font-mono text-[11px] text-muted-foreground">{n + 1}</span>
                            </button>
                          ))}
                          {row.speaker && speakerIds.length > 1 ? (
                            <>
                              <div className="my-1 h-px bg-border" />
                              <div className="px-2 py-1 text-[11px] text-muted-foreground">{t("mergeInto", { name: speakerName(speakers, row.speaker) })}</div>
                              {speakerIds
                                .filter((id) => id !== row.speaker)
                                .map((id) => (
                                  <button
                                    key={`m-${id}`}
                                    type="button"
                                    onClick={() => mergeSpeaker(row.speaker!, id)}
                                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                                  >
                                    <Merge aria-hidden="true" className="size-3.5 text-muted-foreground" />
                                    <span className="size-2.5 rounded-full" style={{ background: colorOf(id) }} />
                                    <span className="grow truncate">{speakerName(speakers, id)}</span>
                                  </button>
                                ))}
                            </>
                          ) : null}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-[13px] font-semibold" style={{ color }}>
                        {speakerName(speakers, row.speaker) || "—"}
                      </span>
                    )}
                  </div>

                  {/* text */}
                  <div className="col-span-2 sm:col-span-1">
                    {isEditingText ? (
                      <div className="flex flex-col gap-1">
                        <textarea
                          autoFocus
                          rows={2}
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              commitEdit();
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          onBlur={commitEdit}
                          className="w-full rounded-lg border border-primary bg-background px-2 py-1 text-sm leading-[22px] ring-1 ring-primary focus:outline-none"
                        />
                        <span className="text-[11px] leading-[14px] text-muted-foreground">{t("editHint")}</span>
                      </div>
                    ) : (
                      <span
                        onDoubleClick={() => canEdit && setEditing({ i: row.i, field: "text", value: row.text })}
                        className="text-sm leading-[22px]"
                      >
                        {row.text}
                        {ov?.text !== undefined ? (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 align-[1px] text-[11px] text-muted-foreground">
                            <PenLine aria-hidden="true" className="size-2.5" />
                            {t("edited")}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-lg flex-col gap-0.5 text-xs leading-4">
            <span className="inline-flex items-center gap-1.5">
              {saveError ? (
                <span className="text-destructive">{saveError}</span>
              ) : dirty ? (
                <span className="font-medium text-accent-foreground">{t("unsaved")}</span>
              ) : savedAt ? (
                <>
                  <Check aria-hidden="true" className="size-3 text-primary" />
                  <span className="font-medium">{t("draftSaved")}</span>
                </>
              ) : null}
              {deadlineText ? (
                <>
                  {dirty || savedAt || saveError ? <span className="text-muted-foreground">·</span> : null}
                  <span className="text-muted-foreground">{deadlineText}</span>
                </>
              ) : null}
            </span>
            <span className="text-muted-foreground">{t("retention")}</span>
          </div>
          <div className="flex gap-2">
            {canEdit ? (
              <Button type="button" variant="outline" onClick={save} disabled={saving || !dirty}>
                {saving ? t("saving") : t("save")}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" disabled={!draft}>
                  <Download aria-hidden="true" className="size-4" />
                  {audioGone ? t("exportOnly") : t("exportDelete")}
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exportFormats.map((f) => (
                  <DropdownMenuItem
                    key={f}
                    onSelect={() => (audioGone ? void exportAndDelete(f) : setExportConfirm(f))}
                  >
                    {f === "txt" ? t("plainText") : formatLabel(t, f as "docx" | "pdf" | "srt")}
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">.{f}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <AlertDialog open={exportConfirm !== null} onOpenChange={(o) => !o && setExportConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("exportConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("exportConfirmDesc", { fmt: `.${exportConfirm ?? ""}` })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => exportConfirm && void exportAndDelete(exportConfirm)}>{t("exportConfirmOk")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Film, Info, Link2, Upload, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRO_CREDITS_PER_MINUTE, PRO_FORMATS, PRO_TIER_ENABLED, UPLOAD_ENABLED, type ProFormat } from "@/lib/flags";
import { useLang, useT } from "@/lib/i18n";

// New-transcription form. With both feature flags off this renders exactly the
// M4 form (URL / topic / language). UPLOAD_ENABLED adds the "Upload a file"
// tab (browser → S3 direct PUT with progress); PRO_TIER_ENABLED adds the
// Standard / Business plan cards, the format checkboxes and the consent line.

const LANGUAGES = [
  { value: "auto", key: "langAuto" as const },
  { value: "zh", label: "中文 (zh)" },
  { value: "en", label: "English (en)" },
  { value: "ja", label: "日本語 (ja)" },
];

const ACCEPT = ".mp4,.mov,.m4v,.webm,.mkv,.mp3,.m4a,.wav,.aac,.ogg,.flac";
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fmtEta(seconds: number, lang: "zh" | "en"): string {
  if (!Number.isFinite(seconds) || seconds < 5) return lang === "zh" ? "幾秒" : "a few seconds";
  if (seconds < 90) return lang === "zh" ? `${Math.round(seconds)} 秒` : `${Math.round(seconds)} s`;
  const m = Math.round(seconds / 60);
  return lang === "zh" ? `${m} 分鐘` : `${m} min`;
}

type UploadState =
  | { phase: "empty" }
  | { phase: "uploading"; file: File; loaded: number; speed: number; xhr: XMLHttpRequest }
  | { phase: "ready"; file: File; upload_key: string }
  | { phase: "error"; message: string };

export function UploadForm() {
  const router = useRouter();
  const t = useT();

  const [tab, setTab] = useState<"url" | "upload">(UPLOAD_ENABLED ? "upload" : "url");
  const [videoSourceUrl, setVideoSourceUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("auto");
  const [tier, setTier] = useState<"standard" | "pro">("standard");
  const [formats, setFormats] = useState<ProFormat[]>(["docx", "pdf"]);
  const [speakersExpected, setSpeakersExpected] = useState("");
  const [upload, setUpload] = useState<UploadState>({ phase: "empty" });
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Warn before leaving mid-upload; the PUT dies with the page.
  useEffect(() => {
    if (upload.phase !== "uploading") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [upload.phase]);

  function toggleFormat(f: ProFormat, on: boolean) {
    setFormats((prev) => (on ? Array.from(new Set([...prev, f])) : prev.filter((x) => x !== f)));
  }

  async function startUpload(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setUpload({ phase: "error", message: t("uploadFailed", { reason: "> 2 GB" }) });
      return;
    }
    let presign: { url: string; upload_key: string; headers: Record<string, string> };
    try {
      const r = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.type }),
      });
      const body = (await r.json().catch(() => null)) as { error?: string; url?: string; upload_key?: string; headers?: Record<string, string> } | null;
      if (!r.ok || !body?.url || !body.upload_key) {
        setUpload({ phase: "error", message: t("uploadFailed", { reason: body?.error ?? `HTTP ${r.status}` }) });
        return;
      }
      presign = { url: body.url, upload_key: body.upload_key, headers: body.headers ?? {} };
    } catch {
      setUpload({ phase: "error", message: t("networkError") });
      return;
    }

    // XMLHttpRequest instead of fetch: it is the only way to get upload
    // progress events in the browser.
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();
    setUpload({ phase: "uploading", file, loaded: 0, speed: 0, xhr });
    xhr.upload.onprogress = (e) => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setUpload((prev) =>
        prev.phase === "uploading" ? { ...prev, loaded: e.loaded, speed: elapsed > 0 ? e.loaded / elapsed : 0 } : prev,
      );
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUpload({ phase: "ready", file, upload_key: presign.upload_key });
      } else {
        setUpload({ phase: "error", message: t("uploadFailed", { reason: `S3 ${xhr.status}` }) });
      }
    };
    xhr.onerror = () => setUpload({ phase: "error", message: t("uploadFailed", { reason: "network" }) });
    xhr.onabort = () => setUpload({ phase: "empty" });
    xhr.open("PUT", presign.url);
    for (const [k, v] of Object.entries(presign.headers)) xhr.setRequestHeader(k, v);
    xhr.send(file);
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void startUpload(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    onFiles(e.dataTransfer.files);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInsufficient(false);

    const body: Record<string, unknown> = {
      topic: topic.trim() || null,
      language,
    };
    if (tab === "upload") {
      if (upload.phase !== "ready") return;
      body.source_kind = "upload";
      body.upload_key = upload.upload_key;
      body.original_filename = upload.file.name;
    } else {
      body.video_source_url = videoSourceUrl.trim();
    }
    if (PRO_TIER_ENABLED && tier === "pro") {
      body.tier = "pro";
      body.formats = formats;
      if (speakersExpected) body.speakers_expected = Number(speakersExpected);
    }

    setPending(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 402) {
          setInsufficient(true);
          return;
        }
        setError(err?.error ?? `Request failed (${response.status})`);
        return;
      }

      setVideoSourceUrl("");
      setTopic("");
      setUpload({ phase: "empty" });
      router.refresh();
    } catch {
      setError(t("networkError"));
    } finally {
      setPending(false);
    }
  }

  const uploading = upload.phase === "uploading";
  const canSubmit = !pending && !uploading && (tab === "url" ? videoSourceUrl.trim().length > 0 : upload.phase === "ready");

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      {UPLOAD_ENABLED ? (
        <div role="tablist" className="inline-flex gap-0.5 rounded-[10px] bg-secondary p-[3px]">
          {(
            [
              ["upload", Upload, t("tabUpload")],
              ["url", Link2, t("tabUrl")],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              disabled={uploading}
              onClick={() => setTab(value)}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg px-3.5 text-[13px] transition-colors ${
                tab === value ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "upload" ? (
        <div className="space-y-2">
          {upload.phase === "empty" || upload.phase === "error" ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-5 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/10" : "border-border bg-card/60"
              }`}
            >
              <span className="grid size-9 place-content-center rounded-full bg-primary/12 text-primary">
                <Upload aria-hidden="true" className="size-5" />
              </span>
              <span className="text-sm font-semibold">{t("dropTitle")}</span>
              <span className="text-[13px] text-muted-foreground">
                {t("or")}{" "}
                <button type="button" onClick={() => fileInput.current?.click()} className="font-medium underline">
                  {t("chooseFile")}
                </button>
              </span>
              <span className="text-xs leading-4 text-muted-foreground">{t("limits")}</span>
              <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => onFiles(e.target.files)} />
              {upload.phase === "error" ? (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {upload.message}
                </p>
              ) : null}
            </div>
          ) : null}

          {upload.phase === "uploading" ? (
            <UploadingCard state={upload} onCancel={() => upload.xhr.abort()} />
          ) : null}

          {upload.phase === "ready" ? (
            <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/6 px-4 py-3">
              <span className="grid size-8 place-content-center rounded-full bg-primary text-primary-foreground">
                <CheckCircle2 aria-hidden="true" className="size-4" />
              </span>
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{upload.file.name}</span>
                <span className="text-xs text-muted-foreground">{t("uploaded", { size: fmtBytes(upload.file.size) })}</span>
              </div>
              <button type="button" onClick={() => setUpload({ phase: "empty" })} className="text-[13px] font-medium text-primary hover:underline">
                {t("replace")}
              </button>
            </div>
          ) : null}

          <p className="text-xs leading-4 text-muted-foreground">{t("uploadNote")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="video_source_url">{t("videoUrl")}</Label>
          <Input
            id="video_source_url"
            type="url"
            required={tab === "url"}
            placeholder={t("urlPh")}
            value={videoSourceUrl}
            onChange={(e) => setVideoSourceUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("ytNote")}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="topic">{t("topic")}</Label>
        <Input id="topic" type="text" placeholder={t("topicPh")} value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="language">{t("language")}</Label>
        <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className={SELECT_CLASS}>
          {LANGUAGES.map((option) => (
            <option key={option.value} value={option.value}>
              {"key" in option ? t(option.key) : option.label}
            </option>
          ))}
        </select>
      </div>

      {PRO_TIER_ENABLED ? (
        <>
          <div className="space-y-2">
            <Label>{t("plan")}</Label>
            <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PlanCard
                selected={tier === "standard"}
                onSelect={() => setTier("standard")}
                title={t("standard")}
                price={t("stdPrice")}
                desc={t("stdDesc")}
              >
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-secondary px-2 py-px font-mono text-[11px] text-muted-foreground">.txt</span>
                </div>
              </PlanCard>
              <PlanCard
                selected={tier === "pro"}
                onSelect={() => setTier("pro")}
                title={t("business")}
                badge={t("spkId")}
                price={t("bizPrice", { n: PRO_CREDITS_PER_MINUTE })}
                desc={t("bizDesc")}
              >
                <div className="mt-2 space-y-2 border-t border-primary/25 pt-2.5">
                  <span className="text-xs text-muted-foreground">{t("deliverables")}</span>
                  <div className="flex flex-col gap-2">
                    {PRO_FORMATS.map((f) => (
                      <label key={f} className="flex items-center gap-2 text-[13px]">
                        <Checkbox
                          checked={formats.includes(f)}
                          disabled={tier !== "pro"}
                          onCheckedChange={(v) => toggleFormat(f, v === true)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span>{f === "docx" ? t("minutes") : f === "pdf" ? t("report") : t("subsSpk")}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">.{f}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </PlanCard>
            </div>
          </div>

          {tier === "pro" ? (
            <div className="max-w-md space-y-2">
              <Label htmlFor="speakers_expected">
                {t("expected")} <span className="font-normal text-muted-foreground">{t("expectedHint")}</span>
              </Label>
              <select id="speakers_expected" value={speakersExpected} onChange={(e) => setSpeakersExpected(e.target.value)} className={SELECT_CLASS}>
                <option value="">{t("notSure")}</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </>
      ) : null}

      {insufficient ? (
        <p role="alert" className="text-sm text-destructive">
          {t("insufficient")}{" "}
          <Link href="/credits" className="font-medium underline">
            {t("buyCredits")}
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? t("submitting") : t("submit")}
        </Button>
        {PRO_TIER_ENABLED ? (
          <p className="text-xs leading-4 text-muted-foreground">
            {t("consent1")}
            <Link href="/terms" className="underline">
              {t("terms")}
            </Link>
            {t("consent2")}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function PlanCard({
  selected,
  onSelect,
  title,
  badge,
  price,
  desc,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  badge?: string;
  price: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
        selected ? "border-primary bg-primary/6 ring-1 ring-primary" : "border-border bg-background hover:border-primary/50"
      }`}
    >
      <span className={`mt-0.5 grid size-4 shrink-0 place-content-center rounded-full border ${selected ? "border-primary" : "border-muted-foreground/50"}`}>
        {selected ? <span className="block size-2 rounded-full bg-primary" /> : null}
      </span>
      <div className="flex grow flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            {title}
            {badge ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-px text-[11px] font-medium text-accent-foreground">
                <Users aria-hidden="true" className="size-3" />
                {badge}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">{price}</span>
        </div>
        <span className="text-xs leading-4 text-muted-foreground">{desc}</span>
        {children}
      </div>
    </div>
  );
}

function UploadingCard({ state, onCancel }: { state: Extract<UploadState, { phase: "uploading" }>; onCancel: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const pct = state.file.size > 0 ? Math.min(100, Math.floor((state.loaded / state.file.size) * 100)) : 0;
  const remaining = state.speed > 0 ? (state.file.size - state.loaded) / state.speed : Infinity;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-content-center rounded-[10px] bg-secondary text-primary">
          <Film aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{state.file.name}</span>
          <span className="text-xs text-muted-foreground">
            {fmtBytes(state.file.size)} · {state.file.type || "—"}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <span className="font-medium">{t("uploading", { p: pct })}</span>
        <span className="text-muted-foreground">
          {t("uploadProgress", {
            done: fmtBytes(state.loaded),
            total: fmtBytes(state.file.size),
            speed: `${fmtBytes(state.speed)}/s`,
            eta: fmtEta(remaining, lang),
          })}
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs leading-4 text-accent-foreground">
        <Info aria-hidden="true" className="size-3" />
        {t("keepOpen")}
      </span>
    </div>
  );
}

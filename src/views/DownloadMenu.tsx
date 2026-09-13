"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Captions, ChevronDown, Download, FileText, Loader2, Lock, PenLine, Unlock, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRO_FORMATS, PRO_TIER_ENABLED, type ProFormat } from "@/lib/flags";
import { useLang, useT } from "@/lib/i18n";

import type { JobListItem } from "./jobs-types";
import { formatLabel, UnlockDialog, unlockCost } from "./UnlockDialog";

// The "Download ▾" cell of a finished job — three states from the design
// canvas: A standard job (business formats visible but locked + unlock CTA),
// B unlock in progress (child job running), C business job (chosen formats
// download, the rest show "+ Add", plus the editor entry).

const ICONS: Record<ProFormat, typeof FileText> = { docx: FileText, pdf: FileText, srt: Captions };

export function DownloadMenu({
  job,
  balance,
  onOpenEditor,
}: {
  job: JobListItem;
  balance: number;
  onOpenEditor: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [adding, setAdding] = useState<ProFormat | null>(null);

  const isPro = job.tier === "pro";
  const cost = unlockCost(job);
  const reuploadNeeded = job.source_kind === "upload" && !job.audio_available;

  async function addFormat(f: ProFormat) {
    setAdding(f);
    try {
      await fetch(`/api/jobs/${job.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: [f] }),
      });
      router.refresh();
    } finally {
      setAdding(null);
    }
  }

  const txtHref = `/api/jobs/${job.id}/export?format=txt`;

  // Flag off → exactly the M4 cell.
  if (!PRO_TIER_ENABLED) {
    return (
      <a href={txtHref} download className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
        <Download aria-hidden="true" className="size-3.5" />
        .txt
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline focus-visible:outline-none">
          <Download aria-hidden="true" className="size-3.5" />
          {t("download")}
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("standard")}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <a href={txtHref} download>
              <FileText aria-hidden="true" />
              {t("plainText")}
              <Ext>.txt</Ext>
            </a>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel
            className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${isPro ? "text-primary" : "text-muted-foreground"}`}
          >
            {isPro || job.unlocking ? <Users aria-hidden="true" className="size-3" /> : <Lock aria-hidden="true" className="size-3" />}
            {t("bizLabel")}
          </DropdownMenuLabel>

          {PRO_FORMATS.map((f) => {
            const Icon = ICONS[f];
            const label = formatLabel(t, f);
            if (isPro && job.formats.includes(f)) {
              return (
                <DropdownMenuItem key={f} asChild>
                  <a href={`/api/jobs/${job.id}/export?format=${f}&lang=${lang}`} download>
                    <Icon aria-hidden="true" />
                    {label}
                    <Ext>.{f}</Ext>
                  </a>
                </DropdownMenuItem>
              );
            }
            if (isPro) {
              return (
                <DropdownMenuItem
                  key={f}
                  disabled={adding !== null}
                  onSelect={(e) => {
                    e.preventDefault();
                    void addFormat(f);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span className="text-muted-foreground">{label}</span>
                  <span className="ml-auto text-xs font-medium text-primary">{adding === f ? t("adding") : t("add")}</span>
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem key={f} disabled>
                <Icon aria-hidden="true" />
                {label}
                <Ext>.{f}</Ext>
              </DropdownMenuItem>
            );
          })}

          {isPro ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpenEditor}>
                <PenLine aria-hidden="true" />
                {t("openEditor")}
              </DropdownMenuItem>
            </>
          ) : job.unlocking ? (
            <div className="m-1 flex flex-col gap-2 rounded-lg bg-accent p-2.5 text-accent-foreground">
              <span className="inline-flex animate-pulse items-center gap-2 text-[13px] font-medium">
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                {t("identifying")}
              </span>
              <div className="h-1 overflow-hidden rounded-full bg-card">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
              </div>
              <span className="text-[11px] leading-[14px]">{t("unlockProgress", { n: cost })}</span>
            </div>
          ) : reuploadNeeded ? (
            <p className="m-1 rounded-lg bg-primary/8 p-2.5 text-[11px] leading-[14px] text-muted-foreground">{t("reupload")}</p>
          ) : (
            <div className="m-1 flex flex-col gap-1.5 rounded-lg bg-primary/8 p-2.5">
              <DropdownMenuItem
                onSelect={() => setUnlockOpen(true)}
                className="justify-center bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground"
              >
                <Unlock aria-hidden="true" />
                {t("unlockFor", { n: cost })}
              </DropdownMenuItem>
              <span className="text-center text-[11px] leading-[14px] text-muted-foreground">{t("unlockNote")}</span>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!isPro && !job.unlocking ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="size-3" />
          {t("speakersLocked")}
        </span>
      ) : null}
      {job.unlocking ? (
        <span className="inline-flex animate-pulse items-center gap-1 text-xs text-accent-foreground">
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          {t("identifying")}
        </span>
      ) : null}

      {unlockOpen ? <UnlockDialog job={job} balance={balance} open={unlockOpen} onOpenChange={setUnlockOpen} /> : null}
    </div>
  );
}

function Ext({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto font-mono text-[11px] text-muted-foreground">{children}</span>;
}

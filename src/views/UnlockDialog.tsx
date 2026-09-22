"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PRO_CREDITS_PER_MINUTE, PRO_FORMATS, STANDARD_CREDITS_PER_MINUTE, type ProFormat } from "@/lib/flags";
import { useT } from "@/lib/i18n";

import type { JobListItem } from "./jobs-types";

// "解鎖講者識別" — confirms the price (the DIFFERENCE between the business and
// standard rate for the minutes already billed), lets the user pick formats,
// then POSTs /api/jobs/[id]/unlock. The row flips to "Identifying speakers…"
// on the next auto-refresh and the worker charges only on completion.

export function formatLabel(t: ReturnType<typeof useT>, f: ProFormat): string {
  return f === "docx" ? t("minutes") : t("subsSpk");
}

export function unlockCost(job: JobListItem): number {
  const minutes = job.billed_minutes ?? 0;
  return minutes * Math.max(0, PRO_CREDITS_PER_MINUTE - STANDARD_CREDITS_PER_MINUTE);
}

export function UnlockDialog({
  job,
  balance,
  open,
  onOpenChange,
  initialFormats = ["docx"],
}: {
  job: JobListItem;
  balance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFormats?: ProFormat[];
}) {
  const t = useT();
  const router = useRouter();
  const [formats, setFormats] = useState<ProFormat[]>(initialFormats);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = unlockCost(job);
  const after = balance - cost;
  const enough = after >= 0;

  async function confirm() {
    setError(null);
    setPending(true);
    try {
      const r = await fetch(`/api/jobs/${job.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats }),
      });
      const body = (await r.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!r.ok) {
        if (body?.code === "reupload_required") setError(t("reupload"));
        else if (r.status === 402) setError(t("notEnough", { n: cost }));
        else setError(body?.error ?? `HTTP ${r.status}`);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      setError(t("networkError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">{t("unlockTitle")}</DialogTitle>
          <DialogDescription>{t("unlockDesc")}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-card px-4 py-1 text-sm">
          <Row label={t("video")}>
            <span className="max-w-[60%] truncate font-mono text-xs">{job.source}</span>
          </Row>
          <Row label={t("duration")}>{job.billed_minutes != null ? t("minutesN", { n: job.billed_minutes }) : "—"}</Row>
          <Row label={t("cost")}>
            <span className="font-semibold text-primary">{t("creditsN", { n: cost })}</span>
          </Row>
          <Row label={t("balanceAfter")} last>
            <span>
              <span className="text-muted-foreground">{balance} →</span> {after}
            </span>
          </Row>
        </div>

        <div className="space-y-2">
          <Label>{t("formatsToGen")}</Label>
          <div className="flex flex-col gap-2">
            {PRO_FORMATS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  checked={formats.includes(f)}
                  onCheckedChange={(v) =>
                    setFormats((prev) => (v === true ? Array.from(new Set([...prev, f])) : prev.filter((x) => x !== f)))
                  }
                />
                <span>{formatLabel(t, f)}</span>
                <span className="font-mono text-[11px] text-muted-foreground">.{f}</span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs leading-4 text-muted-foreground">{t("unlockLong")}</p>

        {!enough ? (
          <p role="alert" className="text-sm text-destructive">
            {t("notEnough", { n: cost })}{" "}
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

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={confirm} disabled={pending || !enough || formats.length === 0}>
            <Unlock aria-hidden="true" className="size-4" />
            {t("unlockFor", { n: cost })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2.5 ${last ? "" : "border-b border-border"}`}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

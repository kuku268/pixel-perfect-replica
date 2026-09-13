"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRO_TIER_ENABLED } from "@/lib/flags";
import { useT } from "@/lib/i18n";

import { DownloadMenu } from "./DownloadMenu";
import type { JobListItem } from "./jobs-types";
import { SummaryCell } from "./SummaryCell";
import { TranscriptDialog } from "./TranscriptDialog";

// The "Your transcriptions" table. Client component so the header can switch
// language and each row can open the download menu / unlock dialog / editor.

function truncate(value: string, max = 50) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

// pending / downloading -> muted, transcribe -> accent, done -> primary (forest green),
// insufficient_credits / failed -> destructive. In-flight statuses pulse.
function statusClasses(status: string) {
  if (status === "done") return "bg-primary/12 text-primary";
  if (status === "insufficient_credits" || status === "failed") return "bg-destructive/12 text-destructive";
  if (status === "transcribe") return "animate-pulse bg-accent text-accent-foreground";
  return "animate-pulse bg-muted text-muted-foreground";
}

export function JobsTable({ jobs, balance }: { jobs: JobListItem[]; balance: number }) {
  const t = useT();
  const [editing, setEditing] = useState<JobListItem | null>(null);

  const statusLabel = (s: string) =>
    s === "pending"
      ? t("stPending")
      : s === "downloading"
        ? t("stDownloading")
        : s === "transcribe"
          ? t("stTranscribe")
          : s === "done"
            ? t("stDone")
            : s === "insufficient_credits"
              ? t("stInsufficient")
              : s === "failed"
                ? t("stFailed")
                : s;

  const relativeTime = (iso: string) => {
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return t("justNow");
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return t("minutesAgo", { n: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("hoursAgo", { n: hours });
    return t("daysAgo", { n: Math.round(hours / 24) });
  };

  if (jobs.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{t("noJobs")}</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28 whitespace-nowrap">{t("thCreated")}</TableHead>
            <TableHead>{t("thSource")}</TableHead>
            <TableHead className="w-32">{t("thStatus")}</TableHead>
            {PRO_TIER_ENABLED ? <TableHead className="w-24">{t("thPlan")}</TableHead> : null}
            <TableHead className="w-36">{t("thDownloads")}</TableHead>
            <TableHead className="w-32">{t("thSummary")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{relativeTime(job.created_at)}</TableCell>
              <TableCell className="max-w-[16rem] truncate font-mono text-xs" title={job.source}>
                {truncate(job.source)}
              </TableCell>
              <TableCell>
                <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses(job.status)}`}>
                  {statusLabel(job.status)}
                </span>
                {job.status === "failed" && job.error_message ? (
                  <span className="mt-1 flex items-start gap-1 text-[11px] leading-4 text-muted-foreground" title={job.error_message}>
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                    <span className="line-clamp-2">{t("failedWhy", { reason: job.error_message })}</span>
                  </span>
                ) : null}
              </TableCell>
              {PRO_TIER_ENABLED ? (
                <TableCell>
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      job.tier === "pro" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {job.tier === "pro" ? t("business") : t("standard")}
                  </span>
                </TableCell>
              ) : null}
              <TableCell>
                {job.status === "done" ? (
                  <DownloadMenu job={job} balance={balance} onOpenEditor={() => setEditing(job)} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <SummaryCell jobId={job.id} status={job.status} initialSummary={job.summary_content} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing ? <TranscriptDialog job={editing} open onOpenChange={(o) => !o && setEditing(null)} /> : null}
    </div>
  );
}

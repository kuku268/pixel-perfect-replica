import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { CreditsBadge } from "@/components/CreditsBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { SummaryCell } from "@/views/SummaryCell";
import { UploadForm } from "@/views/UploadForm";

export const metadata: Metadata = {
  title: "Upload — Video Speed Reader",
  description: "Submit a video URL and get a transcript back.",
  robots: { index: false, follow: false },
};

// Job rows change as the worker picks them up, so never cache this page.
export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  created_at: string;
  video_source_url: string;
  status: string;
  summary_content: string | null;
};

function relativeTime(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function truncate(value: string, max = 50) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

// pending / downloading -> muted, transcribe -> accent, done -> primary (forest green),
// insufficient_credits -> destructive (M2 terminal state; buy credits and resubmit).
function statusClasses(status: string) {
  if (status === "done") return "bg-primary/12 text-primary";
  if (status === "insufficient_credits") return "bg-destructive/12 text-destructive";
  if (status === "transcribe") return "bg-accent text-accent-foreground";
  return "bg-muted text-muted-foreground";
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default async function UploadPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("jobs")
    .select("id, created_at, video_source_url, status, current_session_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch the summaries in one follow-up query rather than a PostgREST embedded
  // select — the relationship-hint syntax is easy to get subtly wrong and only
  // fails at runtime. RLS already limits job_sessions to this user's rows.
  const sessionIds = (data ?? [])
    .map((row) => row.current_session_id)
    .filter((value): value is string => Boolean(value));

  const summaryBySessionId = new Map<string, string | null>();
  if (sessionIds.length > 0) {
    const { data: sessions } = await supabase
      .from("job_sessions")
      .select("id, summary_content")
      .in("id", sessionIds);

    for (const session of sessions ?? []) {
      summaryBySessionId.set(session.id, session.summary_content);
    }
  }

  const jobs: JobRow[] = (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    video_source_url: row.video_source_url,
    status: row.status,
    summary_content: row.current_session_id
      ? (summaryBySessionId.get(row.current_session_id) ?? null)
      : null,
  }));

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <BrandMark to="/app" />
          <div className="flex items-center gap-4">
            <CreditsBadge />
            <Link href="/app" className="text-sm font-medium text-primary hover:underline">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-14">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">
          Transcribe a video
        </h1>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Your transcriptions
          </h2>

          {jobs.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No transcriptions yet. Submit your first video below.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Created</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-28">Transcript</TableHead>
                    <TableHead className="w-32">Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-muted-foreground">
                        {relativeTime(job.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {truncate(job.video_source_url)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses(job.status)}`}
                        >
                          {job.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {job.status === "done" ? (
                          <a
                            href={`/api/jobs/${job.id}/transcript`}
                            download={`transcript-${job.id.slice(0, 8)}.txt`}
                            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                          >
                            <DownloadIcon />
                            .txt
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <SummaryCell
                          jobId={job.id}
                          status={job.status}
                          initialSummary={job.summary_content}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">New transcription</h2>
          <UploadForm />
        </section>
      </main>
    </div>
  );
}

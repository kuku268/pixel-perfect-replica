import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
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

// pending / downloading -> muted, transcribe -> accent, done -> primary (forest green).
function statusClasses(status: string) {
  if (status === "done") return "bg-primary/12 text-primary";
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
    .select("id, created_at, video_source_url, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const jobs = (data ?? []) as JobRow[];

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <BrandMark to="/app" />
          <Link href="/app" className="text-sm font-medium text-primary hover:underline">
            Dashboard
          </Link>
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

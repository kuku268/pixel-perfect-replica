import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { CreditsBadge } from "@/components/CreditsBadge";
import { LangProvider, LangToggle } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { JobsAutoRefresh } from "@/views/JobsAutoRefresh";
import { JobsTable } from "@/views/JobsTable";
import type { JobListItem } from "@/views/jobs-types";
import { PageStrings } from "@/views/PageStrings";
import { UploadForm } from "@/views/UploadForm";

export const metadata: Metadata = {
  title: "Upload — Video Speed Reader",
  description: "Submit a video URL and get a transcript back.",
  robots: { index: false, follow: false },
};

// Job rows change as the worker picks them up, so never cache this page.
export const dynamic = "force-dynamic";

// A job is still moving until it reaches one of these.
const TERMINAL_STATUSES = new Set(["done", "insufficient_credits", "failed"]);
const IN_FLIGHT = ["pending", "downloading", "transcribe"];

export default async function UploadPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  // Jobs and balance are read in the same render, so the auto-refresh that
  // moves a row to `done` shows the deducted balance in the same tick.
  // Unlock child jobs (parent_job_id set) are work records, not rows: the
  // parent row shows "Identifying speakers…" while one is in flight.
  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, created_at, video_source_url, status, current_session_id, error_message, tier, formats, source_kind, original_filename, audio_key, edit_deadline, exported_at",
      )
      .eq("user_id", user.id)
      .is("parent_job_id", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("credits_balance").eq("id", user.id).single(),
  ]);
  const balance = Number(profile?.credits_balance ?? 0);
  const rows = data ?? [];
  const jobIds = rows.map((r) => r.id);

  const sessionIds = rows.map((row) => row.current_session_id).filter((v): v is string => Boolean(v));

  // Three follow-up queries rather than PostgREST embedded selects — the
  // relationship-hint syntax is easy to get subtly wrong and only fails at
  // runtime. RLS already limits every table to this user's rows.
  const [sessionsRes, childrenRes, ledgerRes] = await Promise.all([
    sessionIds.length ? supabase.from("job_sessions").select("id, summary_content").in("id", sessionIds) : Promise.resolve({ data: [] }),
    jobIds.length ? supabase.from("jobs").select("parent_job_id").in("parent_job_id", jobIds).in("status", IN_FLIGHT) : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase.from("credit_transactions").select("job_id, amount").in("job_id", jobIds).eq("type", "deduction").lt("amount", 0)
      : Promise.resolve({ data: [] }),
  ]);

  const summaryBySessionId = new Map<string, string | null>();
  for (const s of sessionsRes.data ?? []) summaryBySessionId.set(s.id, s.summary_content);
  const unlocking = new Set((childrenRes.data ?? []).map((c) => c.parent_job_id).filter(Boolean));
  const minutesByJob = new Map<string, number>();
  for (const tx of ledgerRes.data ?? []) if (tx.job_id) minutesByJob.set(tx.job_id, Math.abs(Number(tx.amount)));

  const now = Date.now();
  const jobs: JobListItem[] = rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    source: row.source_kind === "upload" ? (row.original_filename ?? "uploaded file") : row.video_source_url,
    source_kind: row.source_kind,
    status: row.status,
    error_message: row.error_message,
    tier: row.tier,
    formats: row.formats ?? [],
    billed_minutes: minutesByJob.get(row.id) ?? null,
    unlocking: unlocking.has(row.id),
    audio_available: !!row.audio_key && !!row.edit_deadline && new Date(row.edit_deadline).getTime() > now,
    edit_deadline: row.edit_deadline,
    exported_at: row.exported_at,
    summary_content: row.current_session_id ? (summaryBySessionId.get(row.current_session_id) ?? null) : null,
  }));

  const hasActiveJobs = jobs.some((job) => !TERMINAL_STATUSES.has(job.status) || job.unlocking);

  return (
    <LangProvider>
      <div className="min-h-screen bg-hero">
        <header className="border-b border-border/70 bg-background/70 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <BrandMark to="/app" />
            <div className="flex items-center gap-4">
              <CreditsBadge balance={balance} />
              <LangToggle />
              <Link href="/app" className="text-sm font-medium text-primary hover:underline">
                <PageStrings k="dashboard" />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-5 py-14">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">
            <PageStrings k="h1" />
          </h1>

          <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                <PageStrings k="yours" />
              </h2>
              <JobsAutoRefresh active={hasActiveJobs} />
            </div>
            <JobsTable jobs={jobs} balance={balance} />
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              <PageStrings k="newT" />
            </h2>
            <UploadForm />
          </section>
        </main>
      </div>
    </LangProvider>
  );
}

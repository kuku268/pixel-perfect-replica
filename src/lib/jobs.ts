// Shared loaders for the /api/jobs/[id]/* routes.
//
// Every route authenticates from the cookie session, then reads with the
// Secret-key admin client (bypasses RLS) — so ownership MUST be re-imposed by
// hand here (.eq("user_id", user.id)). Never return a job without it.

import { NextResponse } from "next/server";

import type { Database } from "@/integrations/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseOverrides, parseSegments, parseSpeakers, type Overrides, type Segment, type Speakers } from "@/lib/transcript";

export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
export type SessionRow = Database["public"]["Tables"]["job_sessions"]["Row"];

export type OwnedJob = { user: { id: string }; admin: ReturnType<typeof createAdminClient>; job: JobRow };

/** 401 / 404 as a NextResponse, otherwise the job (owned by the caller). */
export async function loadOwnedJob(id: string): Promise<OwnedJob | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: job } = await admin.from("jobs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  return { user: { id: user.id }, admin, job };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export type Transcript = {
  session: SessionRow;
  segments: Segment[];
  speakers: Speakers;
  overrides: Overrides;
};

/** The job's current session with parsed transcript data; null if none yet. */
export async function loadTranscript(admin: OwnedJob["admin"], job: JobRow): Promise<Transcript | null> {
  if (!job.current_session_id) return null;
  const { data: session } = await admin.from("job_sessions").select("*").eq("id", job.current_session_id).single();
  if (!session) return null;
  return {
    session,
    segments: parseSegments(session.segments),
    speakers: parseSpeakers(session.speakers),
    overrides: parseOverrides(session.overrides) ?? {},
  };
}

export function isProJob(job: JobRow): boolean {
  return job.tier === "pro";
}

/** Edit window still open (business tier, has a deadline in the future). */
export function editWindowOpen(job: JobRow, now = Date.now()): boolean {
  return !!job.edit_deadline && new Date(job.edit_deadline).getTime() > now;
}

/** What the job list / editor shows as the source: filename for uploads. */
export function displaySource(job: JobRow): string {
  if (job.source_kind === "upload") return job.original_filename ?? "uploaded file";
  return job.video_source_url;
}

/** Minutes the standard run was billed for — from the ledger, never guessed. */
export async function billedMinutes(admin: OwnedJob["admin"], job: JobRow): Promise<number | null> {
  const { data } = await admin
    .from("credit_transactions")
    .select("amount")
    .eq("job_id", job.id)
    .eq("type", "deduction")
    .lt("amount", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Math.abs(Number(data.amount)) : null;
}

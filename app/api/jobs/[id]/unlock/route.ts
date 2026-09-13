import { NextResponse } from "next/server";

import { PRO_CREDITS_PER_MINUTE, PRO_TIER_ENABLED, STANDARD_CREDITS_PER_MINUTE, parseFormats } from "@/lib/flags";
import { billedMinutes, isProJob, isResponse, loadOwnedJob } from "@/lib/jobs";

// POST /api/jobs/[id]/unlock  body: { formats: ["docx","pdf","srt"] }
//
// Standard job → business: creates a CHILD job (parent_job_id) that re-runs
// the audio through the speaker engine. The worker charges only the rate
// difference (ledger type 'pro_unlock') and, when done, folds the result back
// onto the parent — so the UI keeps polling the parent row as usual.
//
// Business job + more formats: nothing to recompute, just extend jobs.formats
// (free — the formats are render options over the same segments).

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  if (!PRO_TIER_ENABLED) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { id } = await params;
  const loaded = await loadOwnedJob(id);
  if (isResponse(loaded)) return loaded;
  const { user, admin, job } = loaded;

  const body = (await request.json().catch(() => ({}))) as { formats?: unknown };
  const formats = parseFormats(body.formats);
  if (formats === null || formats.length === 0) {
    return NextResponse.json({ error: "formats must be a non-empty subset of docx, pdf, srt" }, { status: 400 });
  }
  if (job.status !== "done") {
    return NextResponse.json({ error: "job is not finished" }, { status: 409 });
  }

  // Already business tier: extend the format list and stop.
  if (isProJob(job)) {
    const merged = Array.from(new Set([...job.formats, ...formats]));
    await admin.from("jobs").update({ formats: merged, updated_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ ok: true, job_id: job.id, formats: merged, charged: 0 });
  }

  // One unlock at a time.
  const { data: inflight } = await admin
    .from("jobs")
    .select("id, status")
    .eq("parent_job_id", job.id)
    .in("status", ["pending", "downloading", "transcribe"])
    .limit(1)
    .maybeSingle();
  if (inflight) {
    return NextResponse.json({ error: "unlock already in progress", child_job_id: inflight.id }, { status: 409 });
  }

  // The worker needs the audio again. URL jobs re-download; upload jobs had
  // their original deleted after the first run, so they can only be unlocked
  // if a kept mp3 exists (it never does for a standard job → re-upload).
  if (job.source_kind === "upload" && !job.audio_key) {
    return NextResponse.json(
      { error: "the uploaded file is no longer stored — please upload it again as a business-tier job", code: "reupload_required" },
      { status: 409 },
    );
  }

  const minutes = await billedMinutes(admin, job);
  if (minutes === null) {
    return NextResponse.json({ error: "cannot determine the billed length of this job" }, { status: 409 });
  }
  const cost = minutes * Math.max(0, PRO_CREDITS_PER_MINUTE - STANDARD_CREDITS_PER_MINUTE);

  const { data: profile } = await admin.from("profiles").select("credits_balance").eq("id", user.id).single();
  const balance = Number(profile?.credits_balance ?? 0);
  if (balance < cost) {
    return NextResponse.json(
      { error: `unlock needs ${cost} credits, you have ${balance}`, code: "insufficient_credits", cost, balance },
      { status: 402 },
    );
  }

  const { data: child, error: childError } = await admin
    .from("jobs")
    .insert({
      user_id: user.id,
      video_source_url: job.video_source_url,
      topic: job.topic,
      language: job.language,
      status: "pending",
      tier: "pro",
      formats,
      speakers_expected: job.speakers_expected,
      source_kind: job.source_kind,
      original_filename: job.original_filename,
      parent_job_id: job.id,
    })
    .select("id")
    .single();
  if (childError || !child) {
    return NextResponse.json({ error: childError?.message ?? "could not create unlock job" }, { status: 500 });
  }

  const { data: session } = await admin
    .from("job_sessions")
    .insert({ job_id: child.id, session_number: 1 })
    .select("id")
    .single();
  if (session) {
    await admin.from("jobs").update({ current_session_id: session.id }).eq("id", child.id);
  }

  return NextResponse.json({ ok: true, job_id: job.id, child_job_id: child.id, formats, cost, minutes });
}

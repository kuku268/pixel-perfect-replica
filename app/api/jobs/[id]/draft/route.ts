import { NextResponse } from "next/server";

import { PRO_TIER_ENABLED } from "@/lib/flags";
import { displaySource, editWindowOpen, isProJob, isResponse, loadOwnedJob, loadTranscript } from "@/lib/jobs";
import { parseOverrides, parseSpeakers } from "@/lib/transcript";

// GET   /api/jobs/[id]/draft  → everything the editor needs in one call
// PATCH /api/jobs/[id]/draft  body: { speakers?, overrides? }
//
// "儲存" in the editor. Speakers (rename / recolour) and overrides (reassign,
// text, timecodes) are stored NEXT TO the worker's segments, never over
// them, so the original is always recoverable and every export re-applies
// the edits. Saving is allowed only for business-tier jobs while the 3-day
// edit window is open; exporting later still uses the saved edits.

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!PRO_TIER_ENABLED) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { id } = await params;
  const loaded = await loadOwnedJob(id);
  if (isResponse(loaded)) return loaded;
  const { admin, job } = loaded;

  if (job.status !== "done") return NextResponse.json({ error: "not ready" }, { status: 409 });
  const transcript = await loadTranscript(admin, job);
  if (!transcript) return NextResponse.json({ error: "transcript missing" }, { status: 500 });

  return NextResponse.json(
    {
      job: {
        id: job.id,
        tier: job.tier,
        formats: job.formats,
        source: displaySource(job),
        topic: job.topic,
        created_at: job.created_at,
        audio_available: !!job.audio_key && editWindowOpen(job),
        edit_deadline: job.edit_deadline,
        exported_at: job.exported_at,
        can_edit: isProJob(job) && editWindowOpen(job),
      },
      segments: transcript.segments,
      speakers: transcript.speakers,
      overrides: transcript.overrides,
      summary: transcript.session.summary_content,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request, { params }: Params) {
  if (!PRO_TIER_ENABLED) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { id } = await params;
  const loaded = await loadOwnedJob(id);
  if (isResponse(loaded)) return loaded;
  const { admin, job } = loaded;

  if (!isProJob(job)) {
    return NextResponse.json({ error: "editing is a business-tier feature", code: "unlock_required" }, { status: 403 });
  }
  if (!editWindowOpen(job)) {
    return NextResponse.json({ error: "edit window closed", code: "edit_window_closed" }, { status: 410 });
  }
  if (!job.current_session_id) return NextResponse.json({ error: "transcript missing" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { speakers?: unknown; overrides?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "json body required" }, { status: 400 });
  }

  const patch: { speakers?: ReturnType<typeof parseSpeakers>; overrides?: NonNullable<ReturnType<typeof parseOverrides>> } = {};
  if (body.speakers !== undefined) {
    patch.speakers = parseSpeakers(body.speakers);
  }
  if (body.overrides !== undefined) {
    const overrides = parseOverrides(body.overrides);
    if (overrides === null) {
      return NextResponse.json({ error: "overrides malformed (keys = segment index; speaker/text/start/end; start < end)" }, { status: 400 });
    }
    if (Object.keys(overrides).length > 5000) {
      return NextResponse.json({ error: "too many overrides" }, { status: 413 });
    }
    patch.overrides = overrides;
  }
  if (!("speakers" in patch) && !("overrides" in patch)) {
    return NextResponse.json({ error: "nothing to save" }, { status: 400 });
  }

  const { error } = await admin.from("job_sessions").update(patch).eq("id", job.current_session_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("jobs").update({ updated_at: new Date().toISOString() }).eq("id", job.id);

  return NextResponse.json({ ok: true, saved: Object.keys(patch), edit_deadline: job.edit_deadline });
}

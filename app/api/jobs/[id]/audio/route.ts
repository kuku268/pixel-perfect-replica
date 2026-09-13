import { NextResponse } from "next/server";

import { PRO_TIER_ENABLED } from "@/lib/flags";
import { editWindowOpen, isResponse, loadOwnedJob } from "@/lib/jobs";
import { PRESIGN_SECONDS, presignAudio } from "@/lib/s3";

// GET /api/jobs/[id]/audio → { url, expires_at }
//
// A 15-minute presigned S3 GET for the editor's <audio> player. The bucket is
// private; only the owner, only while the mp3 is still kept (until export or
// the 3-day edit deadline). The player re-requests when a URL expires.

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!PRO_TIER_ENABLED) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { id } = await params;
  const loaded = await loadOwnedJob(id);
  if (isResponse(loaded)) return loaded;
  const { job } = loaded;

  if (!job.audio_key) {
    return NextResponse.json({ error: "audio no longer stored", code: "audio_gone" }, { status: 410 });
  }
  if (!editWindowOpen(job)) {
    return NextResponse.json({ error: "edit window closed", code: "edit_window_closed" }, { status: 410 });
  }

  const url = await presignAudio(job.audio_key);
  return NextResponse.json(
    { url, expires_at: new Date(Date.now() + PRESIGN_SECONDS * 1000).toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

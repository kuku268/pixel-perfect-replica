import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { deleteObject } from "@/lib/s3";

// GET /api/cron/audio-reaper — Vercel Cron, daily (vercel.json).
//
// Business-tier mp3s are kept only until "匯出並刪除音檔" or the 3-day edit
// deadline, whichever comes first. Export deletes immediately; this job
// sweeps the ones that simply expired. Transcripts are untouched.
//
// Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled runs; set
// CRON_SECRET in the project env so nobody else can trigger a sweep.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: expired, error } = await admin
    .from("jobs")
    .select("id, audio_key")
    .not("audio_key", "is", null)
    .lt("edit_deadline", now)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  const failed: string[] = [];
  for (const job of expired ?? []) {
    try {
      await deleteObject(job.audio_key!);
      await admin
        .from("jobs")
        .update({ audio_key: null, edit_deadline: null, updated_at: now })
        .eq("id", job.id);
      deleted += 1;
    } catch (e) {
      failed.push(`${job.id}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ ok: failed.length === 0, checked: expired?.length ?? 0, deleted, failed });
}

import { NextResponse } from "next/server";

import { buildMinutesDocx } from "@/lib/exports/docx";
import { PRO_TIER_ENABLED, type ProFormat } from "@/lib/flags";
import { displaySource, isProJob, isResponse, loadOwnedJob, loadTranscript } from "@/lib/jobs";
import { deleteObject } from "@/lib/s3";
import { applyOverrides, toSrt, toTxt, toVtt } from "@/lib/transcript";

// GET  /api/jobs/[id]/export?format=txt|srt|vtt|docx&lang=zh|en
//   Renders the requested file on demand from segments ⊕ overrides.
//   txt is the standard-tier download (no timestamps, no speakers) and is
//   always allowed; srt/vtt/docx need a business-tier job that
//   requested that format (post-hoc "+ add" just updates jobs.formats).
//
// POST /api/jobs/[id]/export
//   "匯出並刪除音檔": stamps exported_at and deletes the kept mp3 right away.
//   The transcript stays; only the audio (and the edit window) goes.

type Params = { params: Promise<{ id: string }> };

const FORMATS = new Set(["txt", "srt", "vtt", "docx"]);

function requiredProFormat(format: string): ProFormat | null {
  if (format === "srt" || format === "vtt") return "srt";
  if (format === "docx") return format;
  return null;
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const loaded = await loadOwnedJob(id);
  if (isResponse(loaded)) return loaded;
  const { admin, job } = loaded;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "txt";
  const lang = url.searchParams.get("lang") ?? "zh";
  if (!FORMATS.has(format)) {
    return NextResponse.json({ error: "format must be txt, srt, vtt or docx" }, { status: 400 });
  }
  if (job.status !== "done") {
    return NextResponse.json({ error: "not ready" }, { status: 409 });
  }

  const needs = requiredProFormat(format);
  if (needs) {
    if (!PRO_TIER_ENABLED) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!isProJob(job)) {
      return NextResponse.json({ error: "business tier required", code: "unlock_required" }, { status: 403 });
    }
    if (!job.formats.includes(needs)) {
      return NextResponse.json({ error: `format ${needs} was not requested for this job`, code: "format_not_requested" }, { status: 403 });
    }
  }

  const transcript = await loadTranscript(admin, job);
  if (!transcript) {
    return NextResponse.json({ error: "transcript missing" }, { status: 500 });
  }

  // Standard jobs made before Step 2 have text but no segments: serve the
  // stored txt so old downloads keep working.
  if (format === "txt" && transcript.segments.length === 0) {
    const txt = transcript.session.subtitle_txt_content ?? "";
    return file(txt, "text/plain; charset=utf-8", `transcript-${id.slice(0, 8)}.txt`);
  }

  const segments = applyOverrides(transcript.segments, transcript.overrides);
  const speakers = isProJob(job) ? transcript.speakers : null;
  const base = `transcript-${id.slice(0, 8)}`;

  switch (format) {
    case "txt":
      return file(toTxt(segments), "text/plain; charset=utf-8", `${base}.txt`);
    case "srt":
      return file(toSrt(segments, speakers), "application/x-subrip; charset=utf-8", `${base}.srt`);
    case "vtt":
      return file(toVtt(segments, speakers), "text/vtt; charset=utf-8", `${base}.vtt`);
    case "docx": {
      const buf = await buildMinutesDocx({
        title: job.topic || displaySource(job),
        createdAt: job.created_at,
        source: displaySource(job),
        segments,
        speakers: speakers ?? {},
        summary: transcript.session.summary_content,
        lang,
      });
      return file(buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `minutes-${id.slice(0, 8)}.docx`);
    }
    default:
      return NextResponse.json({ error: "unsupported" }, { status: 400 });
  }
}

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const loaded = await loadOwnedJob(id);
  if (isResponse(loaded)) return loaded;
  const { admin, job } = loaded;

  if (!PRO_TIER_ENABLED) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status !== "done") return NextResponse.json({ error: "not ready" }, { status: 409 });

  if (job.audio_key) {
    try {
      await deleteObject(job.audio_key);
    } catch (e) {
      return NextResponse.json({ error: `could not delete audio: ${(e as Error).message}` }, { status: 502 });
    }
  }
  await admin
    .from("jobs")
    .update({ exported_at: new Date().toISOString(), audio_key: null, edit_deadline: null, updated_at: new Date().toISOString() })
    .eq("id", job.id);

  return NextResponse.json({ ok: true, audio_deleted: !!job.audio_key });
}

function file(body: string | Buffer, contentType: string, filename: string) {
  return new NextResponse(body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

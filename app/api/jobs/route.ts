import { NextResponse } from "next/server";

import { PRO_CREDITS_PER_MINUTE, PRO_TIER_ENABLED, STANDARD_CREDITS_PER_MINUTE, UPLOAD_ENABLED, parseFormats } from "@/lib/flags";
import { isOwnUploadKey, objectExists } from "@/lib/s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type JobRequestBody = {
  video_source_url?: unknown;
  topic?: unknown;
  language?: unknown;
  // Business tier (Step 3) — all optional; absent = the M4 standard job.
  tier?: unknown;
  formats?: unknown;
  speakers_expected?: unknown;
  // Local upload (Step 3) — the browser PUT the file to S3 first via
  // POST /api/uploads/presign and hands back the key it was given.
  source_kind?: unknown;
  upload_key?: unknown;
  original_filename?: unknown;
};

// 'auto' = let Whisper detect per chunk (fixes zh+en recordings being
// translated instead of transcribed when 'zh' was forced).
const LANGUAGES = new Set(["auto", "zh", "en", "ja"]);

export async function POST(request: Request) {
  // 1. Authenticate the caller from the cookie session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as JobRequestBody;

  // --- source -------------------------------------------------------------
  const sourceKind = body.source_kind === "upload" ? "upload" : "url";
  let videoSourceUrl = typeof body.video_source_url === "string" ? body.video_source_url.trim() : "";
  let uploadKey: string | null = null;
  let originalFilename: string | null = null;

  if (sourceKind === "upload") {
    if (!UPLOAD_ENABLED) {
      return NextResponse.json({ error: "uploads are not enabled" }, { status: 404 });
    }
    uploadKey = typeof body.upload_key === "string" ? body.upload_key : "";
    // The key must be one this user was issued — never trust a key that points
    // at someone else's prefix, and never one that is not in uploads/ at all.
    if (!isOwnUploadKey(uploadKey, user.id)) {
      return NextResponse.json({ error: "invalid upload_key" }, { status: 400 });
    }
    if (!(await objectExists(uploadKey))) {
      return NextResponse.json({ error: "upload not found — did the browser upload finish?" }, { status: 400 });
    }
    originalFilename =
      typeof body.original_filename === "string" && body.original_filename.trim()
        ? body.original_filename.trim().slice(0, 200)
        : null;
    // Not a real URL, but the column is NOT NULL and the job list shows the
    // original filename instead (Step 4).
    videoSourceUrl = `upload://${uploadKey}`;
  } else {
    if (!videoSourceUrl) {
      return NextResponse.json({ error: "video_source_url required" }, { status: 400 });
    }
    // Reject anything the worker could not fetch, so the failure surfaces here
    // rather than as a job that sits in 'pending' forever.
    let parsed: URL;
    try {
      parsed = new URL(videoSourceUrl);
    } catch {
      return NextResponse.json({ error: "video_source_url must be a valid URL" }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "video_source_url must be http or https" }, { status: 400 });
    }
  }

  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim() : null;
  const language = typeof body.language === "string" && LANGUAGES.has(body.language) ? body.language : "zh";

  // --- tier ---------------------------------------------------------------
  const tier = body.tier === "pro" ? "pro" : "standard";
  if (tier === "pro" && !PRO_TIER_ENABLED) {
    return NextResponse.json({ error: "business tier is not enabled" }, { status: 404 });
  }
  const formats = tier === "pro" ? parseFormats(body.formats) : [];
  if (formats === null) {
    return NextResponse.json({ error: "formats must be a subset of docx, pdf, srt" }, { status: 400 });
  }
  let speakersExpected: number | null = null;
  if (tier === "pro" && body.speakers_expected !== undefined && body.speakers_expected !== null && body.speakers_expected !== "") {
    const n = Number(body.speakers_expected);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      return NextResponse.json({ error: "speakers_expected must be 1–20" }, { status: 400 });
    }
    speakersExpected = n;
  }
  const rate = tier === "pro" ? PRO_CREDITS_PER_MINUTE : STANDARD_CREDITS_PER_MINUTE;

  // 2. Fast pre-check: block the obvious "no credits at all" case here so the
  //    user gets instant feedback. The precise duration-vs-balance check runs on
  //    the worker, which is the only place the video length is actually known.
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", user.id)
    .single();

  if (!profile || Number(profile.credits_balance) < rate) {
    return NextResponse.json(
      { error: "insufficient credits — buy more at /credits", code: "insufficient_credits" },
      { status: 402 },
    );
  }

  // 3. Insert with the Secret key. The caller is already authenticated above,
  //    and user_id is taken from the session — never from the request body.
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .insert({
      user_id: user.id,
      video_source_url: videoSourceUrl,
      topic,
      language,
      status: "pending",
      tier,
      formats,
      speakers_expected: speakersExpected,
      source_kind: sourceKind,
      upload_key: uploadKey,
      original_filename: originalFilename,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? "could not create job" }, { status: 500 });
  }

  const { data: session, error: sessionError } = await admin
    .from("job_sessions")
    .insert({ job_id: job.id, session_number: 1 })
    .select("id")
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: sessionError?.message ?? "could not create job session" },
      { status: 500 },
    );
  }

  await admin.from("jobs").update({ current_session_id: session.id }).eq("id", job.id);

  return NextResponse.json({ job_id: job.id });
}

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type JobRequestBody = {
  video_source_url?: unknown;
  topic?: unknown;
  language?: unknown;
};

const LANGUAGES = new Set(["zh", "en", "ja"]);

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
  const videoSourceUrl = typeof body.video_source_url === "string" ? body.video_source_url.trim() : "";

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

  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim() : null;
  const language = typeof body.language === "string" && LANGUAGES.has(body.language) ? body.language : "zh";

  // 2. Fast pre-check: block the obvious "no credits at all" case here so the
  //    user gets instant feedback. The precise duration-vs-balance check runs on
  //    the worker, which is the only place the video length is actually known.
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", user.id)
    .single();

  if (!profile || Number(profile.credits_balance) < 1) {
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

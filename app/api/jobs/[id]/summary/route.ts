import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// gpt-4o-mini is plenty for summarising a transcript and is one of the cheapest
// models on the account. Override with OPENAI_SUMMARY_MODEL to try another
// (gpt-4.1-mini and gpt-5-mini are both available) without a code change.
const MODEL = process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini";

// Whisper output for a long video can be large; the summary only needs the
// substance, and this keeps the request well inside the context window.
const MAX_TRANSCRIPT_CHARS = 40000;

const LANGUAGE_NAMES: Record<string, string> = {
  zh: "Traditional Chinese",
  en: "English",
  ja: "Japanese",
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set on this deployment" },
      { status: 500 },
    );
  }

  // The secret key bypasses RLS, so ownership is re-imposed here explicitly —
  // same reasoning as the transcript route.
  const admin = createAdminClient();

  const { data: job } = await admin
    .from("jobs")
    .select("id, status, language, topic, current_session_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (job.status !== "done" || !job.current_session_id) {
    return NextResponse.json({ error: "not ready" }, { status: 409 });
  }

  const { data: session } = await admin
    .from("job_sessions")
    .select("id, subtitle_txt_content, summary_content")
    .eq("id", job.current_session_id)
    .single();

  if (!session?.subtitle_txt_content) {
    return NextResponse.json({ error: "transcript missing" }, { status: 500 });
  }

  // Already summarised — hand back what we stored instead of paying again.
  if (session.summary_content) {
    return NextResponse.json({ summary: session.summary_content, cached: true });
  }

  const languageName = LANGUAGE_NAMES[job.language] ?? "the same language as the transcript";
  const transcript = session.subtitle_txt_content.slice(0, MAX_TRANSCRIPT_CHARS);
  const truncated = session.subtitle_txt_content.length > MAX_TRANSCRIPT_CHARS;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            `You turn video transcripts into an outline. Write in ${languageName}. ` +
            "Open with ONE sentence saying what the video is about. Then output a bullet " +
            "list: 4 to 8 lines, each starting with \"- \", following the order of the " +
            "transcript, one substantive point per line. Inside the bullets do not use " +
            "sequencing words (first, next, then, finally, 首先, 接著, 最後) — the order of " +
            "the list already carries that. Use only what the transcript says: add no " +
            "outside facts, speculate about nothing, and never invent timestamps, since " +
            "the transcript carries no timing data.",
        },
        {
          role: "user",
          content:
            (job.topic ? `Topic supplied by the user: ${job.topic}\n\n` : "") +
            (truncated ? "Transcript (truncated):\n" : "Transcript:\n") +
            transcript,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json(
      { error: `OpenAI request failed (${response.status})`, detail: detail.slice(0, 500) },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const summary = payload.choices?.[0]?.message?.content?.trim();

  if (!summary) {
    return NextResponse.json({ error: "empty summary returned" }, { status: 502 });
  }

  await admin.from("job_sessions").update({ summary_content: summary }).eq("id", session.id);

  return NextResponse.json({ summary, cached: false });
}

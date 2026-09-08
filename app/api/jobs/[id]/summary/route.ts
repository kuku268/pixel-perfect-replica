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

// Handed speech-free audio (music, silence, room tone), Whisper does not return
// nothing — it returns subtitle-credit boilerplate it saw during training, e.g.
// "字幕by索兰娅". Summarising that produces a confident, entirely invented
// outline, so refuse before spending a request on it.
const MIN_TRANSCRIPT_CHARS = 80;

const HALLUCINATION_PATTERNS = [
  /字幕\s*by/i,
  /字幕製作|字幕组|字幕組/,
  /請不吝點贊|订阅|訂閱/,
  /amara\.org/i,
  /thanks?\s+for\s+watching/i,
  /subtitles?\s+by/i,
  /transcri(bed|ption)\s+by/i,
];

function hasUsableSpeech(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TRANSCRIPT_CHARS) return false;
  // Boilerplate that accounts for most of the output means there is no content
  // underneath it; the same phrase inside a long transcript is just a mention.
  const boilerplate = HALLUCINATION_PATTERNS.some((pattern) => pattern.test(trimmed));
  return !(boilerplate && trimmed.length < 400);
}

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

  if (!hasUsableSpeech(session.subtitle_txt_content)) {
    return NextResponse.json(
      { error: "Nothing to summarize." },
      { status: 422 },
    );
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
            "Output exactly three parts and nothing else:\n" +
            "1. One sentence saying what the video is about.\n" +
            "2. A blank line, then 4 to 8 bullets, each starting with \"- \", in the " +
            "order the transcript covers them.\n" +
            "3. A blank line, then one sentence on what the video is ultimately for.\n\n" +
            "Add no headings or labels of any kind — no \"TL;DR\", no \"Key takeaways\", " +
            "no numbering. Every bullet is TWO short complete sentences: the first states " +
            "the point, the second adds the detail that makes it useful. About 60 " +
            "characters total in Chinese or Japanese, and just as brief in English. Let " +
            "the transcript decide how many bullets it needs within that range, and drop " +
            "a point rather than let a bullet run past two sentences. Inside the bullets " +
            "do not use sequencing words (first, next, then, finally, 首先, 接著, 最後); " +
            "the order already carries that. Use only what the transcript says: add no " +
            "outside facts, speculate about nothing, and never invent timestamps, since " +
            "the transcript carries no timing data. If the transcript holds no real " +
            "spoken content, reply with that single fact and nothing else — never " +
            "manufacture an outline from nothing.",
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

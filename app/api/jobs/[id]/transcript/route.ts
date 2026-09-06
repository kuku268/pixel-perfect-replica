import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Auth — same cookie session as POST /api/jobs.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. The Secret key bypasses RLS, so ownership has to be re-imposed here by
  //    hand. Without the user_id filter any signed-in user could download any
  //    transcript by guessing a uuid.
  const admin = createAdminClient();

  const { data: job } = await admin
    .from("jobs")
    .select("id, status, current_session_id")
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
    .select("subtitle_txt_content")
    .eq("id", job.current_session_id)
    .single();

  const txt = session?.subtitle_txt_content;
  if (!txt) {
    return NextResponse.json({ error: "transcript missing" }, { status: 500 });
  }

  return new NextResponse(txt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="transcript-${id.slice(0, 8)}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}

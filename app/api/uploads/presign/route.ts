import { NextResponse } from "next/server";

import { UPLOAD_ENABLED } from "@/lib/flags";
import { PRESIGN_SECONDS, presignUpload, uploadKeyFor } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

// Browser-direct upload: the file goes straight from the user's browser to S3
// with a 15-minute presigned PUT. Nothing passes through Vercel (4.5 MB body
// limit) and nothing ever touches the operator's machine. The worker later
// downloads the object, verifies it is real media with ffprobe, extracts the
// audio and deletes the original — so uploads/ is a transit area, not storage
// (a 1-day S3 lifecycle rule is the safety net).

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const EXTENSIONS: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

type Body = { filename?: unknown; size?: unknown; content_type?: unknown };

export async function POST(request: Request) {
  if (!UPLOAD_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const size = typeof body.size === "number" ? body.size : Number(body.size);

  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (!filename || !EXTENSIONS[ext]) {
    return NextResponse.json(
      { error: `unsupported file type — allowed: ${Object.keys(EXTENSIONS).join(", ")}` },
      { status: 400 },
    );
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "file must be between 1 byte and 2 GB" }, { status: 400 });
  }

  // The browser's reported MIME is advisory; the extension decides what we
  // sign, and ffprobe on the worker decides whether it is really media.
  const contentType = EXTENSIONS[ext];
  const key = uploadKeyFor(user.id, ext);
  const url = await presignUpload(key, contentType);

  return NextResponse.json({
    upload_key: key,
    url,
    method: "PUT",
    headers: { "Content-Type": contentType },
    expires_in: PRESIGN_SECONDS,
  });
}

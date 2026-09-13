// Server-only S3 helpers for the business tier.
//
// The web app never proxies media bytes. It only signs URLs:
//   * browser -> S3 PUT  (uploads/<user_id>/<uuid>.<ext>, 15 min)
//   * browser <- S3 GET  (audio/<job_id>.mp3 for the editor's player, 15 min)
// and deletes objects when a job is exported or its edit window closes.
//
// Credentials belong to a dedicated IAM user (videoreader-web) whose policy is
// limited to exactly those key prefixes and actions — see step3-progress.md.
// Set in Vercel: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AUDIO_BUCKET.

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const AUDIO_BUCKET = process.env.AUDIO_BUCKET ?? "videoreader-artifacts-134580876888";
export const PRESIGN_SECONDS = 15 * 60;

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  }
  return client;
}

export function uploadKeyFor(userId: string, ext: string): string {
  return `uploads/${userId}/${crypto.randomUUID()}.${ext}`;
}

export function isOwnUploadKey(key: string, userId: string): boolean {
  return /^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(key) && key.startsWith(`uploads/${userId}/`);
}

// Only ContentType is signed (the browser must send the same header). Size is
// checked by the presign route up front and, for real, by the worker's ffprobe.
export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: AUDIO_BUCKET, Key: key, ContentType: contentType }), {
    expiresIn: PRESIGN_SECONDS,
  });
}

export async function presignAudio(key: string): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }), {
    expiresIn: PRESIGN_SECONDS,
  });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }));
}

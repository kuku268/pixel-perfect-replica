// Feature flags for the business tier and local uploads.
//
// NEXT_PUBLIC_* is inlined at build time so the same value gates the UI and
// the API routes. Both default OFF: with neither set, the app behaves exactly
// like the M4 release, and every new route below answers 404 as if it did not
// exist. Flip them in the Vercel project settings and redeploy.
//
// The worker has its own PRO_TIER_ENABLED (ECS task definition env); a pro
// job created while the worker flag is off ends in status 'failed' rather
// than being silently downgraded, so keep the two in sync.

export const PRO_TIER_ENABLED = process.env.NEXT_PUBLIC_PRO_TIER_ENABLED === "true";
export const UPLOAD_ENABLED = process.env.NEXT_PUBLIC_UPLOAD_ENABLED === "true";

// Credits per started minute. Standard is fixed at 1; the business rate must
// match the worker's PRO_CREDITS_PER_MINUTE (task definition env) because the
// worker is what actually deducts.
export const STANDARD_CREDITS_PER_MINUTE = 1;
export const PRO_CREDITS_PER_MINUTE = Number(process.env.PRO_CREDITS_PER_MINUTE ?? "2") || 2;

// Business-tier outputs a job can request (jobs.formats CHECK constraint).
export const PRO_FORMATS = ["docx", "pdf", "srt"] as const;
export type ProFormat = (typeof PRO_FORMATS)[number];

export function parseFormats(value: unknown): ProFormat[] | null {
  if (!Array.isArray(value)) return [];
  const out: ProFormat[] = [];
  for (const v of value) {
    if (typeof v !== "string" || !(PRO_FORMATS as readonly string[]).includes(v)) return null;
    if (!out.includes(v as ProFormat)) out.push(v as ProFormat);
  }
  return out;
}

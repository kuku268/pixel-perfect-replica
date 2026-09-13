// Row shape the /upload server component hands to the client-side table.
// Everything the download menu / unlock dialog / editor entry needs, and
// nothing the browser should not see (no S3 keys, no user ids).

export type JobListItem = {
  id: string;
  created_at: string;
  /** Original filename for uploads, the URL otherwise. */
  source: string;
  source_kind: string;
  status: string;
  error_message: string | null;
  tier: string;
  formats: string[];
  /** Minutes the standard run was billed for (from the ledger); null if unknown. */
  billed_minutes: number | null;
  /** A post-hoc unlock child job is still running. */
  unlocking: boolean;
  /** The kept mp3 still exists (editor can play audio). */
  audio_available: boolean;
  edit_deadline: string | null;
  exported_at: string | null;
  summary_content: string | null;
};

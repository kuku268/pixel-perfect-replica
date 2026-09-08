"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SummaryCell({
  jobId,
  status,
  initialSummary,
}: {
  jobId: string;
  status: string;
  initialSummary: string | null;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Nothing to summarise until the transcript exists.
  if (status !== "done") {
    return <span className="text-muted-foreground">—</span>;
  }

  async function generate() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/summary`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { summary?: string; error?: string }
        | null;

      if (!response.ok || !body?.summary) {
        setError(body?.error ?? `Request failed (${response.status})`);
        return;
      }

      setSummary(body.summary);
      setOpen(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {summary ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-medium text-primary hover:underline"
        >
          View
        </button>
      ) : (
        <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
          {pending ? "Summarising…" : "Summarise"}
        </Button>
      )}

      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-primary">Summary</DialogTitle>
            <DialogDescription>
              Cached after first generation — open again any time at no cost.
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {summary}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

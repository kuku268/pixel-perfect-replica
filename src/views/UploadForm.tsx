"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LANGUAGES = [
  { value: "zh", label: "中文 (zh)" },
  { value: "en", label: "English (en)" },
  { value: "ja", label: "日本語 (ja)" },
];

export function UploadForm() {
  const router = useRouter();
  const [videoSourceUrl, setVideoSourceUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("zh");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInsufficient(false);
    setPending(true);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_source_url: videoSourceUrl.trim(),
          topic: topic.trim() || null,
          language,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 402) {
          setInsufficient(true);
          return;
        }
        setError(body?.error ?? `Request failed (${response.status})`);
        return;
      }

      setVideoSourceUrl("");
      setTopic("");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="video_source_url">Video URL</Label>
        <Input
          id="video_source_url"
          type="url"
          required
          placeholder="Direct mp4 / mp3 URL (e.g. CloudFront, Vimeo, Internet Archive)"
          value={videoSourceUrl}
          onChange={(e) => setVideoSourceUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          YouTube links are not supported — they need cookie auth from cloud IPs.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic">Topic (optional)</Label>
        <Input
          id="topic"
          type="text"
          placeholder="e.g. Tech podcast — useful context for the model"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="language">Language</Label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {LANGUAGES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {insufficient ? (
        <p role="alert" className="text-sm text-destructive">
          You don&apos;t have enough credits.{" "}
          <Link href="/credits" className="font-medium underline">
            Buy credits
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Transcribe"}
      </Button>
    </form>
  );
}

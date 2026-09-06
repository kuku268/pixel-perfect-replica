"use client";

import { Clock, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const title = "Video Speed Reader — Transcripts in three minutes";
const description =
  "Upload your video and get an accurate, clean transcript in three minutes. Chinese and English, commercial-use ready.";

const features = [
  {
    icon: Sparkles,
    title: "高準確度逐字稿",
    subtitle: "High-accuracy transcripts",
    body: "Powered by OpenAI Whisper. Supports Chinese and English, including mixed-language recordings.",
  },
  {
    icon: Clock,
    title: "三分鐘交付",
    subtitle: "Three-minute turnaround",
    body: "Processed in the background — you get an email the moment your transcript is ready.",
  },
  {
    icon: ShieldCheck,
    title: "可商用授權",
    subtitle: "Commercial-use ready",
    body: "You own the output. Publish it, sell it, or feed it into your own tooling however you like.",
  },
];

export default function Landing() {
  useDocumentMeta({ title, description });

  return (
    <div className="min-h-screen bg-hero">
      <header className="sticky top-0 z-20 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <BrandMark />
          <Button asChild size="sm">
            <Link href="/sign-in">Sign in / 登入</Link>
          </Button>
        </div>
      </header>

      <main>
        <section>
          <div className="mx-auto max-w-3xl px-5 pt-28 pb-24 text-center sm:pt-36 sm:pb-28">
            <Reveal>
              <span className="inline-flex items-center rounded-full border border-border bg-card/80 px-3.5 py-1 text-xs font-medium text-muted-foreground">
                Whisper-powered transcription · 中英雙語
              </span>
              <h1 className="mt-6 font-display text-6xl font-semibold leading-none tracking-tight text-primary sm:text-8xl">
                Video Speed Reader
              </h1>
              <p className="mt-8 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                上傳影片，三分鐘內拿到逐字稿。
              </p>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                Upload your video, get a clean transcript in three minutes.
              </p>
            </Reveal>
            <Reveal delay={140}>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg" className="shadow-glow">
                  <Link href="/sign-up">Get started — free</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/sign-in">I have an account</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <Reveal>
            <h2 className="sr-only">Everything you need to repurpose long-form video</h2>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.title} delay={i * 120}>
                  <article className="h-full rounded-2xl border border-border bg-card p-8 shadow-card transition-colors hover:border-primary/50">
                    <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Icon className="size-5" strokeWidth={2} />
                    </span>
                    <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">{feature.subtitle}</p>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                      {feature.body}
                    </p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto max-w-6xl px-5 py-8 text-center text-sm text-muted-foreground">
          © 2026 Video Speed Reader
        </div>
      </footer>
    </div>
  );
}

import { Link } from "react-router-dom";

import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const title = "Video Speed Reader — Transcripts in three minutes";
const description =
  "Upload your video and get an accurate, clean transcript in three minutes. Chinese and English, commercial-use ready.";

const features = [
  {
    title: "高準確度逐字稿",
    subtitle: "High-accuracy transcripts",
    body: "Powered by OpenAI Whisper. Supports Chinese and English, including mixed-language recordings.",
  },
  {
    title: "三分鐘交付",
    subtitle: "Three-minute turnaround",
    body: "Processed in the background — you get an email the moment your transcript is ready.",
  },
  {
    title: "可商用授權",
    subtitle: "Commercial-use ready",
    body: "You own the output. Publish it, sell it, or feed it into your own tooling however you like.",
  },
];

export default function Landing() {
  useDocumentMeta({ title, description });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="text-base font-semibold tracking-tight">
            Video<span className="text-brand-gradient"> Speed Reader</span>
          </span>
          <Button asChild size="sm">
            <Link to="/signin">Sign in / 登入</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="bg-hero">
          <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:py-32">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
                For creators, educators &amp; engineers
              </p>
              <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
                Video Speed Reader
              </h1>
              <p className="mt-6 text-xl font-medium sm:text-2xl">
                上傳影片，三分鐘內拿到逐字稿。
              </p>
              <p className="mt-3 text-base text-muted-foreground">
                Upload your video, get a clean transcript in three minutes.
              </p>
            </Reveal>
            <Reveal delay={140}>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg" className="shadow-glow">
                  <Link to="/signup">Get started free</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/signin">Sign in / 登入</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything you need to repurpose long-form video
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 120}>
                <article className="h-full rounded-2xl border border-border bg-card p-6 shadow-card transition-colors hover:border-primary/60">
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-1 text-sm font-medium text-primary">{feature.subtitle}</p>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-8 text-center text-sm text-muted-foreground">
          © 2026 Video Speed Reader
        </div>
      </footer>
    </div>
  );
}

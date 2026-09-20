"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { CreditsBadge } from "@/components/CreditsBadge";
import { Button } from "@/components/ui/button";
import { signOut, useAuth } from "@/hooks/useAuth";
import { LangProvider, useLang, type Lang } from "@/lib/i18n";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const title = "Dashboard — Video Speed Reader";
const description = "Your Video Speed Reader dashboard for uploads and transcripts.";

export default function AppDashboard() {
  useDocumentMeta({ title, description, robots: "noindex" });

  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.push("/sign-in");
  }, [loading, user, router]);

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <LangProvider>
      <div className="min-h-screen bg-hero">
        <header className="border-b border-border/70 bg-background/70 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <BrandMark />
            <div className="flex items-center gap-4">
              <CreditsBadge />
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out / 登出
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-5 py-16">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">
            歡迎 / Welcome, {user.email}
          </h1>
          <LanguageChoice />
        </main>
      </div>
    </LangProvider>
  );
}

// The one place the interface language is chosen. /upload, /credits and the
// payment pages read it (localStorage `vsr.lang`) and show no switcher.
// 中文 → NT$ via ECPay (綠界); English → USD via Stripe.
function LanguageChoice() {
  const router = useRouter();
  const { lang, setLang } = useLang();

  function choose(next: Lang) {
    setLang(next);
    router.push("/upload");
  }

  const options: { value: Lang; title: string; note: string }[] = [
    { value: "zh", title: "中文介面", note: "以新台幣付款（綠界）" },
    { value: "en", title: "English", note: "Pay in USD (Stripe)" },
  ];

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-8 shadow-card">
      <p className="text-sm font-semibold tracking-tight text-foreground">
        請選擇介面語言 / Choose your language
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            className={`rounded-2xl border p-6 text-left transition-colors hover:border-primary ${
              lang === o.value ? "border-primary bg-primary/5" : "border-border bg-background/60"
            }`}
          >
            <span className="block font-display text-2xl font-semibold text-primary">{o.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{o.note}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        之後點左上角 logo 回到這頁即可更換。 / Click the logo at the top left to come back and switch.
      </p>
    </div>
  );
}

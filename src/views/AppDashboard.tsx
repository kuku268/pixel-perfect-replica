"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { CreditsBadge } from "@/components/CreditsBadge";
import { Button } from "@/components/ui/button";
import { signOut, useAuth } from "@/hooks/useAuth";
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
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <BrandMark />
          <div className="flex items-center gap-4">
            <CreditsBadge />
            <Link href="/upload" className="text-sm font-medium text-primary hover:underline">
              Upload
            </Link>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out / 登出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">Hi {user.email}</h1>
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 shadow-card">
          <p className="text-muted-foreground">
            Your dashboard is coming soon. Upload functionality will be added in the next
            milestone.
          </p>
        </div>
      </main>
    </div>
  );
}

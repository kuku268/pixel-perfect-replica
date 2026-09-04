import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth, signOut } from "@/hooks/useAuth";

const title = "Dashboard — Video Speed Reader";
const description = "Your Video Speed Reader dashboard for uploads and transcripts.";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppShell,
});

function AppShell() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/signin" });
  }, [loading, user, navigate]);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/" });
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-base font-semibold tracking-tight">
            Video<span className="text-brand-gradient"> Speed Reader</span>
          </span>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out / 登出
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Hi {user.email}</h1>
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

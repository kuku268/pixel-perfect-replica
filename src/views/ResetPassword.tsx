"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/integrations/supabase/client";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const title = "Set a new password — Video Speed Reader";
const description = "Choose a new password for your Video Speed Reader account.";

type Phase = "checking" | "ready" | "invalid";

// Landing page for the reset email. Two link shapes are accepted:
//   ?code=…                       default Supabase template (PKCE). The browser
//                                 client exchanges it on creation — works only
//                                 in the browser that requested the reset.
//   ?token_hash=…&type=recovery   custom email template. Works on any device.
export default function ResetPassword() {
  useDocumentMeta({ title, description });

  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    let settled = false;
    const settle = (next: Phase) => {
      if (!settled) {
        settled = true;
        setPhase(next);
      }
    };

    if (params.get("error") || hash.get("error")) {
      settle("invalid");
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) settle("ready");
    });

    const tokenHash = params.get("token_hash");
    if (tokenHash) {
      void supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error }) => settle(error ? "invalid" : "ready"));
    } else {
      // ?code= is exchanged by the client itself; give it a moment.
      const timer = setTimeout(async () => {
        const { data: current } = await supabase.auth.getSession();
        settle(current.session ? "ready" : "invalid");
      }, 2500);
      return () => {
        clearTimeout(timer);
        data.subscription.unsubscribe();
      };
    }
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match. / 兩次輸入的密碼不一樣。");
      return;
    }
    setPending(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. / 密碼已更新。");
    router.push("/app");
  }

  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <header className="mx-auto flex w-full max-w-6xl items-center px-5 py-4">
        <BrandMark to="/" />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-card">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
            New password / 設定新密碼
          </h1>

          {phase === "checking" ? (
            <p className="mt-4 text-sm text-muted-foreground">Checking your link… / 驗證連結中…</p>
          ) : phase === "invalid" ? (
            <div className="mt-4 space-y-4 text-sm text-muted-foreground">
              <p>
                This link is invalid or has expired, or it was opened in a different browser.
                <br />
                連結無效或已過期，或是用了不同的瀏覽器開啟。
              </p>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Send a new link / 重新寄送連結</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password / 新密碼</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm / 再輸入一次</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Please wait…" : "Update password / 更新密碼"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

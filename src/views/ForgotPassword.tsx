"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/integrations/supabase/client";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const title = "Forgot password — Video Speed Reader";
const description = "Reset the password for your Video Speed Reader account.";

export default function ForgotPassword() {
  useDocumentMeta({ title, description });

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    // Rate limits are the only error worth showing. Anything about the address
    // itself stays hidden so this form can't be used to probe who has an account.
    if (error && error.status === 429) {
      toast.error("Too many requests — please wait a minute. / 請求太頻繁，請稍後再試。");
      return;
    }
    if (error) console.error("resetPasswordForEmail", error);
    setSent(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <header className="mx-auto flex w-full max-w-6xl items-center px-5 py-4">
        <BrandMark to="/" />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-card">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
            Forgot password / 忘記密碼
          </h1>

          {sent ? (
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                If <span className="font-medium text-foreground">{email}</span> has an account, a
                reset link is on its way. Open it in this same browser.
              </p>
              <p>若這個 email 有註冊，重設連結已寄出。請用同一個瀏覽器開啟信中的連結。</p>
              <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                Use another email / 換一個 email
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link. / 輸入 email，我們會寄重設連結給你。
              </p>
              <form onSubmit={submit} className="mt-8 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Please wait…" : "Send reset link / 寄送重設連結"}
                </Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Back to sign in / 回到登入
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

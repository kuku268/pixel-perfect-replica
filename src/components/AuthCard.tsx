import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthCard({
  heading,
  subheading,
  submitLabel,
  pending,
  onSubmit,
  footer,
}: {
  heading: string;
  subheading: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (email: string, password: string) => void | Promise<void>;
  footer: ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(email.trim(), password);
  }

  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <header className="mx-auto flex w-full max-w-6xl items-center px-5 py-4">
        <Link to="/" className="text-base font-semibold tracking-tight">
          Video<span className="text-brand-gradient"> Speed Reader</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subheading}</p>

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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Please wait…" : submitLabel}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  );
}

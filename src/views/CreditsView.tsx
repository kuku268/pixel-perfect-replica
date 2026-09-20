"use client";

import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { CreditsBadge } from "@/components/CreditsBadge";
import { LangProvider, useLang, useT, type Key, type Lang } from "@/lib/i18n";
import { BuyCreditsButton } from "@/views/BuyCreditsButton";

// One layout for both languages; only the words and the payment rail differ:
//   中文 → NT$ prices, ECPay (綠界)      EN → USD prices, Stripe

export type CreditTier = { id: string; credits: number; usd: number | null; twd: number | null };
export type CreditTx = {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
};

type Props = {
  balance: number;
  tiers: CreditTier[];
  transactions: CreditTx[];
  paymentFailed: boolean;
  stripeTest: boolean;
  ecpayTest: boolean;
};

export function CreditsView(props: Props) {
  return (
    <LangProvider>
      <CreditsInner {...props} />
    </LangProvider>
  );
}

function money(lang: Lang, value: number) {
  return lang === "zh"
    ? `NT$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : `$${value.toFixed(2)}`;
}

function when(lang: Lang, iso: string) {
  return new Date(iso).toLocaleString(lang === "zh" ? "zh-TW" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_KEY: Record<string, Key> = {
  purchase: "txPurchase",
  deduction: "txDeduction",
  signup_bonus: "txSignup",
  admin_grant: "txAdmin",
  pro_unlock: "txUnlock",
};

// purchase -> primary (green), signup_bonus -> accent, deduction -> muted.
function typeClasses(type: string) {
  if (type === "purchase" || type === "admin_grant") return "bg-primary/12 text-primary";
  if (type === "signup_bonus") return "bg-accent text-accent-foreground";
  return "bg-muted text-muted-foreground";
}

// Ledger descriptions are written in English by the webhook / worker. Render
// the known shapes in Chinese; anything unrecognised falls back to the type.
function zhDescription(tx: CreditTx): string | null {
  const d = tx.description ?? "";
  let m: RegExpMatchArray | null;
  if ((m = d.match(/^Purchased (\d+(?:\.\d+)?) credits(?: \(NT\$(\d+)\))?/)))
    return m[2] ? `購買 ${m[1]} 點（NT$${m[2]}）` : `購買 ${m[1]} 點`;
  if ((m = d.match(/^Welcome bonus — (\d+) free credits/))) return `新會員贈送 ${m[1]} 點`;
  if ((m = d.match(/^Transcribed \(business\) (\d+) min video/))) return `轉錄商務版 ${m[1]} 分鐘影片`;
  if ((m = d.match(/^Transcribed (\d+) min video/))) return `轉錄 ${m[1]} 分鐘影片`;
  if ((m = d.match(/^Insufficient credits: video is (\d+) min, you have (\d+)/)))
    return `點數不足：影片 ${m[1]} 分鐘，當時有 ${m[2]} 點`;
  if ((m = d.match(/^Unlocked business tier for (\d+) min video/))) return `解鎖商務版（${m[1]} 分鐘影片）`;
  return null;
}

function CreditsInner({ balance, tiers, transactions, paymentFailed, stripeTest, ecpayTest }: Props) {
  const t = useT();
  const { lang } = useLang();

  // Price shown = the rail for this language. A tier without that price is hidden.
  const priced = tiers
    .map((tier) => ({ ...tier, price: lang === "zh" ? tier.twd : tier.usd }))
    .filter((tier): tier is CreditTier & { price: number } => tier.price !== null && tier.price > 0);

  // Discount story: every tier's price/credit is compared to the smallest pack.
  const smallest = priced.reduce<(typeof priced)[number] | null>(
    (acc, p) => (acc === null || p.credits < acc.credits ? p : acc),
    null,
  );
  const baselineRatio = smallest ? smallest.price / smallest.credits : null;
  const showTestNote = lang === "zh" ? ecpayTest : stripeTest;

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <BrandMark to="/app" />
          <div className="flex items-center gap-4">
            <CreditsBadge balance={balance} />
            <Link href="/upload" className="whitespace-nowrap text-sm font-medium text-primary hover:underline">
              {t("navTranscribe")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-14">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">{t("creditsH1")}</h1>

        {paymentFailed ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {t("paymentFailed")}
          </p>
        ) : null}

        {/* Balance */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm font-semibold tracking-tight text-foreground">{t("balanceLabel")}</p>
          <p className="mt-2 font-display text-5xl font-semibold tabular-nums text-primary">
            {Math.floor(balance)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("balanceNote")}</p>
        </section>

        {/* Tiers */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{t("buyCredits")}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {priced.map((tier) => {
              const ratio = tier.price / tier.credits;
              const bonusPct =
                baselineRatio && ratio < baselineRatio
                  ? Math.round((1 - ratio / baselineRatio) * 100)
                  : 0;
              return (
                <div
                  key={tier.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card"
                >
                  <div className="flex items-start justify-between">
                    <p className="text-lg font-semibold tracking-tight text-foreground">
                      {t("tierName", { n: tier.credits })}
                    </p>
                    {bonusPct > 0 ? (
                      <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">
                        +{bonusPct}%
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-display text-3xl font-semibold text-primary">
                    {money(lang, tier.price)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("perCredit", { p: money(lang, ratio), n: tier.credits })}
                  </p>
                  <div className="mt-6">
                    <BuyCreditsButton
                      key={lang}
                      productId={tier.id}
                      provider={lang === "zh" ? "ecpay" : "stripe"}
                      label={t("buyN", { n: tier.credits })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("payNote")}
            {showTestNote ? ` ${t("payNoteTest")}` : ""}
          </p>
        </section>

        {/* History */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{t("history")}</h2>
          {transactions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("noTx")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {transactions.map((tx) => {
                const typeLabel = TYPE_KEY[tx.type] ? t(TYPE_KEY[tx.type]) : tx.type;
                const text =
                  lang === "zh" ? (zhDescription(tx) ?? typeLabel) : (tx.description ?? typeLabel);
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <span
                        className={`mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeClasses(tx.type)}`}
                      >
                        {typeLabel}
                      </span>
                      <span className="text-foreground">{text}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{when(lang, tx.created_at)}</span>
                    </div>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${tx.amount < 0 ? "text-muted-foreground" : "text-primary"}`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

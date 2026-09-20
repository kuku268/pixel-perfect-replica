"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

// One shared "which tier is in flight" flag would need lifting state up; a
// module-level lock is enough to stop a double-click opening two Checkouts.
let inFlight = false;

// ECPay's AIO checkout is a form POST, so the API returns the signed fields and
// we submit them from a throwaway <form>.
function postForm(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function BuyCreditsButton({
  productId,
  label,
  provider = "stripe",
  variant = "default",
}: {
  productId: string;
  label: string;
  provider?: "stripe" | "ecpay";
  variant?: "default" | "outline";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  async function buy() {
    if (inFlight) return;
    inFlight = true;
    setPending(true);
    setError(null);

    try {
      const endpoint = provider === "ecpay" ? "/api/ecpay/checkout" : "/api/credits/checkout";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; action?: string; fields?: Record<string, string>; error?: string }
        | null;

      if (response.ok && body?.action && body.fields) {
        postForm(body.action, body.fields);
        return;
      }
      if (!response.ok || !body?.url) {
        setError(body?.error ?? t("checkoutFailed", { n: response.status }));
        return;
      }
      window.location.href = body.url;
    } catch {
      setError(t("networkError"));
    } finally {
      inFlight = false;
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" variant={variant} onClick={buy} disabled={pending}>
        {pending ? t("openingCheckout") : label}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

import Stripe from "stripe";

// Server-only. STRIPE_SECRET_KEY is sk_test_* for the whole course (sandbox);
// it lives in Vercel Production env + .env.local, never in a committed file.
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Pin so a future SDK bump can't silently change response shapes.
  apiVersion: "2026-03-25.dahlia",
});

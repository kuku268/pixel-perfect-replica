import Stripe from "stripe";

// Server-only. STRIPE_SECRET_KEY is sk_test_* for the whole course (sandbox);
// it lives in Vercel Production env + .env.local, never in a committed file.
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

// No explicit apiVersion: stripe-node's type for it is the single string that
// ships with the installed minor, so pinning it by hand breaks the build on
// every monthly SDK bump. The ^22 range in package.json already pins the API
// version line — that is the real safeguard.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

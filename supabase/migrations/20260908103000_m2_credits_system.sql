-- M2: Stripe-backed credits system.
--
-- Deviations from the course template, on purpose:
--   * jobs.status CHECK keeps this project's real values (pending / downloading /
--     transcribe / done) and adds only 'insufficient_credits'. The template's
--     'transcribing' / 'error' never existed here.
--   * Existing auth.users get a profiles row backfilled (the template only
--     backfilled the ledger row, which left pre-M2 users with no balance at all).
--   * Every CREATE POLICY is wrapped so the file is safe to re-run.

-- 0. profiles (did not exist before M2 in this project)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  email text,
  credits_balance numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. credits_balance (no-op on a fresh table; kept for projects where M1 made profiles)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits_balance numeric NOT NULL DEFAULT 30;

-- 2. Ledger
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'deduction', 'signup_bonus', 'admin_grant')),
  description text,
  job_id uuid REFERENCES public.jobs(id),
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id
  ON public.credit_transactions(user_id, created_at DESC);

-- Idempotency: at most one purchase row per Stripe payment_intent. The webhook
-- relies on the 23505 unique_violation from this index to detect redelivery.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_tx_payment_intent
  ON public.credit_transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own transactions" ON public.credit_transactions
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Product catalog (credits-per-tier lives here, NOT in Stripe metadata)
CREATE TABLE IF NOT EXISTS public.credit_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits numeric NOT NULL,
  price_usd numeric NOT NULL,
  stripe_price_id text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can view active products" ON public.credit_products
    FOR SELECT TO authenticated USING (active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.credit_products (name, credits, price_usd, stripe_price_id) VALUES
  ('10 Credits', 10, 10.00, 'price_1UDMIs2K7uNrja5cJMz7TNjI'),
  ('45 Credits', 45, 30.00, 'price_1UDMJ12K7uNrja5cL9vYhqIv'),
  ('90 Credits', 90, 60.00, 'price_1UDMJ52K7uNrja5c3ArtCFEG')
ON CONFLICT (stripe_price_id) DO NOTHING;

-- 4. Signup trigger: 30-credit welcome bonus
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, email, credits_balance)
    VALUES (NEW.id, 'user', NEW.email, 30)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (NEW.id, 30, 'signup_bonus', 'Welcome bonus — 30 free credits');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. New terminal job status
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('pending', 'downloading', 'transcribe', 'done', 'insufficient_credits'));

-- 6. Backfill users created before this migration: a profile row AND a bonus row
INSERT INTO public.profiles (id, role, email, credits_balance)
SELECT u.id, 'user', u.email, 30
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.credit_transactions (user_id, amount, type, description)
SELECT u.id, 30, 'signup_bonus', 'Welcome bonus — 30 free credits (backfilled)'
FROM auth.users u
LEFT JOIN public.credit_transactions ct
  ON ct.user_id = u.id AND ct.type = 'signup_bonus'
WHERE ct.id IS NULL;

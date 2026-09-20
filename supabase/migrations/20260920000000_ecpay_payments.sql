-- ECPay (綠界) one-time credit purchases, alongside Stripe.
--
-- Same contract as the Stripe path: the server-to-server notify (ReturnURL) is
-- the ONLY thing that credits. Everything that credits happens inside one
-- function (ecpay_mark_paid) so the order flip, the ledger row and the balance
-- move together or not at all.

-- 1. NT$ price per tier. NULL = tier not sold through ECPay.
ALTER TABLE public.credit_products ADD COLUMN IF NOT EXISTS price_twd integer;

-- Placeholder prices (~NT$30 / USD). Change freely; the page and checkout read this column.
UPDATE public.credit_products SET price_twd = 300  WHERE stripe_price_id = 'price_1UDMIs2K7uNrja5cJMz7TNjI' AND price_twd IS NULL;
UPDATE public.credit_products SET price_twd = 900  WHERE stripe_price_id = 'price_1UDMJ12K7uNrja5cL9vYhqIv' AND price_twd IS NULL;
UPDATE public.credit_products SET price_twd = 1800 WHERE stripe_price_id = 'price_1UDMJ52K7uNrja5c3ArtCFEG' AND price_twd IS NULL;

-- 2. Ledger: which provider a purchase came from + ECPay idempotency key.
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS provider text
  CHECK (provider IS NULL OR provider IN ('stripe', 'ecpay'));
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS ecpay_merchant_trade_no text;

UPDATE public.credit_transactions SET provider = 'stripe'
  WHERE provider IS NULL AND stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_tx_ecpay_trade_no
  ON public.credit_transactions(ecpay_merchant_trade_no)
  WHERE ecpay_merchant_trade_no IS NOT NULL;

-- 3. Orders. ECPay only echoes back MerchantTradeNo (+ CustomField1-4), so the
--    user / tier / amount live here, written by the checkout route before the
--    user is sent to ECPay. Service-role only — no RLS policies on purpose.
CREATE TABLE IF NOT EXISTS public.ecpay_orders (
  merchant_trade_no text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.credit_products(id),
  credits numeric NOT NULL CHECK (credits > 0),
  amount_twd integer NOT NULL CHECK (amount_twd > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  ecpay_trade_no text,
  rtn_code text,
  notify_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ecpay_orders_user ON public.ecpay_orders(user_id, created_at DESC);
ALTER TABLE public.ecpay_orders ENABLE ROW LEVEL SECURITY;

-- 4. Atomic "payment succeeded" handler, called by /api/ecpay/notify.
--    Returns: credited | duplicate | not_found | amount_mismatch
CREATE OR REPLACE FUNCTION public.ecpay_mark_paid(
  p_merchant_trade_no text,
  p_ecpay_trade_no text,
  p_amount integer,
  p_payload jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.ecpay_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.ecpay_orders
    WHERE merchant_trade_no = p_merchant_trade_no
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF o.status = 'paid' THEN
    RETURN 'duplicate';
  END IF;
  IF o.amount_twd <> p_amount THEN
    UPDATE public.ecpay_orders
      SET rtn_code = 'amount_mismatch', notify_payload = p_payload
      WHERE merchant_trade_no = p_merchant_trade_no;
    RETURN 'amount_mismatch';
  END IF;

  UPDATE public.ecpay_orders
    SET status = 'paid', ecpay_trade_no = p_ecpay_trade_no, rtn_code = '1',
        notify_payload = p_payload, paid_at = now()
    WHERE merchant_trade_no = p_merchant_trade_no;

  INSERT INTO public.credit_transactions
    (user_id, amount, type, description, provider, ecpay_merchant_trade_no)
  VALUES
    (o.user_id, o.credits, 'purchase',
     'Purchased ' || o.credits || ' credits (NT$' || o.amount_twd || ')',
     'ecpay', o.merchant_trade_no);

  UPDATE public.profiles
    SET credits_balance = credits_balance + o.credits
    WHERE id = o.user_id;

  RETURN 'credited';
END;
$$;

REVOKE ALL ON FUNCTION public.ecpay_mark_paid(text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ecpay_mark_paid(text, text, integer, jsonb) TO service_role;

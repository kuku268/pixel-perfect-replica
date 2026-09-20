-- DOWN for 20260920000000_ecpay_payments.sql. ECPay ledger rows are kept
-- (they are real purchases); only the ECPay-specific objects are removed.
DROP FUNCTION IF EXISTS public.ecpay_mark_paid(text, text, integer, jsonb);
DROP TABLE IF EXISTS public.ecpay_orders;
DROP INDEX IF EXISTS public.uniq_credit_tx_ecpay_trade_no;
ALTER TABLE public.credit_transactions DROP COLUMN IF EXISTS ecpay_merchant_trade_no;
ALTER TABLE public.credit_transactions DROP COLUMN IF EXISTS provider;
ALTER TABLE public.credit_products DROP COLUMN IF EXISTS price_twd;

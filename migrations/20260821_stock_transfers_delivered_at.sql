BEGIN;

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

UPDATE public.stock_transfers
SET delivered_at = COALESCE(delivered_at, created_at, now())
WHERE delivered_at IS NULL;

ALTER TABLE public.stock_transfers
  ALTER COLUMN delivered_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_stock_transfers_delivered_at
  ON public.stock_transfers (delivered_at DESC);

COMMIT;

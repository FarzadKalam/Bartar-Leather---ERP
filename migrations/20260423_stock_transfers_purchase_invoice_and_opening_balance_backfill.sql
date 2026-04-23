ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_purchase_invoice
  ON public.stock_transfers(purchase_invoice_id);

UPDATE public.stock_transfers
SET purchase_invoice_id = invoice_id
WHERE transfer_type = 'purchase_invoice'
  AND purchase_invoice_id IS NULL
  AND invoice_id IS NOT NULL;

INSERT INTO public.stock_transfers (
  transfer_type,
  product_id,
  bundle_id,
  delivered_qty,
  required_qty,
  invoice_id,
  purchase_invoice_id,
  production_order_id,
  from_shelf_id,
  to_shelf_id,
  sender_id,
  receiver_id
)
SELECT
  'opening_balance',
  pi.product_id,
  pi.bundle_id,
  pi.stock,
  pi.stock,
  NULL,
  NULL,
  NULL,
  NULL,
  pi.shelf_id,
  NULL,
  NULL
FROM public.product_inventory pi
WHERE COALESCE(pi.stock, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_transfers st
    WHERE st.transfer_type = 'opening_balance'
      AND st.product_id = pi.product_id
      AND st.bundle_id IS NOT DISTINCT FROM pi.bundle_id
      AND COALESCE(st.to_shelf_id, st.from_shelf_id) = pi.shelf_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_transfers st
    WHERE st.product_id = pi.product_id
      AND st.bundle_id IS NOT DISTINCT FROM pi.bundle_id
      AND (st.from_shelf_id = pi.shelf_id OR st.to_shelf_id = pi.shelf_id)
  );

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_buy_price numeric;

DO $$
DECLARE
  price_column record;
BEGIN
  FOR price_column IN
    SELECT * FROM (VALUES
      ('products', 'main_unit_price'),
      ('products', 'sub_unit_price'),
      ('products', 'buy_price'),
      ('products', 'sub_buy_price'),
      ('products', 'cost_price'),
      ('products', 'sell_price'),
      ('invoices', 'total_amount'),
      ('invoices', 'total_discount'),
      ('invoices', 'total_tax'),
      ('invoices', 'final_payable'),
      ('invoices', 'total_invoice_amount'),
      ('invoices', 'total_received_amount'),
      ('invoices', 'remaining_balance'),
      ('purchase_invoices', 'total_invoice_amount'),
      ('purchase_invoices', 'total_received_amount'),
      ('purchase_invoices', 'remaining_balance'),
      ('invoice_items', 'unit_price'),
      ('invoice_items', 'sub_unit_price'),
      ('invoice_items', 'tax'),
      ('invoice_items', 'discount'),
      ('invoice_items', 'row_total'),
      ('financial_documents', 'amount'),
      ('production_orders', 'production_cost'),
      ('tasks', 'wage'),
      ('customers', 'total_spend'),
      ('customers', 'total_paid_amount'),
      ('suppliers', 'total_paid')
    ) AS columns_to_convert(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = price_column.table_name
        AND column_name = price_column.column_name
        AND data_type <> 'numeric'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric USING %I::numeric',
        price_column.table_name,
        price_column.column_name,
        price_column.column_name
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.products.buy_price IS 'قیمت خرید به ازای واحد اصلی';
COMMENT ON COLUMN public.products.sub_buy_price IS 'قیمت خرید به ازای واحد فرعی';

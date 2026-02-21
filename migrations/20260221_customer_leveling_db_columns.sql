BEGIN;

ALTER TABLE IF EXISTS public.company_settings
  ADD COLUMN IF NOT EXISTS customer_leveling_config jsonb NOT NULL DEFAULT
  '{"enabled":true,"eligible_statuses":["final","settled","completed"],"silver":{"min_purchase_count":3,"min_total_spend":30000000,"min_acquaintance_days":30},"gold":{"min_purchase_count":8,"min_total_spend":120000000,"min_acquaintance_days":120},"vip":{"min_purchase_count":15,"min_total_spend":300000000,"min_acquaintance_days":365}}'::jsonb;

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS first_purchase_date date,
  ADD COLUMN IF NOT EXISTS last_purchase_date date,
  ADD COLUMN IF NOT EXISTS purchase_count int4 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spend numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank text NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'integration_settings'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'integration_settings'
      AND column_name = 'settings'
  ) THEN
    UPDATE public.company_settings AS cs
    SET customer_leveling_config = cfg.leveling_config
    FROM (
      SELECT settings->'customer_leveling_config' AS leveling_config
      FROM public.integration_settings
      WHERE connection_type = 'site'
        AND settings ? 'customer_leveling_config'
      LIMIT 1
    ) AS cfg
    WHERE cfg.leveling_config IS NOT NULL;
  END IF;
END $$;

COMMIT;

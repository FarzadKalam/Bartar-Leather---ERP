ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS start_date timestamptz;

DO $$
DECLARE
  start_date_type text;
BEGIN
  SELECT data_type
  INTO start_date_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tasks'
    AND column_name = 'start_date';

  IF start_date_type IN ('date', 'timestamp without time zone') THEN
    ALTER TABLE public.tasks
      ALTER COLUMN start_date TYPE timestamptz
      USING (
        CASE
          WHEN start_date IS NULL THEN NULL
          ELSE start_date::timestamptz
        END
      );
  END IF;
END $$;

BEGIN;

-- Required by commit_production_operation. Older installations lack these
-- optional metadata columns; no stock or previously recorded transfer is changed.
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS stage_task_id uuid REFERENCES public.tasks(id);

NOTIFY pgrst, 'reload schema';
COMMIT;

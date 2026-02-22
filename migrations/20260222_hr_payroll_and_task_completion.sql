ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON public.tasks(completed_at DESC);

UPDATE public.tasks
SET completed_at = COALESCE(completed_at, created_at, now())
WHERE completed_at IS NULL
  AND lower(COALESCE(status, '')) IN ('done', 'completed');

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS base_salary numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_penalty_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_bonus_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS production_bonus_rate numeric DEFAULT 0;

-- ==========================================================
-- Migration: stock_transfers public RLS, profiles SELECT policy,
--            and company_settings.allow_negative_inventory column
-- Date: 2026-05-28
-- ==========================================================

-- 1. Ensure stock_transfers is readable/writable by all authenticated users
--    (previously had no RLS policy, which could cause some users to be blocked
--     if a restrictive policy was added via the Supabase dashboard)
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Stock Transfers" ON public.stock_transfers;
CREATE POLICY "Public Access Stock Transfers"
  ON public.stock_transfers FOR ALL
  USING (true);

-- 2. Ensure profiles has a SELECT policy so that fetchFieldPermissions
--    (in ModuleShow.tsx) can read the current user's role_id.
--    Without this, role-based field permissions won't load for any user.
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- 3. Add allow_negative_inventory column to company_settings if missing
--    (migration 20260417 may not have been applied to the live database)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS allow_negative_inventory boolean NOT NULL DEFAULT false;

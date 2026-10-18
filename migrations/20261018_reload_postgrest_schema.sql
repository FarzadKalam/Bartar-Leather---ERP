-- Refresh PostgREST's schema cache after adding production workflow RPCs.
NOTIFY pgrst, 'reload schema';

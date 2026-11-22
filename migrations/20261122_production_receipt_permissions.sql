-- Supabase can grant function access through default ACLs, independently of PUBLIC.
BEGIN;
REVOKE ALL ON FUNCTION
  public.production_receipt_manager(), public.production_receipt_actor(uuid,uuid),
  public.project_production_receipt(uuid), public.guard_production_transit(),
  public.guard_pending_production_receipts(), public.guard_pending_receipt_task(),
  public.commit_production_operation_before_receipts(jsonb)
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION
  public.save_production_receipt_drafts(jsonb), public.production_receipt_action(jsonb),
  public.list_production_receipts(uuid[]), public.confirm_legacy_production_receipt(uuid,text,text),
  public.production_return_history(uuid,timestamptz), public.commit_production_operation(jsonb)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION
  public.save_production_receipt_drafts(jsonb), public.production_receipt_action(jsonb),
  public.list_production_receipts(uuid[]), public.confirm_legacy_production_receipt(uuid,text,text),
  public.production_return_history(uuid,timestamptz), public.commit_production_operation(jsonb)
TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

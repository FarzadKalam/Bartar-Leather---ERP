-- Receipt ledger has separate send and receive legs. Confirm only the actor of that leg.
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_receipt_transfer_confirmation() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.receipt_line_id IS NOT NULL THEN
    NEW.is_sender_confirmed := NEW.receipt_phase='send' AND NEW.sender_id IS NOT NULL;
    NEW.is_receiver_confirmed := NEW.receipt_phase='receive' AND NEW.receiver_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_receipt_transfer_confirmation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sync_receipt_transfer_confirmation ON public.stock_transfers;
CREATE TRIGGER sync_receipt_transfer_confirmation
BEFORE INSERT OR UPDATE OF receipt_line_id,receipt_phase,sender_id,receiver_id,is_sender_confirmed,is_receiver_confirmed
ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION public.sync_receipt_transfer_confirmation();
-- Repair receipt-backed metadata only; legacy transfers and inventory are untouched.
UPDATE public.stock_transfers SET
  is_sender_confirmed=(receipt_phase='send' AND sender_id IS NOT NULL),
  is_receiver_confirmed=(receipt_phase='receive' AND receiver_id IS NOT NULL)
WHERE receipt_line_id IS NOT NULL AND (
  is_sender_confirmed IS DISTINCT FROM (receipt_phase='send' AND sender_id IS NOT NULL) OR
  is_receiver_confirmed IS DISTINCT FROM (receipt_phase='receive' AND receiver_id IS NOT NULL));
NOTIFY pgrst,'reload schema';
COMMIT;

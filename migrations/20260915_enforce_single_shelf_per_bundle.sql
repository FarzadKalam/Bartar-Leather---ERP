-- هر بستهٔ فیزیکی فقط می‌تواند هم‌زمان در یک قفسه موجودی مثبت داشته باشد.
-- برای انتقال محل بسته باید ابتدا از حواله «جابجایی» استفاده شود.
CREATE OR REPLACE FUNCTION public.enforce_single_shelf_per_bundle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.bundle_id IS NULL OR COALESCE(NEW.stock, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- از ثبت هم‌زمان دو ورودی برای یک بسته در دو قفسه جلوگیری می‌کند.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.bundle_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.product_inventory AS inventory
    WHERE inventory.bundle_id = NEW.bundle_id
      AND inventory.shelf_id IS DISTINCT FROM NEW.shelf_id
      AND COALESCE(inventory.stock, 0) > 0
  ) THEN
    RAISE EXCEPTION 'A bundle with positive stock cannot be stored in more than one shelf'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_inventory_single_shelf_per_bundle ON public.product_inventory;

CREATE TRIGGER product_inventory_single_shelf_per_bundle
BEFORE INSERT OR UPDATE OF bundle_id, shelf_id, stock
ON public.product_inventory
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_shelf_per_bundle();

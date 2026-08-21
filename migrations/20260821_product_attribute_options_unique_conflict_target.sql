BEGIN;

-- productCatalogPersistence از UPSERT با کلید (attribute_id, value) استفاده می‌کند.
-- بدون این unique index، PostgreSQL خطای 42P10 می‌دهد و ذخیرهٔ محصول مادر
-- بعد از درج خود محصول و ویژگی‌ها نیمه‌کاره می‌ماند.
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attribute_options_attribute_value
  ON public.product_attribute_options(attribute_id, value);

COMMIT;

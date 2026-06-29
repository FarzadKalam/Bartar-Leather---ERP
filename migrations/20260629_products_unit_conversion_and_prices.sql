ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS main_unit_price int8,
  ADD COLUMN IF NOT EXISTS sub_unit_price int8,
  ADD COLUMN IF NOT EXISTS leather_width text,
  ADD COLUMN IF NOT EXISTS lining_type text,
  ADD COLUMN IF NOT EXISTS accessory_type text,
  ADD COLUMN IF NOT EXISTS accessory_width text;

UPDATE public.product_attributes
SET label = 'جنس آستر'
WHERE source_field_key = 'lining_material';

UPDATE public.product_attributes
SET label = 'نوع آستر'
WHERE source_field_key = 'lining_type';

UPDATE public.product_attributes
SET label = 'جنس خرجکار'
WHERE source_field_key = 'acc_material';

UPDATE public.product_attributes
SET label = 'نوع خرجکار'
WHERE source_field_key = 'accessory_type';

UPDATE public.product_attributes
SET label = 'عرض چرم (میلیمتر)'
WHERE source_field_key = 'leather_width';

UPDATE public.product_attributes
SET label = 'عرض آستر (میلیمتر)'
WHERE source_field_key = 'lining_width';

UPDATE public.product_attributes
SET label = 'عرض خرجکار (میلیمتر)'
WHERE source_field_key = 'accessory_width';

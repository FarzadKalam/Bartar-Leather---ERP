-- ۱. جدول پروفایل‌ها (متصل به Auth.Users)
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  mobile_1 text,
  mobile_2 text,
  email text,
  team text, -- می‌توان به صورت آرایه ["team1", "team2"] ذخیره کرد
  position text,
  hire_date date,
  avatar_url text,
  role text DEFAULT 'viewer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ۲. جدول انبارها
CREATE TABLE public.warehouses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  location text,
  manager_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ۳. جدول قفسه‌ها
CREATE TABLE public.shelves (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  shelf_number text NOT NULL,
  location_detail text,
  responsible_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ۴. جدول تامین‌کنندگان
CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prefix text,
  first_name text,
  last_name text,
  business_name text,
  mobile_1 text,
  mobile_2 text,
  landline text,
  province text,
  city text,
  address text,
  instagram_id text,
  telegram_id text,
  payment_method text,
  rating int4 DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

-- ۵. جدول محصولات
CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  custom_code text UNIQUE, -- کد دستی و سیستمی
  manual_code text,
  product_type text, -- مواد اولیه، نیمه آماده، نهایی
  category text, -- چرم، آستر، یراق و...
  main_unit text,
  sub_unit text,
  colors jsonb, -- آرایه‌ای از رنگ‌ها
  supplier_id uuid REFERENCES public.suppliers(id),
  brand text,
  waste_rate numeric DEFAULT 0,
  buy_price int8,
  buy_price_updated_at timestamptz,
  cost_price int8,
  sell_price int8,
  sell_price_updated_at timestamptz,
  stock numeric DEFAULT 0,
  reorder_point numeric DEFAULT 0,
  specs jsonb, -- برای فیلدهای چرم (جنس، بافت، سورت)
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

-- ۶. جدول بسته‌های محصولات
CREATE TABLE public.product_bundles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_number text UNIQUE,
  shelf_id uuid REFERENCES public.shelves(id),
  created_at timestamptz DEFAULT now()
);

-- ۷. ردیف‌های داخل بسته (رابطه چند به چند بین بسته و محصول)
CREATE TABLE public.bundle_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_id uuid REFERENCES public.product_bundles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  quantity numeric
);

-- ۸. جدول مشتریان
CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prefix text,
  first_name text,
  last_name text,
  business_name text,
  mobile_1 text,
  mobile_2 text,
  landline text,
  instagram_id text,
  telegram_id text,
  province text,
  city text,
  address text,
  rating int4 DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

-- ۹. شناسنامه‌های تولید (BOM)
CREATE TABLE public.boms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  custom_code text UNIQUE,
  status text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

-- ۱۰. ردیف‌های BOM
CREATE TABLE public.bom_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bom_id uuid REFERENCES public.boms(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  length numeric,
  width numeric,
  area numeric,
  pieces_count int4,
  consumption numeric
);

-- ۱۱. پیش‌فاکتور و فاکتور
CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_type text, -- proforma, final
  status text,
  customer_id uuid REFERENCES public.customers(id),
  payment_method text,
  marketer_id uuid REFERENCES public.profiles(id),
  sales_channel text,
  total_amount int8,
  total_discount int8,
  total_tax int8,
  final_payable int8,
  financial_approval bool DEFAULT false,
  terms_conditions text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

-- ۱۲. ردیف‌های فاکتور
CREATE TABLE public.invoice_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  quantity numeric,
  unit_price int8,
  tax int8,
  discount int8,
  row_total int8
);

-- ۱۳. اسناد مالی
CREATE TABLE public.financial_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.invoices(id),
  doc_type text, -- income, expense
  amount int8,
  payment_date timestamptz,
  due_date timestamptz,
  payer_id uuid, -- می‌تواند به مشتری یا پروفایل وصل شود
  receiver_id uuid,
  source_account text,
  destination_account text,
  receipt_image_url text,
  tracking_code text,
  payment_mode text, -- cash, credit, check
  check_status text,
  check_number text,
  sayad_id text,
  is_sayad_registered bool,
  account_owner_name text,
  account_owner_national_id text,
  check_image_url text,
  created_at timestamptz DEFAULT now()
);

-- ۱۴. وظایف (Tasks)
CREATE TABLE public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type text, -- سازمانی، تولید، بازاریابی
  name text NOT NULL,
  responsible_id uuid REFERENCES public.profiles(id),
  assigned_at timestamptz,
  due_at timestamptz,
  related_to_id uuid, -- ID ماژول مرتبط
  related_to_module text, -- نام ماژول مرتبط
  status text,
  remind_me bool DEFAULT false,
  recurrence_info jsonb,
  created_at timestamptz DEFAULT now()
);

-- ۱۵. حواله‌های کالا
CREATE TABLE public.stock_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_type text, -- تولید، خرید، فروش، بین‌واحدی
  product_id uuid REFERENCES public.products(id),
  required_qty numeric,
  delivered_qty numeric,
  invoice_id uuid,
  production_order_id uuid,
  sender_id uuid REFERENCES public.profiles(id),
  receiver_id uuid REFERENCES public.profiles(id),
  is_sender_confirmed bool DEFAULT false,
  is_receiver_confirmed bool DEFAULT false,
  from_shelf_id uuid REFERENCES public.shelves(id),
  to_shelf_id uuid REFERENCES public.shelves(id),
  from_warehouse_id uuid REFERENCES public.warehouses(id),
  to_warehouse_id uuid REFERENCES public.warehouses(id),
  created_at timestamptz DEFAULT now()
);

-- اضافه کردن فیلد تصویر به محصولات و مشتریان
ALTER TABLE public.products ADD COLUMN image_url text;
ALTER TABLE public.customers ADD COLUMN image_url text;

-- اضافه کردن فیلد موقعیت مکانی (لینک نقشه یا مختصات)
ALTER TABLE public.customers ADD COLUMN location_url text;
ALTER TABLE public.suppliers ADD COLUMN location_url text;

ALTER TABLE public.products ADD COLUMN system_code text;
ALTER TABLE public.products ADD COLUMN image_url text;

-- ایجاد سیاست دسترسی کامل برای باکت images
CREATE POLICY "Public Access"
ON storage.objects FOR ALL
USING ( bucket_id = 'images' )
WITH CHECK ( bucket_id = 'images' );

CREATE TABLE public.views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id text NOT NULL, -- مثلا 'products'
  name text NOT NULL, -- مثلا 'کالاهای گران چرمی'
  is_default boolean DEFAULT false,
  config jsonb NOT NULL, -- تنظیمات ستون‌ها و فیلترها { columns: [], filters: [] }
  created_by uuid REFERENCES auth.users(id), -- اگر Auth فعال باشه
  created_at timestamptz DEFAULT now()
);

-- باز کردن دسترسی (فعلا برای همه)
ALTER TABLE public.views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Views Access" ON public.views FOR ALL USING (true);

-- ۱. جدول مدیریت گزینه‌های انتخابی (رنگ‌ها، جنس‌ها و...)
CREATE TABLE public.option_sets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL, -- مثلا 'leather_color', 'lining_material'
  label text NOT NULL, -- چیزی که نمایش داده میشه: 'عسلی'
  value text NOT NULL, -- چیزی که ذخیره میشه: 'honey'
  created_at timestamptz DEFAULT now()
);

-- باز کردن دسترسی برای همه (جهت تست)
ALTER TABLE public.option_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Options Access" ON public.option_sets FOR ALL USING (true);

-- ۲. اضافه کردن فیلدهای ثابت جدید به جدول محصولات (طبق اکسل)
ALTER TABLE public.products ADD COLUMN calculation_method text; -- روش محاسبه
-- waste_rate قبلاً بود، اگر نیست اضافه کن
-- specs هم قبلاً بود (jsonb) که عالیه برای فیلدهای متغیر

-- اضافه کردن ستون وضعیت (اگر قبلاً مشکل داشته)
ALTER TABLE public.products ALTER COLUMN status SET DEFAULT 'active';

-- اضافه کردن فیلدهای جدید چرم و مواد اولیه
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_type text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_color_1 text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_finish_1 text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_sort text;

-- فیلدهای آستر
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lining_material text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lining_color text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lining_dims text;

-- فیلدهای خرجکار و یراق
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS acc_material text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fitting_type text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fitting_size text;

-- فیلد برای ذخیره اقلام جدول (BOM) به صورت JSON
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bundle_items jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS final_product_bom jsonb;

-- ۱. اصلاح ستون اقلام بسته (اگر قبلاً با نام bundle_items ساختید تغییر نام دهید، وگرنه بسازید)
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'bundle_items') THEN
    ALTER TABLE public.products RENAME COLUMN bundle_items TO "bundleItems";
  ELSE
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "bundleItems" jsonb;
  END IF;
END $$;

-- ۲. اصلاح ستون فرمول ساخت (اگر قبلاً با نام final_product_bom ساختید تغییر نام دهید، وگرنه بسازید)
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'final_product_bom') THEN
    ALTER TABLE public.products RENAME COLUMN final_product_bom TO "finalProductBOM";
  ELSE
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "finalProductBOM" jsonb;
  END IF;
END $$;

-- ۱. جدول تنظیمات شرکت (فقط یک رکورد خواهد داشت)
CREATE TABLE public.company_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text,
  ceo_name text,
  national_id text,
  mobile text,
  phone text,
  address text,
  website text,
  email text,
  logo_url text,
  updated_at timestamptz DEFAULT now()
);

-- ۲. جدول نقش‌ها / چارت سازمانی
CREATE TABLE public.org_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL, -- عنوان جایگاه (مثلا: مدیر فروش)
  parent_id uuid REFERENCES public.org_roles(id), -- برای ساختار درختی
  permissions jsonb DEFAULT '{}', -- دسترسی‌ها به صورت JSON ذخیره می‌شود
  created_at timestamptz DEFAULT now()
);

-- ۳. آپدیت جدول پروفایل‌ها (اتصال کاربر به نقش)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.org_roles(id);

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- فعال‌سازی RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Company" ON public.company_settings FOR ALL USING (true);

ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Roles" ON public.org_roles FOR ALL USING (true);

-- ۱. تنظیم تولید خودکار ID (اگر قبلاً ست نشده باشد)
ALTER TABLE public.profiles 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ۲. حذف محدودیت اتصال اجباری به جدول auth (این اجازه می‌دهد پروفایل کارمند بسازید بدون اینکه هنوز ثبت نام کرده باشد)
-- نگران نباشید، بعداً می‌توان با ایمیل آنها را مچ کرد.
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- ۳. اجازه دادن به ادمین برای افزودن کاربر (رفع خطای RLS)
-- ابتدا پالیسی‌های قبلی اینزرت را پاک می‌کنیم تا تداخل پیش نیاید
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.profiles;

-- حالا اجازه درج را به همه (یا حداقل کسانی که لاگین هستند) می‌دهیم
CREATE POLICY "Enable insert for authenticated users" 
ON public.profiles 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- (اختیاری) اگر باز هم اذیت کرد، کلا امنیت این جدول را موقت خاموش کن:
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- تابع کمکی برای آپدیت خودکار زمان ویرایش
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    -- سعی میکنیم یوزر جاری را بگیریم (اگر از طریق API کال شده باشد)
    NEW.updated_by = auth.uid(); 
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ایجاد ستون‌های سیستمی برای جدول محصولات
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS assignee_id uuid, -- آیدی کاربر یا نقش
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user'; -- 'user' یا 'role'

-- ایجاد ستون‌های سیستمی برای جدول BOM
ALTER TABLE public.production_boms 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

-- تریگر برای آپدیت خودکار زمان ویرایش (محصولات)
DROP TRIGGER IF EXISTS update_products_modtime ON public.products;
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- تریگر برای آپدیت خودکار زمان ویرایش (BOM)
DROP TRIGGER IF EXISTS update_boms_modtime ON public.production_boms;
CREATE TRIGGER update_boms_modtime BEFORE UPDATE ON public.production_boms FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 1. جدول مرجع تگ‌ها (Tags)
CREATE TABLE public.tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL, -- عنوان تگ (مثلا: "فوری"، "پروژه آلفا")
  color text DEFAULT 'blue', -- رنگ تگ (blue, red, gold, #ff0000)
  created_at timestamptz DEFAULT now()
);

-- 2. جدول رابط (برای اتصال تگ به رکوردها در ماژول‌های مختلف)
CREATE TABLE public.record_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id uuid NOT NULL, -- آیدی رکورد (محصول، مشتری و...)
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE,
  module_id text NOT NULL, -- نام ماژول (products, customers...)
  created_at timestamptz DEFAULT now()
);

-- افزودن چند تگ نمونه برای تست
INSERT INTO public.tags (title, color) VALUES 
('ویژه', 'gold'),
('بدهکار', 'red'),
('همکار تجاری', 'cyan'),
('پروژه نوروز', 'purple');

-- فعال‌سازی دسترسی (RLS)
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Tags" ON public.tags FOR ALL USING (true);

ALTER TABLE public.record_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Record Tags" ON public.record_tags FOR ALL USING (true);
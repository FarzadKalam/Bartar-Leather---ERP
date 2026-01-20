# Database Schema Documentation - Bartar Leather ERP

**Version:** 4.0  
**Database:** PostgreSQL (Supabase)  
**Last Updated:** January 7, 2026

این سند ساختار کامل دیتابیس، جداول، روابط، و سیاست‌های امنیتی را توضیح می‌دهد.

---

## 📋 فهرست مطالب

1. [نمای کلی](#نمای-کلی)
2. [جداول اصلی](#جداول-اصلی)
3. [جداول سیستمی](#جداول-سیستمی)
4. [روابط (Relations)](#روابط-relations)
5. [Indexes و Optimization](#indexes-و-optimization)
6. [RLS Policies](#rls-policies)
7. [Triggers و Functions](#triggers-و-functions)
8. [Migration Scripts](#migration-scripts)

---

## 🎯 نمای کلی

### آمار کلی

```
📊 تعداد جداول: 20+
🔗 تعداد Relations: 35+
🔒 RLS Status: ⚠️ در حال توسعه
📈 Indexes: ⚠️ نیاز به بهینه‌سازی
```

### دیاگرام ER (ساده‌شده)

```
┌─────────────┐         ┌─────────────┐
│  profiles   │────┬───▶│  customers  │
└─────────────┘    │    └─────────────┘
                   │           │
                   │           ▼
                   │    ┌─────────────┐
                   ├───▶│  products   │
                   │    └─────────────┘
                   │           │
                   │           ▼
┌─────────────┐    │    ┌─────────────┐
│  suppliers  │◀───┘    │    boms     │
└─────────────┘         └─────────────┘
       │                       │
       │                       ▼
       ▼                ┌─────────────┐
┌─────────────┐         │  bom_items  │
│  invoices   │         └─────────────┘
└─────────────┘
```

---

## 📦 جداول اصلی

### 1. `profiles` - پروفایل کاربران

کاربران سیستم (اتصال به Supabase Auth)

```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text,
  mobile_1 text,
  mobile_2 text,
  email text,
  team text,                    -- آرایه تیم‌ها (JSON)
  position text,                -- سمت شغلی
  hire_date date,               -- تاریخ استخدام
  avatar_url text,              -- لینک تصویر پروفایل
  role text DEFAULT 'viewer',   -- نقش (admin, sales, warehouse, ...)
  role_id uuid REFERENCES org_roles(id),  -- رابطه با چارت سازمانی
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Indexes:**
```sql
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);
```

**نکات:**
- ✅ اتصال به `auth.users` از Supabase
- ⚠️ RLS: باید محدود به کاربر جاری شود
- 🔄 `role` و `role_id` هر دو موجود (قدیمی + جدید)

---

### 2. `products` - محصولات

تمام محصولات (مواد اولیه، نیمه‌آماده، نهایی)

```sql
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- اطلاعات پایه
  name text NOT NULL,
  system_code text UNIQUE,      -- کد خودکار سیستم
  manual_code text,              -- کد دستی
  image_url text,
  
  -- دسته‌بندی
  product_type text,             -- raw, semi, final
  category text,                 -- leather, lining, fitting, accessory
  
  -- واحدها
  main_unit text,                -- متر، کیلو، عدد
  sub_unit text,
  
  -- قیمت‌ها
  buy_price int8,
  buy_price_updated_at timestamptz,
  cost_price int8,               -- بهای تمام شده
  sell_price int8,
  sell_price_updated_at timestamptz,
  
  -- موجودی
  stock numeric DEFAULT 0,
  reorder_point numeric DEFAULT 0,  -- حد سفارش مجدد
  
  -- روابط
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  brand text,
  
  -- مشخصات تخصصی چرم
  leather_type text,             -- cow, goat, sheep
  leather_color_1 text,
  leather_color_2 text,
  leather_finish_1 text,         -- صفحه چرم
  leather_finish_2 text,
  leather_sort text,             -- سورت
  waste_rate numeric DEFAULT 0,  -- ضایعات
  
  -- مشخصات آستر
  lining_material text,
  lining_color text,
  lining_dims text,              -- ابعاد
  
  -- مشخصات یراق و خرجکار
  fitting_type text,
  fitting_size text,
  acc_material text,
  
  -- جداول تو در تو (Master-Detail)
  "bundleItems" jsonb,           -- اقلام بسته
  "finalProductBOM" jsonb,       -- فرمول ساخت
  
  -- فیلدهای سیستمی
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  assignee_id uuid,              -- مسئول
  assignee_type text DEFAULT 'user'
);
```

**Indexes:**
```sql
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_type ON products(product_type);
```

**Triggers:**
```sql
CREATE TRIGGER update_products_modtime 
BEFORE UPDATE ON products 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
```

---

### 3. `customers` - مشتریان

```sql
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- اطلاعات شخصی
  prefix text,                   -- آقای، خانم، دکتر
  first_name text,
  last_name text,
  business_name text,            -- نام کسب و کار
  image_url text,
  
  -- تماس
  mobile_1 text,
  mobile_2 text,
  landline text,
  instagram_id text,
  telegram_id text,
  
  -- آدرس
  province text,
  city text,
  address text,
  location_url text,             -- لینک Google Maps
  
  -- امتیاز
  rating int4 DEFAULT 5,
  
  -- فیلدهای سیستمی
  created_at timestamptz DEFAULT now()
);
```

**Indexes:**
```sql
CREATE INDEX idx_customers_mobile ON customers(mobile_1);
CREATE INDEX idx_customers_last_name ON customers(last_name);
```

---

### 4. `suppliers` - تامین‌کنندگان

```sql
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- اطلاعات پایه
  prefix text,
  first_name text,
  last_name text,
  business_name text,
  
  -- تماس
  mobile_1 text,
  mobile_2 text,
  landline text,
  
  -- آدرس
  province text,
  city text,
  address text,
  location_url text,
  instagram_id text,
  telegram_id text,
  
  -- مالی
  payment_method text,           -- نقد، چک، اعتباری
  rating int4 DEFAULT 5,
  
  -- سیستمی
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
```

---

### 5. `boms` - شناسنامه‌های تولید

```sql
CREATE TABLE public.boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  custom_code text UNIQUE,
  status text,                   -- active, archived
  
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  assignee_id uuid,
  assignee_type text DEFAULT 'user'
);
```

### 6. `bom_items` - اقلام BOM

```sql
CREATE TABLE public.bom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id uuid REFERENCES boms(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  
  -- محاسبات
  length numeric,
  width numeric,
  area numeric,
  pieces_count int4,
  consumption numeric              -- مقدار مصرف
);
```

**Foreign Keys:**
- `bom_id` → `boms(id)` (CASCADE)
- `product_id` → `products(id)`

---

### 7. `invoices` - فاکتورها

```sql
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  invoice_type text,             -- proforma, final
  status text,
  
  -- روابط
  customer_id uuid REFERENCES customers(id),
  marketer_id uuid REFERENCES profiles(id),
  
  -- مالی
  payment_method text,
  sales_channel text,
  total_amount int8,
  total_discount int8,
  total_tax int8,
  final_payable int8,
  financial_approval bool DEFAULT false,
  
  -- متن
  terms_conditions text,
  
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
```

### 8. `invoice_items` - اقلام فاکتور

```sql
CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  
  quantity numeric,
  unit_price int8,
  tax int8,
  discount int8,
  row_total int8
);
```

---

### 9. `warehouses` - انبارها

```sql
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  manager_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
```

### 10. `shelves` - قفسه‌ها

```sql
CREATE TABLE public.shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE CASCADE,
  shelf_number text NOT NULL,
  location_detail text,
  responsible_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
```

---

### 11. `tasks` - وظایف

```sql
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  task_type text,                -- سازمانی، تولید، بازاریابی
  name text NOT NULL,
  
  responsible_id uuid REFERENCES profiles(id),
  assigned_at timestamptz,
  due_at timestamptz,
  
  -- رابطه با ماژول‌ها
  related_to_id uuid,
  related_to_module text,        -- products, customers, ...
  
  status text,
  remind_me bool DEFAULT false,
  recurrence_info jsonb,
  
  created_at timestamptz DEFAULT now()
);
```

---

## 🔧 جداول سیستمی

### 1. `tags` - تگ‌ها

```sql
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  color text DEFAULT 'blue',     -- blue, red, gold, #ff0000
  created_at timestamptz DEFAULT now()
);
```

### 2. `record_tags` - رابطه تگ به رکورد (Many-to-Many)

```sql
CREATE TABLE public.record_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL,       -- ID رکورد (محصول، مشتری، ...)
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  module_id text NOT NULL,       -- products, customers, ...
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(record_id, tag_id, module_id)
);
```

**Indexes:**
```sql
CREATE INDEX idx_record_tags_record ON record_tags(record_id, module_id);
CREATE INDEX idx_record_tags_tag ON record_tags(tag_id);
```

---

### 3. `views` / `saved_views` - نماهای ذخیره‌شده

```sql
CREATE TABLE public.views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL,       -- products, customers
  name text NOT NULL,            -- "کالاهای گران چرمی"
  is_default boolean DEFAULT false,
  config jsonb NOT NULL,         -- { columns: [], filters: [] }
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

**مثال Config:**
```json
{
  "columns": ["name", "category", "stock", "sell_price"],
  "filters": [
    { "field": "category", "operator": "eq", "value": "leather" },
    { "field": "sell_price", "operator": "gte", "value": 1000000 }
  ],
  "sortBy": { "field": "sell_price", "direction": "desc" }
}
```

---

### 4. `option_sets` - گزینه‌های انتخابی

```sql
CREATE TABLE public.option_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,        -- leather_color, lining_material
  label text NOT NULL,           -- "عسلی"
  value text NOT NULL,           -- "honey"
  created_at timestamptz DEFAULT now()
);
```

**مثال داده:**
```sql
INSERT INTO option_sets (category, label, value) VALUES
('leather_color', 'عسلی', 'honey'),
('leather_color', 'قهوه‌ای', 'brown'),
('lining_material', 'ساتن', 'satin'),
('fitting_type', 'زیپ فلزی', 'metal_zipper');
```

---

### 5. `company_settings` - تنظیمات شرکت

```sql
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  ceo_name text,
  national_id text,              -- شناسه ملی
  mobile text,
  phone text,
  address text,
  website text,
  email text,
  logo_url text,
  updated_at timestamptz DEFAULT now()
);
```

**نکته:** فقط **یک رکورد** باید داشته باشد.

---

### 6. `org_roles` - چارت سازمانی

```sql
CREATE TABLE public.org_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,           -- "مدیر فروش"
  parent_id uuid REFERENCES org_roles(id),  -- ساختار درختی
  permissions jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

**مثال Permissions:**
```json
{
  "products": { "view": true, "edit": true, "delete": false },
  "customers": { "view": true, "edit": true, "delete": true },
  "invoices": { "view": true, "edit": false, "delete": false }
}
```

---

### 7. `financial_documents` - اسناد مالی

```sql
CREATE TABLE public.financial_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id),
  doc_type text,                 -- income, expense
  amount int8,
  
  -- تاریخ‌ها
  payment_date timestamptz,
  due_date timestamptz,
  
  -- طرفین
  payer_id uuid,
  receiver_id uuid,
  source_account text,
  destination_account text,
  
  -- مدارک
  receipt_image_url text,
  tracking_code text,
  
  -- نوع پرداخت
  payment_mode text,             -- cash, credit, check
  check_status text,
  check_number text,
  check_image_url text,
  
  -- سیاد
  sayad_id text,
  is_sayad_registered bool,
  account_owner_name text,
  account_owner_national_id text,
  
  created_at timestamptz DEFAULT now()
);
```

---

### 8. `stock_transfers` - حواله‌های انبار

```sql
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_type text,            -- تولید، خرید، فروش، بین‌واحدی
  
  product_id uuid REFERENCES products(id),
  required_qty numeric,
  delivered_qty numeric,
  
  -- روابط
  invoice_id uuid,
  production_order_id uuid,
  sender_id uuid REFERENCES profiles(id),
  receiver_id uuid REFERENCES profiles(id),
  
  -- تاییدیه‌ها
  is_sender_confirmed bool DEFAULT false,
  is_receiver_confirmed bool DEFAULT false,
  
  -- مکان‌ها
  from_shelf_id uuid REFERENCES shelves(id),
  to_shelf_id uuid REFERENCES shelves(id),
  from_warehouse_id uuid REFERENCES warehouses(id),
  to_warehouse_id uuid REFERENCES warehouses(id),
  
  created_at timestamptz DEFAULT now()
);
```

---

## 🔗 روابط (Foreign Keys)

### نمودار روابط اصلی

```
products.supplier_id        → suppliers.id
products.created_by         → auth.users.id
products.assignee_id        → profiles.id

customers                   (standalone)

boms.created_by             → auth.users.id
bom_items.bom_id            → boms.id (CASCADE)
bom_items.product_id        → products.id

invoices.customer_id        → customers.id
invoices.marketer_id        → profiles.id
invoice_items.invoice_id    → invoices.id (CASCADE)
invoice_items.product_id    → products.id

shelves.warehouse_id        → warehouses.id (CASCADE)
shelves.responsible_id      → profiles.id

tasks.responsible_id        → profiles.id

record_tags.tag_id          → tags.id (CASCADE)

views.created_by            → auth.users.id

org_roles.parent_id         → org_roles.id (self-reference)
profiles.role_id            → org_roles.id
```

### CASCADE Delete Policy

| Parent → Child | Action |
|---------------|--------|
| `boms` → `bom_items` | **CASCADE** (حذف خودکار) |
| `invoices` → `invoice_items` | **CASCADE** |
| `warehouses` → `shelves` | **CASCADE** |
| `tags` → `record_tags` | **CASCADE** |
| `suppliers` → `products` | **SET NULL** (محصول باقی می‌ماند) |
| `customers` → `invoices` | **RESTRICT** (باید دستی حذف شود) |

---

## ⚡ Indexes و Optimization

### Indexes موجود

```sql
-- profiles
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

-- products
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_type ON products(product_type);

-- customers
CREATE INDEX idx_customers_mobile ON customers(mobile_1);
CREATE INDEX idx_customers_last_name ON customers(last_name);

-- record_tags
CREATE INDEX idx_record_tags_record ON record_tags(record_id, module_id);
CREATE INDEX idx_record_tags_tag ON record_tags(tag_id);
```

### ⚠️ Indexes پیشنهادی (نیاز به اضافه شدن)

```sql
-- invoices
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(created_at DESC);

-- bom_items
CREATE INDEX idx_bom_items_bom ON bom_items(bom_id);
CREATE INDEX idx_bom_items_product ON bom_items(product_id);

-- tasks
CREATE INDEX idx_tasks_responsible ON tasks(responsible_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_at);

-- views
CREATE INDEX idx_views_module ON views(module_id);
CREATE INDEX idx_views_user ON views(created_by);
```

### Query Optimization Tips

```sql
-- ❌ بد: جستجوی بدون Index
SELECT * FROM products WHERE LOWER(name) LIKE '%کیف%';

-- ✅ خوب: استفاده از Full-Text Search
ALTER TABLE products ADD COLUMN name_tsv tsvector;
CREATE INDEX idx_products_fts ON products USING gin(name_tsv);

UPDATE products SET name_tsv = to_tsvector('simple', name);

SELECT * FROM products WHERE name_tsv @@ to_tsquery('کیف');
```

---

## 🔒 RLS (Row Level Security) Policies

### ⚠️ وضعیت فعلی: ناقص

بیشتر جداول RLS فعال دارند اما Policy‌ها generic هستند:

```sql
-- همه جداول:
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON [table_name] FOR ALL USING (true);
```

**مشکل:** همه کاربران به همه داده‌ها دسترسی دارند! 🔴

---

### ✅ RLS Policies پیشنهادی

#### 1. Products - محدودیت بر اساس نقش

```sql
-- حذف Policy قدیمی
DROP POLICY IF EXISTS "Public Access" ON products;

-- مشاهده: همه کاربران لاگین شده
CREATE POLICY "products_select_policy" 
ON products FOR SELECT 
TO authenticated 
USING (true);

-- ویرایش: فقط Admin و Warehouse
CREATE POLICY "products_update_policy" 
ON products FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'warehouse')
  )
);

-- حذف: فقط Admin
CREATE POLICY "products_delete_policy" 
ON products FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- درج: Admin و Warehouse
CREATE POLICY "products_insert_policy" 
ON products FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'warehouse')
  )
);
```

#### 2. Customers - دسترسی بر اساس تیم

```sql
CREATE POLICY "customers_select_policy" 
ON customers FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'sales')
      OR profiles.team @> ARRAY['sales']::text[]
    )
  )
);
```

#### 3. Invoices - فقط ایجادکننده و Admin

```sql
CREATE POLICY "invoices_select_policy" 
ON invoices FOR SELECT 
TO authenticated 
USING (
  created_by = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
```

#### 4. Profiles - فقط خودش و Admin

```sql
CREATE POLICY "profiles_select_policy" 
ON profiles FOR SELECT 
TO authenticated 
USING (
  id = auth.uid()  -- خودش
  OR
  EXISTS (
    SELECT 1 FROM profiles AS p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'  -- یا Admin
  )
);
```

---

## 🔄 Triggers و Functions

### 1. Auto-Update Timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    NEW.updated_by = auth.uid();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- اعمال به جداول:
CREATE TRIGGER update_products_modtime 
BEFORE UPDATE ON products 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_boms_modtime 
BEFORE UPDATE ON boms 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
```

### 2. Auto-Generate System Code

```sql
CREATE OR REPLACE FUNCTION generate_system_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.system_code IS NULL THEN
    NEW.system_code := 'PRD-' || to_char(NEW.created_at, 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER products_generate_code 
BEFORE INSERT ON products 
FOR EACH ROW EXECUTE PROCEDURE generate_system_code();
```

### 3. Stock Validation

```sql
CREATE OR REPLACE FUNCTION validate_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock < 0 THEN
    RAISE EXCEPTION 'موجودی نمی‌تواند منفی باشد!';
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER products_stock_validation 
BEFORE UPDATE ON products 
FOR EACH ROW EXECUTE PROCEDURE validate_stock();
```

---

## 🚀 Migration Scripts

### Initial Setup

```bash
# 1. اجرا در Supabase SQL Editor:
psql -h db.xxx.supabase.co -U postgres -d postgres -f database.sql

# 2. یا از Dashboard:
# SQL Editor → New Query → Paste → Run
```

### Migration Template

```sql
-- Migration: Add field to products
-- Date: 2026-01-07
-- Author: Farzad

BEGIN;

-- Add new column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS new_field text;

-- Create index
CREATE INDEX IF NOT EXISTS idx_products_new_field 
ON products(new_field);

-- Update existing records
UPDATE products SET new_field = 'default_value' WHERE new_field IS NULL;

COMMIT;
```

---

## 📊 نمودار ERD کامل

```
┌──────────────────┐
│   auth.users     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐       ┌──────────────────┐
│    profiles      │──────▶│   org_roles      │
└────────┬─────────┘       └──────────────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│    products      │  │   customers      │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         │ supplier_id         │ customer_id
         │                     │
         ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│    suppliers     │  │    invoices      │
└──────────────────┘  └────────┬─────────┘
                               │
                               ▼
                      ┌──────────────────┐
                      │  invoice_items   │
                      └──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│      boms        │──────▶│   bom_items      │
└──────────────────┘       └────────┬─────────┘
                                    │
                                    │ product_id
                                    │
                                    ▼
                           ┌──────────────────┐
                           │    products      │
                           └──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│      tags        │◀──────│  record_tags     │
└──────────────────┘       └──────────────────┘
                           (Many-to-Many)
```

---

## 📝 نکات مهم

### ✅ Best Practices

1. **همیشه Foreign Keys تعریف کنید**
2. **Indexes برای ستون‌های جستجو اضافه کنید**
3. **RLS Policies محدودکننده بنویسید**
4. **Triggers برای Validation استفاده کنید**
5. **Migration Scripts نگه دارید**

### ⚠️ نکات امنیتی

- 🔴 **RLS را فعال و محدود کنید**
- 🔴 **مستقیماً به `auth.users` دسترسی ندهید**
- 🔴 **Sensitive Data را Encrypt کنید**
- 🟡 **Regular Backup بگیرید**

### 🚧 کارهای باقیمانده

- [ ] تکمیل RLS Policies
- [ ] اضافه کردن Indexes پیشنهادی
- [ ] پیاده‌سازی Audit Log
- [ ] اضافه کردن Full-Text Search
- [ ] تست Performance با داده‌های واقعی

---

**نگهداری توسط:** Farzad  
**همکار AI:** Claude (Anthropic)  
**Database Version:** PostgreSQL 15.x (Supabase)

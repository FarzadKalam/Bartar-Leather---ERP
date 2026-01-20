# Plan: Material Management System برای BOM، Bundle و Production Orders

**تاریخ:** 7 ژانویه 2026  
**نسخه:** 1.0  
**وضعیت:** Planning

---

## 📊 تحلیل وضعیت فعلی

### ✅ موجود
- `products` - تمام محصولات (مواد اولیه، نیمه‌آماده، نهایی)
- `boms` - شناسنامه‌های تولید
- `bom_items` - ردیف‌های BOM
- `product_bundles` - بسته‌های محصول
- `bundle_items` - ردیف‌های بسته
- `BomStructureRenderer` - نمایش جداول BOM
- `EditableTable` - جدول قابل ویرایش

### ❌ نیاز دارد
- **جداول Database:**
  - `production_orders` - سفارشات تولید
  - `production_stages` - مراحل تولید
  - `production_materials` - مواد موردنیاز برای سفارش

- **کامپوننت‌ها:**
  - `MaterialSelector` - جستجو/اسکن مواد اولیه
  - `MaterialsTable` - جدول مشترک برای همه موارد
  - `DynamicMaterialsRenderer` - نمایش متناسب با product_type

- **Module Configs:**
  - `productionOrdersConfig` - تکمیل شود
  - `productBundlesConfig` - ایجاد شود
  - `productsConfig` - بروزرسانی برای جداول مواد

---

## 🎯 Logical Flow

### Scenario 1: محصول نیمه‌آماده انتخاب شود
```
محصول نیمه‌آماده (Semi-Finished)
    ↓
جدول مواد باز شود (مثل BOM، اما بدون دستمزد)
    ↓
برای هر ردیف:
  - MaterialSelector: جستجو/اسکن محصول مواد اولیه
  - انتخاب کمیت
    ↓
ذخیره‌سازی (product_materials یا مانند BOM)
```

### Scenario 2: محصول نهایی انتخاب شود
```
محصول نهایی (Final)
    ↓
فیلد "تولید مرتبط" (Related Production)
    ↓
گزینه‌های:
  1) انتخاب BOM از موجود (relation dropdown)
  2) انتخاب Bundle از موجود
  3) افزودن تولید جدید (nested create)
    ↓
ذخیره‌سازی
```

### Scenario 3: سفارش تولید ایجاد شود
```
سفارش تولید جدید
    ↓
انتخاب BOM
    ↓
جدول BOM نمایش داده شود (مثل BomStructureRenderer)
    ↓
کمیت سفارش
    ↓
ذخیره‌سازی
```

---

## 🏗️ Architecture Decisions

### 1. **جداول Database**

#### `production_orders` (نیاز به ایجاد)
```sql
CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  bom_id uuid REFERENCES public.boms(id),
  quantity numeric NOT NULL,
  status text DEFAULT 'pending', -- pending, in_progress, completed
  start_date timestamptz,
  due_date timestamptz,
  assigned_to_id uuid REFERENCES public.profiles(id),
  priority text, -- high, medium, low
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
```

#### `production_stages` (نیاز به ایجاد)
```sql
CREATE TABLE public.production_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE CASCADE,
  stage_name text, -- cutting, stitching, finishing, qc, packing
  status text DEFAULT 'pending', -- pending, in_progress, completed
  progress_percentage numeric DEFAULT 0,
  assigned_to_id uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz DEFAULT now()
);
```

#### `production_materials` (نیاز به ایجاد)
```sql
CREATE TABLE public.production_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  required_qty numeric,
  allocated_qty numeric DEFAULT 0,
  used_qty numeric DEFAULT 0,
  status text DEFAULT 'pending', -- pending, allocated, used
  created_at timestamptz DEFAULT now()
);
```

### 2. **کامپوننت Architecture**

#### `MaterialSelector.tsx`
- جستجو برای محصولات (search + filter by category)
- اسکن (barcode input)
- نمایش نتایج
- انتخاب محصول

#### `MaterialsTable.tsx`
- جدول مشترک برای تمام موارد
- Blocks: چرم، آستر، یراق، خرجکار
- Conditional rendering: نمایش/عدم نمایش دستمزد
- Calculated columns: total_price

#### `ProductMaterialsRenderer.tsx` (نمایش متناسب)
```
اگر product_type = 'semi_finished':
  → نمایش جدول (بدون دستمزد)
اگر product_type = 'final':
  → نمایش dropdown برای BOM/Bundle
  → Option: افزودن تولید نو
```

### 3. **Module Config Updates**

#### `productsConfig.ts`
```typescript
// افزودن conditional block:
// اگر product_type = 'semi_finished' or 'final':
//   → جدول مواد نمایش داده شود
```

#### `productionOrdersConfig.ts` (تکمیل)
```typescript
// فیلدهای موجود:
// - order_number
// - bom_id (RELATION)
// - quantity
// - status

// نیاز به اضافه:
// - جدول BOM items (نمایش متناسب)
// - production_materials relation
```

#### `productBundlesConfig.ts` (ایجاد)
```typescript
export const productBundlesConfig: ModuleDefinition = {
  id: 'product_bundles',
  fields: [
    { key: 'bundle_number', type: FieldType.TEXT },
    { key: 'shelf_id', type: FieldType.RELATION },
    // ... سایر فیلدها
  ],
  blocks: [
    // جدول bundle_items (مثل BOM)
  ]
};
```

---

## 📋 Implementation Steps

### Phase 1: Database & Basic Config
- [ ] ایجاد جداول production_orders, production_stages, production_materials
- [ ] Update database.sql
- [ ] ایجاد migrations

### Phase 2: Reusable Components
- [ ] ایجاد MaterialSelector component
- [ ] ایجاد MaterialsTable component
- [ ] ایجاد ProductMaterialsRenderer component

### Phase 3: Module Updates
- [ ] تکمیل productionOrdersConfig
- [ ] ایجاد productBundlesConfig
- [ ] Update productsConfig با conditional blocks

### Phase 4: Integration
- [ ] نمایش MaterialsTable در محصولات
- [ ] نمایش MaterialsTable در سفارشات تولید
- [ ] نمایش MaterialsTable در بسته‌های محصول
- [ ] Integration با tasks

### Phase 5: Testing
- [ ] Manual testing تمام scenarios
- [ ] بررسی database queries
- [ ] بررسی calculations

---

## 🔑 Key Points

1. **Reusability:** MaterialsTable باید برای همه موارد استفاده شود
2. **Database-First:** تمام datat از database، نه hardcoded
3. **Type Safety:** strict TypeScript
4. **Conditional Logic:** display متناسب با product_type
5. **Search/Scan:** MaterialSelector باید جستجو و اسکن پشتیبانی کند
6. **Performance:** Proper indexing برای queries

---

**نسخه‌ی بعدی:** Detailed implementation plan برای هر component

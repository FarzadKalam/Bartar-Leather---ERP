# Relations Guide - Bartar Leather ERP

**Version:** 4.0  
**Last Updated:** January 7, 2026

این راهنما نحوه پیاده‌سازی و استفاده از روابط (Relations) در سیستم را توضیح می‌دهد.

---

## 📋 فهرست مطالب

1. [انواع روابط](#انواع-روابط)
2. [One-to-Many (1:N)](#one-to-many-1n)
3. [Many-to-One Display (N:1)](#many-to-one-display-n1)
4. [Many-to-Many (N:M)](#many-to-many-nm)
5. [Master-Detail Relations](#master-detail-relations)
6. [Reverse Relations (Related Tabs)](#reverse-relations-related-tabs)
7. [مثال‌های کامل](#مثالهای-کامل)
8. [رفع مشکلات متداول](#رفع-مشکلات-متداول)

---

## 🔗 انواع روابط

سیستم از 4 نوع رابطه پشتیبانی می‌کند:

| نوع | توضیح | مثال | پیاده‌سازی |
|-----|-------|------|-----------|
| **1:N** | یک به چند | محصول → تامین‌کننده | Foreign Key |
| **N:1** | نمایش معکوس | تامین‌کننده → محصولات | Related Tabs |
| **N:M** | چند به چند | محصولات ↔ دسته‌بندی‌ها | Junction Table |
| **Master-Detail** | جداول تو در تو | BOM → اقلام | Nested Tables |

---

## 1️⃣ One-to-Many (1:N)

### مفهوم
یک رکورد در جدول A به یک رکورد در جدول B اشاره می‌کند.

**مثال:** هر محصول یک تامین‌کننده دارد.

### ساختار دیتابیس

```sql
-- جدول تامین‌کنندگان
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  mobile_1 text
);

-- جدول محصولات
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL
  -- ↑ Foreign Key
);
```

### پیکربندی در Config

```typescript
// modules/productsConfig.ts
export const productsConfig: ModuleDefinition = {
  id: 'products',
  fields: [
    {
      key: 'supplier_id',
      labels: { fa: 'تامین‌کننده', en: 'Supplier' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      
      // ✅ تنظیمات رابطه:
      relationConfig: {
        targetModule: 'suppliers',       // ماژول مقصد
        targetField: 'business_name',    // فیلد نمایشی
        filter: { status: 'active' }     // (اختیاری) فیلتر
      },
      
      validation: { required: true },
      isTableColumn: true
    }
  ]
};
```

### نحوه کارکرد

1. **در فرم:** کاربر یک Select می‌بیند با لیست تامین‌کنندگان
2. **در جدول:** به جای UUID، نام تامین‌کننده نمایش داده می‌شود
3. **در نمایش تکی:** یک Tag کلیک‌پذیر که به صفحه تامین‌کننده لینک دارد

### کد اجرایی (ModuleShow.tsx)

```typescript
// 1. بارگذاری گزینه‌ها
const fetchRelationOptions = async (field: ModuleField) => {
  const { targetModule, targetField, filter } = field.relationConfig!;
  
  let query = supabase.from(targetModule).select(`id, ${targetField}`);
  
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
  }
  
  const { data } = await query;
  
  return data?.map(item => ({
    label: item[targetField],
    value: item.id
  }));
};

// 2. نمایش در UI
<Select
  options={relationOptions['supplier_id']}
  value={record.supplier_id}
  onChange={(value) => handleUpdate('supplier_id', value)}
/>
```

---

## 2️⃣ Many-to-One Display (N:1)

### مفهوم
نمایش تمام رکوردهای مرتبط در صفحه والد.

**مثال:** وقتی تامین‌کننده را باز می‌کنید، تمام محصولات او را ببینید.

### پیکربندی (Related Tabs)

```typescript
// modules/supplierConfig.ts
export const supplierModule: ModuleDefinition = {
  id: 'suppliers',
  // ...
  
  // ✅ تعریف تب‌های مرتبط:
  relatedTabs: [
    {
      name: 'products',                    // نام یکتا
      label: 'محصولات',                     // عنوان نمایشی
      icon: 'ShoppingCart',                // آیکون (Ant Design)
      relationField: 'supplier_id',        // کلید خارجی در جدول products
      displayFields: ['name', 'category', 'stock', 'sell_price'],
      displayMode: RelatedDisplayMode.LIST // LIST | CARD | KANBAN
    },
    {
      name: 'invoices',
      label: 'فاکتورهای خرید',
      icon: 'FileText',
      relationField: 'supplier_id',
      displayFields: ['invoice_number', 'total_amount', 'status'],
      displayMode: RelatedDisplayMode.CARD
    }
  ]
};
```

### نحوه کارکرد

```typescript
// RelatedRecordsPanel.tsx
const RelatedRecordsPanel = ({ tab, recordId }) => {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    const fetchRelated = async () => {
      const { data } = await supabase
        .from(tab.name) // 'products'
        .select('*')
        .eq(tab.relationField, recordId); // WHERE supplier_id = 'xyz'
      
      setData(data);
    };
    
    fetchRelated();
  }, [recordId]);
  
  return (
    <div>
      <h3>{tab.label}</h3>
      {data.map(item => (
        <Card key={item.id}>
          {tab.displayFields.map(field => (
            <div>{item[field]}</div>
          ))}
        </Card>
      ))}
    </div>
  );
};
```

### UI نهایی

```
┌───────────────────────────────────────┐
│  تامین‌کننده: شرکت ABC                │
│  ┌─────────────────────────────────┐  │
│  │ 📦 محصولات (12)                 │  │
│  │ • کیف چرمی - موجودی: 50         │  │
│  │ • کمربند - موجودی: 30           │  │
│  │ [نمایش بیشتر...]                │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ 📄 فاکتورها (5)                 │  │
│  │ • #001 - 5,000,000 تومان        │  │
│  │ • #002 - 3,200,000 تومان        │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

---

## 3️⃣ Many-to-Many (N:M)

### مفهوم
رابطه دو طرفه: هر محصول می‌تواند چند دسته‌بندی داشته باشد، و هر دسته‌بندی می‌تواند شامل چند محصول باشد.

**مثال:** محصولات ↔ دسته‌بندی‌ها

### ⚠️ وضعیت فعلی
**Status:** 🔴 در حال توسعه (پیاده‌سازی نشده)

### ساختار دیتابیس

```sql
-- جدول محصولات
CREATE TABLE products (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

-- جدول دسته‌بندی‌ها
CREATE TABLE categories (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id) -- برای سلسله‌مراتب
);

-- 👇 Junction Table (جدول واسط)
CREATE TABLE product_categories (
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  display_order int4,  -- (اختیاری) ترتیب نمایش
  PRIMARY KEY (product_id, category_id)
);

-- Index برای بهینه‌سازی
CREATE INDEX idx_product_categories_product ON product_categories(product_id);
CREATE INDEX idx_product_categories_category ON product_categories(category_id);
```

### پیکربندی (برنامه‌ریزی شده)

```typescript
// modules/productsConfig.ts
{
  key: 'categories',
  labels: { fa: 'دسته‌بندی‌ها', en: 'Categories' },
  type: FieldType.MULTI_SELECT, // یا FieldType.RELATION_MANY
  location: FieldLocation.BLOCK,
  blockId: 'basic_info',
  
  relationConfig: {
    targetModule: 'categories',
    targetField: 'name',
    
    // ✅ تنظیمات Many-to-Many:
    isManyToMany: true,
    junctionTable: 'product_categories',
    junctionKeys: {
      left: 'product_id',   // کلید این رکورد
      right: 'category_id'  // کلید رکورد مقصد
    }
  }
}
```

### نحوه کارکرد (Planned)

```typescript
// عملیات ذخیره‌سازی:
const saveProductCategories = async (productId: string, categoryIds: string[]) => {
  // 1. حذف روابط قبلی
  await supabase
    .from('product_categories')
    .delete()
    .eq('product_id', productId);
  
  // 2. درج روابط جدید
  const records = categoryIds.map((catId, index) => ({
    product_id: productId,
    category_id: catId,
    display_order: index
  }));
  
  await supabase
    .from('product_categories')
    .insert(records);
};

// عملیات بارگذاری:
const loadProductCategories = async (productId: string) => {
  const { data } = await supabase
    .from('product_categories')
    .select(`
      category_id,
      categories (
        id,
        name
      )
    `)
    .eq('product_id', productId)
    .order('display_order');
  
  return data?.map(item => item.categories);
};
```

### UI پیشنهادی

```tsx
<Select
  mode="multiple"  // ← چندگانه
  placeholder="انتخاب دسته‌بندی‌ها"
  value={selectedCategories}
  onChange={setSelectedCategories}
  options={allCategories}
  maxTagCount="responsive"
/>
```

---

## 4️⃣ Master-Detail Relations

### مفهوم
جداول تو در تو که اطلاعات جزئی یک رکورد را نمایش می‌دهند.

**مثال:** BOM (شناسنامه تولید) → اقلام BOM

### ساختار دیتابیس

```sql
-- جدول اصلی (Master)
CREATE TABLE boms (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  status text
);

-- جدول جزئیات (Detail)
CREATE TABLE bom_items (
  id uuid PRIMARY KEY,
  bom_id uuid REFERENCES boms(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  usage numeric,  -- مقدار مصرف
  unit text
);
```

### پیکربندی

```typescript
// modules/productionConfig.ts
export const productionBomModule: ModuleDefinition = {
  id: 'production_boms',
  blocks: [
    {
      id: 'items_leather',
      titles: { fa: 'بخش چرم', en: 'Leather Section' },
      type: BlockType.TABLE, // ← نوع جدول
      order: 1,
      
      // ✅ تعریف ستون‌ها:
      tableColumns: [
        {
          key: 'item_id',
          title: 'انتخاب چرم',
          type: FieldType.RELATION,
          relationConfig: {
            targetModule: 'products',
            targetField: 'name',
            filter: { category: 'leather' } // فقط چرم
          }
        },
        {
          key: 'usage',
          title: 'مقدار مصرف',
          type: FieldType.NUMBER
        },
        {
          key: 'buy_price',
          title: 'قیمت واحد',
          type: FieldType.PRICE
        },
        {
          key: 'total_price',
          title: 'بهای تمام شده',
          type: FieldType.PRICE,
          readonly: true,
          isCalculated: true  // محاسبه خودکار
        }
      ]
    }
  ]
};
```

### نحوه کارکرد (EditableTable.tsx)

```typescript
const EditableTable = ({ blockId, tableColumns, bomId }) => {
  const [rows, setRows] = useState([]);
  
  // بارگذاری داده‌ها
  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from(blockId) // 'items_leather'
        .select('*')
        .eq('bom_id', bomId);
      
      setRows(data || []);
    };
    fetchData();
  }, [bomId]);
  
  // افزودن ردیف
  const addRow = () => {
    setRows([...rows, { id: uuid(), bom_id: bomId }]);
  };
  
  // ذخیره تغییرات
  const saveRow = async (row) => {
    await supabase
      .from(blockId)
      .upsert(row);
  };
  
  return (
    <Table>
      {rows.map(row => (
        <EditableRow
          key={row.id}
          data={row}
          columns={tableColumns}
          onSave={saveRow}
        />
      ))}
      <Button onClick={addRow}>+ افزودن ردیف</Button>
    </Table>
  );
};
```

### محاسبات خودکار

```typescript
// BomStructureRenderer.tsx
const calculateTotal = (row) => {
  return (row.usage || 0) * (row.buy_price || 0);
};

const grandTotal = rows.reduce((sum, row) => {
  return sum + calculateTotal(row);
}, 0);
```

---

## 5️⃣ Reverse Relations (Related Tabs)

### مثال کامل: Supplier ↔ Products

#### قدم 1: ساختار دیتابیس

```sql
CREATE TABLE suppliers (
  id uuid PRIMARY KEY,
  business_name text
);

CREATE TABLE products (
  id uuid PRIMARY KEY,
  name text,
  supplier_id uuid REFERENCES suppliers(id)
);
```

#### قدم 2: Forward Relation (محصول → تامین‌کننده)

```typescript
// modules/productsConfig.ts
{
  key: 'supplier_id',
  type: FieldType.RELATION,
  relationConfig: {
    targetModule: 'suppliers',
    targetField: 'business_name'
  }
}
```

#### قدم 3: Reverse Relation (تامین‌کننده → محصولات)

```typescript
// modules/supplierConfig.ts
export const supplierModule: ModuleDefinition = {
  id: 'suppliers',
  relatedTabs: [
    {
      name: 'products',           // جدول مقصد
      label: 'محصولات',            // عنوان تب
      icon: 'ShoppingCart',       // آیکون
      relationField: 'supplier_id', // کلید خارجی در products
      displayFields: ['name', 'category', 'stock'],
      displayMode: RelatedDisplayMode.CARD,
      
      // (اختیاری) فیلتر اضافی
      extraFilter: { status: 'active' },
      
      // (اختیاری) مرتب‌سازی
      orderBy: { field: 'name', direction: 'asc' }
    }
  ]
};
```

#### قدم 4: رندر در UI

```typescript
// ModuleShow.tsx
const renderRelatedTabs = () => {
  return moduleConfig.relatedTabs?.map(tab => (
    <Tabs.TabPane
      key={tab.name}
      tab={
        <span>
          <Icon component={tab.icon} />
          {tab.label}
        </span>
      }
    >
      <RelatedRecordsPanel
        tab={tab}
        parentRecordId={recordId}
      />
    </Tabs.TabPane>
  ));
};
```

---

## 🎯 مثال‌های کامل

### مثال 1: Customer → Orders → Order Items

```typescript
// customerConfig.ts
relatedTabs: [
  {
    name: 'orders',
    label: 'سفارشات',
    icon: 'ShoppingCart',
    relationField: 'customer_id',
    displayFields: ['order_number', 'total_amount', 'status'],
    displayMode: RelatedDisplayMode.LIST
  }
]

// orderConfig.ts (در صفحه Order)
blocks: [
  {
    id: 'order_items',
    type: BlockType.TABLE,
    tableColumns: [
      { key: 'product_id', type: FieldType.RELATION, ... },
      { key: 'quantity', type: FieldType.NUMBER, ... },
      { key: 'unit_price', type: FieldType.PRICE, ... },
      { key: 'total', type: FieldType.PRICE, isCalculated: true }
    ]
  }
]
```

### مثال 2: Product → Supplier (با فیلتر)

```typescript
// فقط تامین‌کنندگان فعال:
{
  key: 'supplier_id',
  type: FieldType.RELATION,
  relationConfig: {
    targetModule: 'suppliers',
    targetField: 'business_name',
    filter: {
      status: 'active',
      rank: ['A', 'B']  // فقط رتبه A و B
    }
  }
}
```

### مثال 3: BOM با چند بخش

```typescript
blocks: [
  {
    id: 'items_leather',
    type: BlockType.TABLE,
    titles: { fa: 'بخش چرم' },
    tableColumns: [...]
  },
  {
    id: 'items_lining',
    type: BlockType.TABLE,
    titles: { fa: 'بخش آستر' },
    tableColumns: [...]
  },
  {
    id: 'items_labor',
    type: BlockType.TABLE,
    titles: { fa: 'دستمزدها' },
    tableColumns: [...]
  }
]
```

---

## 🔧 رفع مشکلات متداول

### مشکل 1: رابطه نمایش داده نمی‌شود

**علت:** `targetModule` اشتباه است یا ماژول در `moduleRegistry.ts` ثبت نشده.

**راه‌حل:**
```typescript
// بررسی کنید:
console.log(MODULES['suppliers']); // باید object باشد، نه undefined
```

### مشکل 2: گزینه‌های Select خالی است

**علت:** جدول مقصد داده ندارد یا query اشتباه است.

**راه‌حل:**
```typescript
// تست query در Supabase Dashboard:
SELECT id, business_name FROM suppliers;
```

### مشکل 3: Related Tabs نمایش داده نمی‌شود

**علت:** `relationField` اشتباه است یا کلید خارجی در دیتابیس نیست.

**راه‌حل:**
```sql
-- بررسی ستون:
SELECT supplier_id FROM products LIMIT 1;

-- اضافه کردن Foreign Key اگر نیست:
ALTER TABLE products
ADD CONSTRAINT fk_supplier
FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
```

### مشکل 4: محاسبات جدول کار نمی‌کند

**علت:** `isCalculated: true` تعریف نشده یا فرمول اشتباه است.

**راه‌حل:**
```typescript
// در BomStructureRenderer.tsx:
const total = (row.usage || 0) * (row.buy_price || 0);
```

### مشکل 5: Performance پایین در Related Tabs

**راه‌حل:**
- محدود کردن تعداد رکوردها با pagination
- اضافه کردن Index به کلیدهای خارجی
- استفاده از `select` با فیلدهای محدود

```sql
CREATE INDEX idx_products_supplier ON products(supplier_id);
```

---

## 📚 منابع اضافی

- **Database Schema:** `DATABASE_SCHEMA.md`
- **Architecture:** `ARCHITECTURE.md`
- **Type Definitions:** `types.ts` (Interface `RelationConfig`)

---

## ✅ Checklist پیاده‌سازی رابطه

- [ ] ساخت Foreign Key در دیتابیس
- [ ] تعریف `relationConfig` در config
- [ ] ثبت ماژول مقصد در `moduleRegistry.ts`
- [ ] تست در فرم (Select)
- [ ] تست در جدول (نمایش label)
- [ ] تست در صفحه تکی (Tag لینک‌دار)
- [ ] پیاده‌سازی `relatedTabs` برای نمای معکوس
- [ ] اضافه کردن Index برای بهینه‌سازی

---

**نگهداری توسط:** Farzad  
**همکار AI:** Claude (Anthropic)

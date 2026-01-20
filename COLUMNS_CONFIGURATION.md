# راهنمای تنظیم ستون‌های پیش‌فرض در جدول

## 📋 خلاصه سریع

ستون‌های جدول لیست بر اساس **2 ویژگی** در `modules/*.ts` تعریف می‌شوند:

| ویژگی | نقش | مثال |
|-------|-----|------|
| `isTableColumn: true` | نمایش فیلد در جدول | فیلد نام باید در جدول دیده شود |
| `order: number` | ترتیب ستون‌ها از چپ به راست | `order: 1` = اول، `order: 2` = دوم |

---

## 🔧 نحوه کار سیستم

### مسیر اجرا:

```
1. فایل moduleConfig (مثل productsConfig.ts)
   ↓ (ستون‌های marked with isTableColumn: true)
2. SmartTableRenderer.tsx
   ↓ (سرت‌ کن بر اساس order)
3. Ant Design Table
   ↓
4. نمایش در صفحه لیست
```

### کد مربوطه در [SmartTableRenderer.tsx](components/SmartTableRenderer.tsx#L85-L105):

```typescript
// ✅ فقط فیلدهایی که isTableColumn: true دارند نمایش داده می‌شوند
let tableFields = moduleConfig.fields
  .filter(f => f.isTableColumn)                    // ✅ فیلتر
  .sort((a, b) => (a.order || 0) - (b.order || 0)); // ✅ مرتب‌سازی
```

---

## 📝 مثال عملی: محصولات

### فایل: [productsConfig.ts](modules/productsConfig.ts)

```typescript
export const productsConfig: ModuleDefinition = {
  id: 'products',
  fields: [
    // ❌ این فیلدها در جدول نمایش داده نمی‌شوند
    { 
      key: 'image_url', 
      labels: { fa: 'تصویر', en: 'Image' }, 
      type: FieldType.IMAGE,
      // ⚠️ isTableColumn ندارد!
    },
    
    // ✅ این فیلدها در جدول نمایش داده می‌شوند
    { 
      key: 'name', 
      labels: { fa: 'نام محصول', en: 'Name' }, 
      type: FieldType.TEXT,
      order: 1,                    // ← ستون اول
      isTableColumn: true,         // ← نمایش در جدول
      isKey: true,                 // ← قابل کلیک (لینک)
    },
    { 
      key: 'system_code', 
      labels: { fa: 'کد سیستمی', en: 'Code' }, 
      type: FieldType.TEXT,
      order: 2,                    // ← ستون دوم
      isTableColumn: true,
      readonly: true,
    },
    { 
      key: 'sell_price', 
      labels: { fa: 'قیمت فروش', en: 'Sell Price' }, 
      type: FieldType.PRICE,
      order: 3,                    // ← ستون سوم
      isTableColumn: true,
    },
    { 
      key: 'stock', 
      labels: { fa: 'موجودی', en: 'Stock' }, 
      type: FieldType.STOCK,
      order: 4,                    // ← ستون چهارم
      isTableColumn: true,
    },
    { 
      key: 'status', 
      labels: { fa: 'وضعیت', en: 'Status' }, 
      type: FieldType.STATUS,
      order: 5,                    // ← ستون پنجم
      isTableColumn: true,
      options: [
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'پیش‌نویس', value: 'draft', color: 'orange' }
      ]
    },
    
    // ❌ این فیلد در جدول نمایش داده نمی‌شود (در form نمایش داده می‌شود)
    { 
      key: 'leather_color_1', 
      labels: { fa: 'رنگ چرم ۱', en: 'Color 1' }, 
      type: FieldType.SELECT,
      blockId: 'leatherSpec',
      // ⚠️ isTableColumn: false (یا حذف شده)
    },
  ]
};
```

**نتیجه در صفحه لیست:**
```
[order:1]    [order:2]      [order:3]      [order:4]    [order:5]
نام محصول  | کد سیستمی  | قیمت فروش  | موجودی  | وضعیت
-----------+-----------+-----------+-------+---------
چرم سیاه   | PRD-001   | 50,000    | 10    | فعال
چرم قهوه‌ای | PRD-002   | 60,000    | 5     | فعال
```

---

## 📋 مثال عملی: مشتریان

### فایل: [customerConfig.ts](modules/customerConfig.ts)

```typescript
export const customerModule: ModuleDefinition = {
  id: 'customers',
  fields: [
    { 
      key: 'image_url', 
      labels: { fa: 'تصویر', en: 'Image' }, 
      type: FieldType.IMAGE,
      // ❌ بدون isTableColumn = نمایش نمی‌شود در جدول
    },
    
    { 
      key: 'first_name', 
      labels: { fa: 'نام', en: 'First Name' }, 
      type: FieldType.TEXT,
      order: 1,
      isTableColumn: true,  // ✅
    },
    
    { 
      key: 'last_name', 
      labels: { fa: 'نام خانوادگی', en: 'Last Name' }, 
      type: FieldType.TEXT,
      order: 2,
      isTableColumn: true,  // ✅
      isKey: true,          // ✅ لینک به جزئیات
    },
    
    { 
      key: 'system_code', 
      labels: { fa: 'کد اشتراک', en: 'Code' }, 
      type: FieldType.TEXT,
      order: 3,
      isTableColumn: true,  // ✅
    },
    
    { 
      key: 'rank', 
      labels: { fa: 'سطح مشتری', en: 'Rank' }, 
      type: FieldType.STATUS,
      order: 4,
      isTableColumn: true,  // ✅
      options: [
        { label: 'عادی', value: 'normal', color: 'blue' },
        { label: 'نقره‌ای', value: 'silver', color: 'gray' },
        { label: 'طلایی', value: 'gold', color: 'gold' },
        { label: 'VIP', value: 'vip', color: 'purple' }
      ]
    },
    
    { 
      key: 'mobile_1', 
      labels: { fa: 'موبایل اصلی', en: 'Mobile' }, 
      type: FieldType.PHONE,
      order: 5,
      isTableColumn: true,  // ✅
    },
    
    // ❌ این فیلد در جدول نمایش داده نمی‌شود (فقط در form)
    { 
      key: 'prefix', 
      labels: { fa: 'پیشوند', en: 'Prefix' }, 
      type: FieldType.SELECT,
      blockId: 'basic_info',
      // ⚠️ بدون isTableColumn
      options: [
        { label: 'آقای', value: 'mr' },
        { label: 'خانم', value: 'ms' },
      ]
    },
    
    // ❌ این فیلد در جدول نمایش داده نمی‌شود (فقط در form)
    { 
      key: 'business_name', 
      labels: { fa: 'نام کسب و کار', en: 'Business' }, 
      type: FieldType.TEXT,
      blockId: 'basic_info',
      // ⚠️ بدون isTableColumn
    },
  ]
};
```

---

## ✅ چک‌لیست: ستون‌های پیش‌فرض

برای افزودن/حذف ستون، تنها **3 گام**:

### گام 1️⃣: فیلدی را انتخاب کنید

```typescript
{ 
  key: 'sell_price',
  labels: { fa: 'قیمت فروش', en: 'Sell Price' },
  type: FieldType.PRICE,
  // ... سایر ویژگی‌ها ...
}
```

### گام 2️⃣: `isTableColumn: true` اضافه کنید

```typescript
{ 
  key: 'sell_price',
  labels: { fa: 'قیمت فروش', en: 'Sell Price' },
  type: FieldType.PRICE,
  isTableColumn: true,  // ✅ این خط
  // ... سایر ویژگی‌ها ...
}
```

### گام 3️⃣: `order` تعریف کنید

```typescript
{ 
  key: 'sell_price',
  labels: { fa: 'قیمت فروش', en: 'Sell Price' },
  type: FieldType.PRICE,
  order: 3,            // ✅ ستون سوم از چپ
  isTableColumn: true,
  // ... سایر ویژگی‌ها ...
}
```

---

## 🔄 تغییر ترتیب ستون‌ها

فقط `order` را تغییر دهید:

### قبل:
```typescript
{ key: 'name', order: 1, isTableColumn: true },
{ key: 'code', order: 2, isTableColumn: true },
{ key: 'price', order: 3, isTableColumn: true },
```

### بعد (نام را آخر کنید):
```typescript
{ key: 'code', order: 1, isTableColumn: true },      // ← تغییر شد
{ key: 'price', order: 2, isTableColumn: true },     // ← تغییر شد
{ key: 'name', order: 3, isTableColumn: true },      // ← تغییر شد
```

---

## 🔍 حذف ستون از جدول

برای حذف ستون **بدون حذف فیلد** (فیلد در form باقی می‌ماند):

### روش 1: حذف `isTableColumn`
```typescript
// قبل
{ key: 'leather_color', isTableColumn: true, order: 5 }

// بعد
{ key: 'leather_color' }  // ✅ حذف شد از جدول
```

### روش 2: تغییر به `false`
```typescript
{ key: 'leather_color', isTableColumn: false, order: 5 }
```

---

## 📍 فیلدهای پیش‌فرض جدول (Fallback)

اگر **هیچ فیلدی** `isTableColumn: true` نداشته باشد، سیستم خودکار این فیلدها رو استفاده می‌کند:

```typescript
['name', 'title', 'business_name', 'system_code', 'sell_price', 
 'stock_quantity', 'status', 'mobile_1', 'rank']
```

---

## 🎯 نکات مهم

### 1️⃣ `order` باید **منحصر‌بفرد** نباشد
```typescript
// ❌ اشتباه: دو فیلد با order: 1
{ key: 'name', order: 1, isTableColumn: true },
{ key: 'code', order: 1, isTableColumn: true },  // ⚠️ مشکل!

// ✅ درست:
{ key: 'name', order: 1, isTableColumn: true },
{ key: 'code', order: 2, isTableColumn: true },
```

### 2️⃣ `isKey: true` = لینک‌دار (برای کلیک و رفتن به جزئیات)
```typescript
{ key: 'name', isTableColumn: true, isKey: true }  // ✅ قابل کلیک
{ key: 'price', isTableColumn: true, isKey: false } // ❌ غیرقابل کلیک
```

### 3️⃣ `order` شروع از **۱** یا **۰** می‌تواند باشد
```typescript
// هر دو درست است:
{ order: 0 }, { order: 1 }, { order: 2 }   // یا
{ order: 1 }, { order: 2 }, { order: 3 }
```

---

## 🧪 تست کردن تغییرات

بعد از تغییر `modules/*.ts`:

1. **فایل را ذخیره** کنید
2. **صفحه لیست** را `Ctrl+R` یا `Cmd+R` رفرش کنید
3. **ستون‌های جدول** را چک کنید

---

## 📚 فایل‌های مرتبط

| فایل | نقش |
|------|-----|
| [modules/productsConfig.ts](modules/productsConfig.ts) | تنظیمات محصولات |
| [modules/customerConfig.ts](modules/customerConfig.ts) | تنظیمات مشتریان |
| [modules/supplierConfig.ts](modules/supplierConfig.ts) | تنظیمات تأمین‌کنندگان |
| [modules/productionConfig.ts](modules/productionConfig.ts) | تنظیمات تولید |
| [components/SmartTableRenderer.tsx](components/SmartTableRenderer.tsx#L85-L105) | کد رندر جدول |

---

## 🎓 مثال کامل: افزودن ستون جدید

### قبل:
```typescript
{ 
  key: 'name', 
  labels: { fa: 'نام محصول', en: 'Name' }, 
  type: FieldType.TEXT,
  order: 1,
  isTableColumn: true 
},
{ 
  key: 'sell_price', 
  labels: { fa: 'قیمت فروش', en: 'Sell Price' }, 
  type: FieldType.PRICE,
  order: 2,
  isTableColumn: true 
},
```

### بعد (اضافه کردن ستون `status`):
```typescript
{ 
  key: 'name', 
  labels: { fa: 'نام محصول', en: 'Name' }, 
  type: FieldType.TEXT,
  order: 1,
  isTableColumn: true 
},
{ 
  key: 'sell_price', 
  labels: { fa: 'قیمت فروش', en: 'Sell Price' }, 
  type: FieldType.PRICE,
  order: 2,
  isTableColumn: true 
},
{ 
  key: 'status',                                    // ← جدید
  labels: { fa: 'وضعیت', en: 'Status' },         // ← جدید
  type: FieldType.STATUS,                         // ← جدید
  order: 3,                                       // ← جدید
  isTableColumn: true,                            // ← جدید
  options: [
    { label: 'فعال', value: 'active', color: 'green' },
    { label: 'غیرفعال', value: 'inactive', color: 'red' }
  ]
},
```

---

## ❓ سؤالات رایج

### سؤال 1: فیلد اضافه کردم اما در جدول نمایش نمی‌شود؟
**پاسخ:** `isTableColumn: true` اضافه کنید و `order` تعریف کنید.

### سؤال 2: می‌خواهم ستون‌ها رو جابه‌جا کنم؟
**پاسخ:** فقط `order` را تغییر دهید.

### سؤال 3: می‌خواهم فیلدی در form باشد ولی در جدول نه؟
**پاسخ:** `isTableColumn: false` یا حذف کنید.

### سؤال 4: چرا بعضی ستون‌ها خودکار ایجاد می‌شوند؟
**پاسخ:** Fallback مکانیزم است. اگر هیچ `isTableColumn: true` نداشته باشند، فیلدهای خاص خودکار شامل می‌شوند.

---

**آخرین به‌روزرسانی:** ۷ ژانویه ۲۰۲۶

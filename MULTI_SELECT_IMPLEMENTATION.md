# 📋 MULTI_SELECT Field Implementation Guide

## خلاصه

تیم به درستی **MULTI_SELECT** field type را در تمام کامپوننت‌های پروژه پیاده‌سازی کرد.

**تاریخ:** 2024
**وضعیت:** ✅ تکمیل‌شده و تست‌شده

---

## 🎯 چه چیزی تغییر کرد؟

### 1. **productsConfig.ts**
MULTI_SELECT field نمونه اضافه شد:
```typescript
{ 
  key: 'leather_colors', 
  labels: { fa: 'رنگ های چرم (چند انتخابی)', en: 'Leather Colors' }, 
  type: FieldType.MULTI_SELECT,  // ← نوع فیلد
  location: FieldLocation.BLOCK, 
  blockId: 'leatherSpec', 
  order: 2.5, 
  dynamicOptionsCategory: 'leather_color'  // ← لینک به dynamic_options table
}
```

### 2. **SmartFieldRenderer.tsx**
اضافه شد: منطق نمایش و ویرایش MULTI_SELECT فیلدها
```typescript
case FieldType.MULTI_SELECT:
  // نمایش dropdown چند انتخابی
  return (
    <Select
      mode="multiple"
      value={Array.isArray(value) ? value : (value ? [value] : [])}
      onChange={onChange}
      options={fieldOptions}
      placeholder="انتخاب کنید"
      allowClear
      optionFilterProp="label"
      getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
    />
  );
```

### 3. **SmartTableRenderer.tsx**
اضافه شد: 
- نمایش MULTI_SELECT به‌صورت تگ‌های رنگی
- فیلتر کردن جداول برای MULTI_SELECT فیلدها

```typescript
if (field.type === FieldType.MULTI_SELECT) {
    if (!Array.isArray(value) || value.length === 0) return '-';
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((val: any, idx: number) => {
          const opt = field.options?.find(o => o.value === val);
          return (
            <Tag key={idx} color="cyan" style={{fontSize: '9px', marginRight: 0}}>
              {opt?.label || val}
            </Tag>
          );
        })}
      </div>
    );
}
```

### 4. **SmartForm.tsx**
اضافه شد: منطق ذخیره‌سازی صحیح برای مقادیر MULTI_SELECT (آرایه)
```typescript
// اگر فیلد MULTI_SELECT است و آرایه است، آرایه را نگه‌دار
if (field?.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
    if (value.length > 0) {
      acc[key] = value;
    }
}
```

### 5. **ModuleShow.tsx**
اضافه شد: منطق نمایش MULTI_SELECT مقادیر به‌صورت comma-separated
```typescript
const getOptionLabel = (field: any, value: any) => {
    // اگر MULTI_SELECT است و آرایه است
    if (field.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
        return value.map(v => {
            // ... لیبل پیدا کن
        }).join(', ');
    }
    // ...
}
```

### 6. **DynamicSelectField.tsx**
اپدیت شد: 
- Support برای `mode="multiple"`
- مقادیر MULTI_SELECT را درست مدیریت کند
```typescript
interface DynamicSelectFieldProps {
  value?: string | string[];  // ← تک یا چند مقدار
  onChange?: (value: string | string[]) => void;
  mode?: 'multiple' | 'tags';  // ← حالت جدید
  // ...
}
```

---

## 🔄 نحوه کارکرد

### فلوی کامل MULTI_SELECT:

```
User opens product
    ↓
FormField renders (SmartFieldRenderer)
    ↓
Shows dropdown with mode="multiple"
    ↓
User selects multiple options
    ↓
Value stored as Array: ['value1', 'value2', 'value3']
    ↓
Form saves to database
    ↓
SmartForm converts: MULTI_SELECT → array (نگه‌دار)
    ↓
Database stores: Array in JSONB column
    ↓
Table displays: ['value1', 'value2', 'value3'] → cyan tags
    ↓
ModuleShow displays: 'label1, label2, label3' → comma-separated
```

---

## 📊 مثال استفاده در Database

### Products Table:
```sql
-- MULTI_SELECT field نیاز به JSONB یا TEXT[] دارد
ALTER TABLE products ADD COLUMN leather_colors TEXT[];
```

### Dynamic Options:
```sql
-- گزینه‌های موجود
INSERT INTO dynamic_options (category, label, value)
VALUES 
  ('leather_color', 'Black', 'black'),
  ('leather_color', 'Brown', 'brown'),
  ('leather_color', 'Red', 'red'),
  ('leather_color', 'Blue', 'blue');
```

### Product Record:
```json
{
  "id": "prod-123",
  "name": "Premium Leather",
  "leather_colors": ["black", "brown", "red"]  // ← آرایه مقادیر
}
```

---

## 🎨 نمایش در واسط‌های مختلف

### SmartForm (ویرایش):
```
┌─────────────────────────────┐
│ رنگ های چرم (چند انتخابی)     │
├─────────────────────────────┤
│ ☑ Black   ☑ Brown ☐ Red    │
│ ☑ Blue    ☐ Green          │
│                             │
│ فیلتر...                     │
└─────────────────────────────┘
```

### ModuleList/ModuleShow (نمایش):
```
┌──────────────────────────┐
│ رنگ های چرم               │
├──────────────────────────┤
│ [Black] [Brown] [Red]    │  ← تگ های رنگی
└──────────────────────────┘
```

### ModuleShow Display:
```
رنگ های چرم: Black, Brown, Red  ← کاما جدا‌شده
```

---

## ✅ تست‌شده در:

- ✅ **SmartFieldRenderer** - ویرایش و نمایش
- ✅ **SmartForm** - ذخیره‌سازی آرایه
- ✅ **SmartTableRenderer** - نمایش تگ‌ها
- ✅ **ModuleShow** - نمایش comma-separated
- ✅ **DynamicSelectField** - afzayesh گزینه جدید
- ✅ **ProductsConfig** - تعریف فیلد

---

## 🧪 نحوه تست کردن

### 1. افزودن MULTI_SELECT field به form:
```
Products → Edit → leatherSpec block
→ رنگ های چرم (چند انتخابی) ← MULTI_SELECT
```

### 2. انتخاب چند مقدار:
```
☑ Black
☑ Brown
☑ Red
```

### 3. ذخیره:
```
باید در database به‌صورت آرایه ذخیره شود:
["black", "brown", "red"]
```

### 4. بازدید جدول:
```
ModuleList → products table
رنگ های چرم: [Black] [Brown] [Red]  ← تگ‌ها
```

### 5. بازدید detail:
```
ModuleShow → product detail
رنگ های چرم: Black, Brown, Red  ← comma-separated
```

---

## 🔧 اضافه کردن MULTI_SELECT field جدید

### مرحله ۱: تعریف در productsConfig
```typescript
{
  key: 'my_multi_field',
  labels: { fa: 'نام من (چند انتخابی)', en: 'My Multi Field' },
  type: FieldType.MULTI_SELECT,  // ← این خط مهم است
  location: FieldLocation.BLOCK,
  blockId: 'blockName',
  dynamicOptionsCategory: 'my_category'  // ← دسته‌بندی
}
```

### مرحله ۲: اضافه کردن ستون به جدول
```sql
ALTER TABLE products ADD COLUMN my_multi_field TEXT[];
```

### مرحله ۳: اضافه کردن گزینه‌ها به dynamic_options
```sql
INSERT INTO dynamic_options (category, label, value)
VALUES ('my_category', 'Option 1', 'option_1'),
       ('my_category', 'Option 2', 'option_2');
```

### مرحله ۴: استفاده
- SmartForm خودکار dropdown چند انتخابی ایجاد می‌کند
- SmartTableRenderer خودکار تگ‌ها نمایش می‌دهد
- ModuleShow خودکار comma-separated نمایش می‌دهد

---

## 📋 چیست‌لیست

- [x] MULTI_SELECT enum در types.ts
- [x] SmartFieldRenderer support
- [x] SmartForm support
- [x] SmartTableRenderer support (نمایش + فیلتر)
- [x] ModuleShow support
- [x] DynamicSelectField support
- [x] productsConfig example
- [x] تست TypeScript
- [x] تست نمایش
- [x] تست ذخیره‌سازی

---

## 🎁 ویژگی‌های اضافی

### 1. **Tags Display**:
MULTI_SELECT مقادیر به‌صورت تگ‌های رنگی نمایش داده می‌شوند

### 2. **Filtering**:
جداول می‌توانند براساس MULTI_SELECT مقادیر فیلتر شوند

### 3. **Dynamic Options**:
کاربران می‌توانند گزینه‌های جدید اضافه کنند

### 4. **Array Storage**:
مقادیر دقیق‌تر به‌صورت آرایه ذخیره می‌شوند

---

## 📚 Reference

### Ant Design Select Modes:
```typescript
mode?: 'multiple' | 'tags'
```

- **multiple**: چند انتخاب استاندارد
- **tags**: افزودن مقادیر سفارشی

### Data Structure:
```typescript
// تک انتخاب (SELECT)
value: 'black'

// چند انتخاب (MULTI_SELECT)
value: ['black', 'brown', 'red']
```

---

**نسخه:** 1.0
**وضعیت:** ✅ تولید‌شده
**تاریخ:** 2024

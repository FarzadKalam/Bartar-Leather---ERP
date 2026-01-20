# 🧪 MULTI_SELECT Field Testing Guide

## تست کامل MULTI_SELECT Fields

### مرحله ۱: تأیید Field Definition
```
✅ productsConfig.ts → leather_colors field
   - type: FieldType.MULTI_SELECT
   - dynamicOptionsCategory: 'leather_color'
   - blockId: 'leatherSpec'
```

### مرحله ۲: تست SmartForm (ویرایش)

#### سناریو ۱: ایجاد محصول جدید
```
1. Projects → Products → New Product
2. Form loads
3. پیدا کنید: "رنگ های چرم (چند انتخابی)"
4. باید dropdown با mode="multiple" باشد
5. انتخاب کنید: Black, Brown, Red
6. Save کنید
```

**نتیجه مورد انتظار:**
```
✅ Form accepts multiple selections
✅ Value saved as ["black", "brown", "red"]
✅ No errors in console
```

#### سناریو ۲: ویرایش محصول موجود
```
1. Projects → Products → Select existing
2. Edit → leather_colors field
3. انتخاب موجود نمایش داده شود: [Black] [Brown] [Red]
4. حذف یک مقدار (مثل Red)
5. اضافه کنید گزینه جدید (مثل Blue)
6. Save کنید
```

**نتیجه مورد انتظار:**
```
✅ Selected values show with X to remove
✅ Dropdown shows available options
✅ Changes saved: ["black", "brown", "blue"]
```

---

### مرحله ۳: تست SmartTableRenderer (جدول)

#### سناریو ۳: نمایش در جدول
```
1. Projects → Products → List View
2. جستجو برای leather_colors ستون
3. باید رنگی تگ‌ها نمایش دهد
```

**نتیجه مورد انتظار:**
```
┌──────────────────────────┐
│ leather_colors           │
├──────────────────────────┤
│ [Black] [Brown] [Red]    │ ← cyan tags
│ [Blue]                   │ ← single tag
│ -                        │ ← empty
└──────────────────────────┘
```

#### سناریو ۴: فیلتر کردن جدول
```
1. جدول Products باز کنید
2. leather_colors ستون را فیلتر کنید
3. "Black" را انتخاب کنید
4. باید تمام محصولات شامل Black نمایش دهد
```

**نتیجه مورد انتظار:**
```
✅ Shows only products with "black" in leather_colors
✅ Filter logic: array.includes(value) → true
✅ Other colors filtered out
```

---

### مرحله ۴: تست ModuleShow (جزئیات)

#### سناریو ۵: نمایش در صفحه جزئیات
```
1. Products → Select a product
2. جستجو برای "رنگ های چرم"
3. باید comma-separated نمایش دهد
```

**نتیجه مورد انتظار:**
```
رنگ های چرم: Black, Brown, Red
```

**نه:**
```
rنگ های چرم: ["black", "brown", "red"]  ❌ (raw values)
رنگ های چرم: black, brown, red        ❌ (lowercase)
```

---

### مرحله ۵: تست Database

#### سناریو ۶: بررسی Database Storage
```sql
-- تصدیق بشود که leather_colors ستون TEXT[] است
\d products
```

**نتیجه مورد انتظار:**
```
 leather_colors | text[]
```

#### سناریو ۷: بررسی مقادیر
```sql
SELECT id, name, leather_colors FROM products LIMIT 5;
```

**نتیجه مورد انتظار:**
```
 id   | name              | leather_colors
------|-------------------|---------------------------
 p1   | Premium Leather   | {black,brown,red}
 p2   | Standard Leather  | {blue}
 p3   | Budget Leather    | NULL
```

---

### مرحله ۶: تست Dynamic Options

#### سناریو ۸: اضافه کردن گزینه جدید
```
1. SmartForm → leather_colors field
2. درپایین dropdown، باید "Add new option" باشد
3. تایپ کنید: "White"
4. Enter زنید
5. Form reload شود
6. White option دریافت شود
```

**نتیجه مورد انتظار:**
```
✅ New option added to dynamic_options table
✅ Can be selected in form
✅ Shows in dropdown
✅ Persists in database
```

---

## 🔍 Debugging Checklist

### اگر MULTI_SELECT کار نکند:

#### ✓ Check ۱: Field Type
```typescript
// productsConfig.ts میں چک کنید:
{ type: FieldType.MULTI_SELECT }  // درست
{ type: 'MULTI_SELECT' }          // غلط
```

#### ✓ Check ۲: SmartFieldRenderer
```typescript
// باید اینجا MULTI_SELECT case باشد:
case FieldType.MULTI_SELECT:
  // render logic
```

#### ✓ Check ۳: SmartForm Value Handling
```typescript
// MULTI_SELECT باید array نگه‌دار کند:
if (field?.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
  // اینجا باید array pass شود، نه string
}
```

#### ✓ Check ۴: Database Column
```sql
-- Column باید TEXT[] یا JSONB باشد:
ALTER TABLE products ADD COLUMN leather_colors TEXT[];
-- نه:
ALTER TABLE products ADD COLUMN leather_colors VARCHAR;
```

#### ✓ Check ۵: DynamicSelectField Mode
```typescript
// اگر dynamic field باشد:
<DynamicSelectField mode="multiple" />  // ✓
<DynamicSelectField />                  // ✗
```

---

## 📊 Console Checks

### چه چیزهایی باید در console ببینید:

#### SmartForm submission:
```javascript
// حاضر کنید:
{
  leather_colors: ["black", "brown", "red"]  // ✓ array
}

// نه:
{
  leather_colors: "black,brown,red"  // ✗ string
  leather_colors: "brown"            // ✗ single value
}
```

#### SmartTableRenderer filter:
```javascript
// BaseQuery میں:
filters.push({
  field: 'leather_colors',
  condition: 'includes',  // ✓ نه equals
  value: 'black'
})
```

#### Ant Select value:
```javascript
// Value should be array:
<Select value={["black", "brown"]} />  // ✓
<Select value={"black"} />             // ✗
```

---

## ✅ Complete Test Checklist

### SmartForm Tests
- [ ] Multiple values selectable
- [ ] Values displayed as tags while selecting
- [ ] Remove (X) button works
- [ ] Add new option works
- [ ] Save preserves array
- [ ] Edit shows selected values
- [ ] Empty field shows as empty

### SmartTableRenderer Tests
- [ ] MULTI_SELECT column displays as tags
- [ ] Each value is cyan tag
- [ ] Empty values show "-"
- [ ] Filter dropdown shows options
- [ ] Filter works with array.includes()
- [ ] Multiple filter values work
- [ ] Filter clears correctly

### ModuleShow Tests
- [ ] Values displayed comma-separated
- [ ] Shows labels not values
- [ ] Format: "Label1, Label2, Label3"
- [ ] Empty shows as "-"
- [ ] All values displayed

### DynamicSelectField Tests
- [ ] mode="multiple" works
- [ ] Can add new options
- [ ] Options persist
- [ ] Array values handled
- [ ] Delete option works

### Database Tests
- [ ] Column is TEXT[]
- [ ] Values stored as array
- [ ] Can query with ANY operator
- [ ] NULL values handled
- [ ] Backup/restore works

---

## 🐛 Common Issues & Solutions

### Issue ۱: Select shows single value only
```
Problem: Form shows ["black"] but can't add more
Cause: mode="multiple" نیست

Solution: Check SmartFieldRenderer case MULTI_SELECT
{ <Select mode="multiple" ... /> }
```

### Issue ۲: Values saved as string
```
Problem: Database shows "black,brown,red" instead of {black,brown,red}
Cause: SmartForm converting array to string

Solution: Check SmartForm value cleaning:
if (field?.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
  acc[key] = value;  // Keep array!
}
```

### Issue ۳: Filter not working
```
Problem: Filter returns no results or all results
Cause: Using === instead of includes()

Solution: Check SmartTableRenderer filter logic:
if (field.type === FieldType.MULTI_SELECT) {
  return Array.isArray(recordValue) && recordValue.includes(filterValue);
}
```

### Issue ۴: Display shows raw values
```
Problem: Shows {black,brown,red} not "Black, Brown, Red"
Cause: Missing label mapping

Solution: Check ModuleShow getOptionLabel:
const labels = value.map(v => findLabel(v));
return labels.join(', ');
```

---

## 📝 Notes

### مهم نکات:
1. **Type**: MULTI_SELECT enum باید استفاده شود، string نه
2. **Value**: همیشه array است [`value1`, `value2`], نه string
3. **Display**: labels نمایش داده شوند، values نه
4. **Filter**: array.includes() استفاده شود، === نه
5. **Dynamic**: options از database لود شوند
6. **Database**: ستون TEXT[] یا JSONB باشد

### Performance Tips:
- استفاده کنید `useMemo` برای label mapping
- Cache کنید dynamic options
- Lazy load کنید large lists
- Virtualize کنید long dropdowns

---

**Version:** 1.0
**Created:** 2024
**Status:** Ready for Testing

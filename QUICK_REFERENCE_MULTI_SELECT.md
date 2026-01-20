# ⚡ MULTI_SELECT Quick Reference

## 🎯 اگر می‌خواهید MULTI_SELECT فیلڈ اضافه کنید

### مرحلہ 1: Config فایل میں تعریف کریں
```typescript
// modules/productsConfig.ts (یا دوسری ماڈول)
{
  key: 'your_field_name',
  labels: { 
    fa: 'نام فیلڈ (چند انتخابی)', 
    en: 'Field Name' 
  },
  type: FieldType.MULTI_SELECT,              // ← یہ خط ضروری ہے!
  location: FieldLocation.BLOCK,
  blockId: 'someBlockId',
  dynamicOptionsCategory: 'category_name'    // ← گزینے کا ڈیٹا بیس سے
}
```

### مرحلہ 2: Database میں ستون شامل کریں
```sql
ALTER TABLE table_name ADD COLUMN your_field_name TEXT[];
```

### مرحلہ 3: Dynamic Options شامل کریں
```sql
INSERT INTO dynamic_options (category, label, value)
VALUES 
  ('category_name', 'Label 1', 'value_1'),
  ('category_name', 'Label 2', 'value_2');
```

### مرحلہ 4: ختم! 🎉
SmartForm، SmartTableRenderer، اور ModuleShow خودکار کام کریں گے۔

---

## 📚 Key Rules

### ✅ صحیح تریقے:
```typescript
// Value ہمیشہ array ہے
value: ['black', 'brown']

// Display ہمیشہ label ہے
display: "Black, Brown"

// Filter ہمیشہ includes ہے
filter: array.includes(value)

// Type ہمیشہ MULTI_SELECT ہے
type: FieldType.MULTI_SELECT
```

### ❌ غلط تریقے:
```typescript
value: "black,brown"           // ✗ string نہیں
display: "black, brown"        // ✗ value نہیں
filter: recordValue === value  // ✗ includes نہیں
type: 'MULTI_SELECT'          // ✗ string نہیں، enum ہونا چاہیے
```

---

## 🔧 Components کا کردار

| Component | کیا کرتا ہے | موضع |
|-----------|-----------|--------|
| **SmartFieldRenderer** | Dropdown بناتا ہے `mode="multiple"` | src/components/SmartFieldRenderer.tsx |
| **SmartForm** | Arrays کو محفوظ رکھتا ہے | src/components/SmartForm.tsx |
| **SmartTableRenderer** | Tags نمائیں، filters کریں | src/components/SmartTableRenderer.tsx |
| **ModuleShow** | Comma-separated نمائیں | src/pages/ModuleShow.tsx |
| **DynamicSelectField** | Dynamic options سے select | src/components/DynamicSelectField.tsx |
| **Config Files** | Field definitions | src/modules/*.ts |

---

## 🧪 ٹیسٹ کرنے کے لیے

```
1. Form میں کھولیں   → متعدد منتخب کر سکتے ہیں ✅
2. Save دبائیں      → Array محفوظ ہے ✅
3. جدول میں دیکھیں   → Cyan tags ✅
4. Detail میں دیکھیں → Comma-separated ✅
5. Filter کریں      → Array.includes() ✅
```

---

## 💡 عام مسائل

### مسئلہ: صرف ایک انتخاب کار
```
حل: SmartFieldRenderer میں mode="multiple" چیک کریں
```

### مسئلہ: Database میں string
```
حل: SmartForm میں MULTI_SELECT array چیک کریں
```

### مسئلہ: Filter نہیں کام کر رہا
```
حل: SmartTableRenderer میں array.includes() چیک کریں
```

### مسئلہ: Raw values دیکھ رہے ہیں
```
حل: ModuleShow میں getOptionLabel چیک کریں
```

---

## 🎯 1-دقیقے کی مثال

### موجودہ MULTI_SELECT field:
```
products → leather_colors
- Type: MULTI_SELECT
- Options: Black, Brown, Red, Blue...
- Store: ['black', 'brown', 'red']
- Display: "Black, Brown, Red"
```

### استعمال:
```
Form: انتخاب کریں [Black] [Brown] [Red]
↓
Save: ['black', 'brown', 'red']
↓
List: [Black] [Brown] [Red]
↓
Detail: Black, Brown, Red
```

---

## 📋 Checklist (نیا MULTI_SELECT)

- [ ] Config میں `type: FieldType.MULTI_SELECT`
- [ ] Database میں `TEXT[]` column
- [ ] dynamic_options میں entries
- [ ] Form test میں متعدد منتخاب
- [ ] Save test میں array
- [ ] List test میں tags
- [ ] Detail test میں comma-separated
- [ ] Filter test میں کام کریں

---

## 🚀 Ready to Use

تمام components تیار ہیں۔ بس:

1. **Define** - Config میں فیلڈ شامل کریں
2. **Database** - Column شامل کریں
3. **Options** - dynamic_options میں entries
4. **Done!** - سب کچھ خودکار کام کرے

---

## 📞 Reference Files

| فائل | لائن | مقصد |
|------|-----|------|
| types.ts | ~50 | MULTI_SELECT enum |
| SmartFieldRenderer.tsx | ~180 | Rendering logic |
| SmartForm.tsx | ~200 | Value handling |
| SmartTableRenderer.tsx | ~150, ~200 | Display & filter |
| ModuleShow.tsx | ~300 | Label display |
| DynamicSelectField.tsx | ~30, ~100 | Dynamic mode |
| productsConfig.ts | ~90 | Example field |

---

**Version:** 1.0 - Quick Reference
**Status:** Ready
**Last Updated:** 2024

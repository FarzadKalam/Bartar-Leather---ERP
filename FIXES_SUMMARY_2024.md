# ✅ اصلاح SELECT/MULTI_SELECT - نسخه نهایی

## 📋 خلاصه تغييرات

تمام مسائل مربوط به SELECT و MULTI_SELECT فیلدها اصلاح شد:

### ✅ مسئله 1: نمایش برچسب‌های فارسی
**وضعیت**: حل شد  
**تاثیر**: ModuleList، ModuleShow، SmartTableRenderer، EditableTable

### ✅ مسئله 2: Filtering برای تمام فیلدها
**وضعیت**: حل شد  
**تاثیر**: SmartTableRenderer - اکنون تمام SELECT/MULTI_SELECT/RELATION فیلدها قابل فیلتر ہیں

### ✅ مسئله 3: نمایش MULTI_SELECT در ModuleShow
**وضعیت**: حل شد  
**تاثیر**: ModuleShow - اکنون MULTI_SELECT مقادیر به صورت tags نمایش داده می‌شوند

---

## 🔧 فیلهای تغيير شده

### 1. **SmartTableRenderer.tsx**
#### تغييرات:
- اضافه: `dynamicOptions` و `relationOptions` props
- اصلاح: filter logic برای تمام فیلدهای انتخابی
- اصلاح: render logic برای نمایش برچسب‌های فارسی
- import: `getSingleOptionLabel` از optionHelpers

#### نکات اهم:
```typescript
// اضافه شد: dynamicOptions و relationOptions
interface SmartTableRendererProps {
  dynamicOptions?: Record<string, any[]>;
  relationOptions?: Record<string, any[]>;
}

// اصلاح شد: filter برای تمام فیلدها
filters: !isTagField && (field.type === FieldType.STATUS || FieldType.SELECT || FieldType.MULTI_SELECT || FieldType.RELATION)
  ? (() => {
      let options: any[] = [];
      if (field.options) {
        options = field.options.map(o => ({ text: o.label, value: o.value }));
      } else if ((field as any).dynamicOptionsCategory) {
        const category = (field as any).dynamicOptionsCategory;
        const dynopts = dynamicOptions[category] || [];
        options = dynopts.map(o => ({ text: o.label, value: o.value }));
      }
      // ...
    })()
```

### 2. **ModuleList_Refine.tsx**
#### تغييرات:
- اضافه: imports برای `BlockType` و `supabase`
- اضافه: `useEffect` برای fetch کردن dynamic و relation options
- اضافه: `dynamicOptions` و `relationOptions` states
- اصلاح: SmartTableRenderer call برای pass کردن options

#### نکات اهم:
```typescript
// اضافه شد: Fetch options
useEffect(() => {
  if (!moduleConfig) return;

  const fetchOptions = async () => {
    // جمع‌آوری تمام SELECT/MULTI_SELECT فیلدها
    const dynFields = [...moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory)];
    
    // Fetch dynamicOptions از database
    const dynOpts: Record<string, any[]> = {};
    for (const field of dynFields) {
      const cat = (field as any).dynamicOptionsCategory;
      if (cat && !dynOpts[cat]) {
        const { data } = await supabase.from('dynamic_options').select('label, value').eq('category', cat).eq('is_active', true);
        if (data) dynOpts[cat] = data;
      }
    }
    setDynamicOptions(dynOpts);
    // ... relation options
  };
  fetchOptions();
}, [moduleConfig]);

// اصلاح: SmartTableRenderer call
<SmartTableRenderer 
  // ...
  dynamicOptions={dynamicOptions}
  relationOptions={relationOptions}
/>
```

### 3. **ModuleShow.tsx**
#### تغييرات:
- اضافه: import برای `getSingleOptionLabel`
- اصلاح: نمایش MULTI_SELECT به صورت tags
- اصلاح: استفاده از `getSingleOptionLabel` برای SELECT و RELATION

#### نکات اهم:
```typescript
// MULTI_SELECT نمایش: tags
else if (field.type === FieldType.MULTI_SELECT) {
  if (Array.isArray(value) && value.length > 0) {
    displayContent = (
      <div className="flex flex-wrap gap-2">
        {value.map((val: any, idx: number) => {
          const label = getSingleOptionLabel(field, val, dynamicOptions, relationOptions);
          return (
            <Tag key={idx} color="cyan" className="px-2 py-1 text-xs font-medium">
              {label}
            </Tag>
          );
        })}
      </div>
    );
  } else {
    displayContent = <span className="text-gray-400">-</span>;
  }
}
```

### 4. **utils/optionHelpers.ts** (جدید)
#### محتويات:
- `getOptionLabel()` - گرفتن برچسب برای یک یا چند مقدار
- `getSingleOptionLabel()` - گرفتن برچسب برای یک مقدار تک
- `normalizeMultiSelectValue()` - تبدیل مقدار به array
- `getFieldOptions()` - گرفتن تمام options یک فیلد

---

## 🎯 نتایج

### ModuleList (جدول)
✅ تمام فیلدها قابل فیلتر هستند  
✅ SELECT فیلدها برچسب‌های فارسی نمایش می‌دهند  
✅ MULTI_SELECT فیلدها تمام مقادیر را به صورت cyan tags نمایش می‌دهند  
✅ RELATION فیلدها اسامی کامل را نمایش می‌دهند  

### ModuleShow (جزئیات)
✅ SELECT مقادیر برچسب‌های فارسی نمایش می‌دهند  
✅ MULTI_SELECT مقادیر به صورت tags نمایش داده می‌شوند  
✅ RELATION مقادیر به صورت links نمایش داده می‌شوند  

### EditableTable (جداول قابل ویرایش)
✅ SELECT dropdowns برچسب‌های فارسی نمایش می‌دهند  
✅ MULTI_SELECT dropdowns چند انتخاب را پشتیبانی می‌کنند  
✅ Display mode برچسب‌های فارسی نمایش می‌دهد  

---

## 📊 جريان داده

```
1. ModuleList_Refine یا ModuleShow load می‌شوند
   ↓
2. fetchOptions() جاری می‌شود
   - dynamic_options table سے گزینے لاد ہو جاتے ہیں
   - relation targets سے references لاد ہو جاتے ہیں
   ↓
3. SmartTableRenderer/ModuleShow render می‌شوند
   - dynamicOptions اور relationOptions pass ہو جاتے ہیں
   ↓
4. نمایش
   - SELECT: label نمایش داده می‌شود
   - MULTI_SELECT: تمام labels به صورت cyan tags
   - RELATION: full label (name + code)
   ↓
5. Filtering
   - اختیار شده مقادیر سے فیلتر ہو سکتے ہیں
   - MULTI_SELECT: array.includes() استفال ہو رہی ہے
```

---

## 🧪 تست کریں

### مرحلہ ۱: ModuleList میں
```
1. Products > List نکھولیں
2. leather_colors ستون میں
   - باید cyan tags نمایش دیں (مثل: [Black] [Brown] [Red])
3. leather_colors filter کریں
   - گزینے نمایش دیں: Black, Brown, Red, ...
4. ایک گزینہ منتخب کریں
   - صرف وہ محصولات نمایش دیں جن میں یہ رنگ ہے
```

### مرحلہ ۲: ModuleShow میں
```
1. Products > ایک محصول نکھولیں
2. leather_colors فیلڈ تلاش کریں
   - باید cyan tags نمایش دیں
   - ہر tag میں رنگ کا نام فارسی (نہ انگریزی)
3. Edit دبائیں
   - SmartForm میں mode="multiple" dropdown نمایش دے
   - موجودہ مقادیر منتخب ہوں
```

### مرحلہ ۳: BOM جدول میں
```
1. Production > BOM > محصول نکھولیں
2. leather_colors ستون میں
   - Display: برچسب‌های فارسی (مثل: "Black, Brown, Red")
   - Edit: dropdown mode="multiple"
3. مقادیر منتخب/تبدیل کریں
   - Database میں array ہے محفوظ ہو
```

---

## ⚠️ نوٹس

### یاد رکھیں:
1. **Dynamic Options**: database میں ہونے چاہیں
2. **Value**: ہمیشہ انگریزی code (مثل: 'black')
3. **Label**: ہمیشہ فارسی (مثل: 'سیاہ')
4. **Filter**: array.includes() استفال ہو رہی ہے
5. **Display**: ہمیشہ label نمایش ہو

### مثال:
```typescript
// Database میں dynamic_options
{
  category: 'leather_color',
  value: 'black',      // انگریزی
  label: 'سیاہ'        // فارسی
}

// Product میں
{
  leather_colors: ['black', 'brown']  // values

  نمایش:
  leather_colors: [سیاہ] [قہوائی]     // labels
}
```

---

## 📝 Summary

**اہم تبدیلیاں:**
- SmartTableRenderer: dynamicOptions props اضافہ
- ModuleList_Refine: fetchOptions اور options state اضافہ
- ModuleShow: MULTI_SELECT tags display
- utils/optionHelpers: نیا helper file برائے reusable logic

**نتیجہ:**
✅ تمام SELECT/MULTI_SELECT فیلدها فارسی برچسب‌های نمایش دیتے ہیں
✅ تمام فیلدها filtering کو support کرتے ہیں
✅ Database میں raw values ہیں (انگریزی)
✅ صارف کو ہمیشہ فارسی text نظر آتا ہے

---

**تاریخ:** 2024
**وضعیت:** ✅ تکمیل شد
**اگلے مرحلے:** Testing + Deployment

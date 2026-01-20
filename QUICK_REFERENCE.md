# Quick Reference: Auto-Fill & SELECT/MULTI_SELECT Implementation

## 🚀 At a Glance

**What's New:**
1. Custom field values auto-populate when selecting a product in BOM
2. SELECT and MULTI_SELECT fields now fully editable in BOM tables
3. Dynamic options loaded from database for all field types

**Files Modified:**
- `components/EditableTable.tsx` - Added auto-fill & field rendering
- `pages/ModuleShow.tsx` - Enhanced option fetching
- `modules/productsConfig.ts` - Already configured correctly ✅

**No Database Changes Required** - Uses existing tables

---

## 📌 Key Code Snippets

### 1. Auto-Fill Trigger (in EditableTable.tsx)
```typescript
if (key === 'item_id' && value) {
    const enriched = await enrichRowWithProductData({ ...newData[index] });
    newData[index] = enriched;
}
```
Triggered by: User selecting product in item_id dropdown

### 2. SELECT Field Display (when not editing)
```typescript
const categoryKey = col.dynamicOptionsCategory || col.key;
const options = dynamicOptions[categoryKey] || [];
const opt = options.find((o: any) => (o.id || o.value || o) === text);
const label = opt ? (opt.name || opt.label || opt) : '-';
return <span>{label}</span>;
```
Shows: Label of selected value (e.g., "Brown" instead of "brown")

### 3. SELECT Field Dropdown (when editing)
```typescript
<Select
    value={text}
    onChange={(val: any) => updateRow(index, col.key, val)}
    options={options.map((opt: any) => ({ 
        label: opt.name || opt.label || opt, 
        value: opt.id || opt.value || opt 
    }))}
/>
```
Shows: Dropdown with all available options

### 4. MULTI_SELECT Field (when editing)
```typescript
<Select
    mode="multiple"
    value={Array.isArray(text) ? text : (text ? [text] : [])}
    onChange={(val: any) => updateRow(index, col.key, val)}
    options={options.map(...)}
/>
```
Shows: Multi-select with checkboxes

### 5. Fetch Options in ModuleShow
```typescript
const dynFields = [...moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory)];
moduleConfig.blocks?.forEach(b => {
    if (b.type === BlockType.TABLE && b.tableColumns) {
        b.tableColumns.forEach(c => {
            if ((c.type === FieldType.SELECT || c.type === FieldType.MULTI_SELECT) && 
                (c as any).dynamicOptionsCategory) {
                dynFields.push(c);
            }
        });
    }
});
```
Collects: All SELECT/MULTI_SELECT fields (both regular and table columns)

---

## 🔗 Connection Map

```
User Action              Function Called              Result
────────────────────────────────────────────────────────────────
Select item_id       →   updateRow()              →   enrichRowWithProductData()
                                                   →   Query products table
                                                   →   Merge values
                                                   →   Re-render row

Click SELECT field   →   updateRow()              →   Set new value
                      →   Component re-renders    →   Show new label

Click MULTI_SELECT   →   updateRow()              →   Set array value
                      →   Component re-renders    →   Show values
```

---

## 🎯 Configuration Points

### For Each SELECT Field:

1. **In productsConfig.ts fieldsArray:**
   ```typescript
   {
     key: 'leather_type',
     type: FieldType.SELECT,
     dynamicOptionsCategory: 'leather_type'  // ← Must match dynamic_options table
   }
   ```

2. **In dynamic_options table:**
   ```sql
   INSERT INTO dynamic_options (category, label, value, is_active)
   VALUES 
     ('leather_type', 'Natural', 'natural', true),
     ('leather_type', 'Synthetic', 'synthetic', true);
   ```

3. **In products table:**
   ```sql
   ALTER TABLE products ADD COLUMN leather_type TEXT;
   ```

---

## 🔧 Common Tasks

### Add New SELECT Field to BOM

1. **Add to productsConfig.ts:**
   ```typescript
   { 
     key: 'new_field', 
     labels: { fa: 'نام فیلد', en: 'Field Name' },
     type: FieldType.SELECT,
     blockId: 'leatherSpec',
     dynamicOptionsCategory: 'new_field'  // ← Unique category
   }
   ```

2. **Add to products table:**
   ```sql
   ALTER TABLE products ADD COLUMN new_field TEXT;
   ```

3. **Add to dynamic_options:**
   ```sql
   INSERT INTO dynamic_options (category, label, value, is_active)
   VALUES ('new_field', 'Option 1', 'option_1', true);
   ```

4. **BOM table columns auto-update** (done automatically by createBomTableColumns)

### Test SELECT Field Works

```typescript
// In browser console:
// 1. Open a BOM
// 2. Select a product in item_id
// 3. Verify field auto-fills
// 4. Click field to edit
// 5. Verify dropdown shows options
// 6. Select different option
// 7. Click Save
// 8. Reload page
// 9. Verify saved value persists
```

---

## ⚠️ Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Auto-fill not working | item_id not set or enrichRowWithProductData not called | Check console for errors; verify item_id has valid product ID |
| SELECT dropdown empty | dynamicOptions not populated | Check if dynamic_options table has data; verify category matches |
| Value not saving | Product field missing in database | Add column to products table |
| Wrong label shown | dynamicOptionsCategory mismatch | Verify field.dynamicOptionsCategory matches dynamic_options.category |
| Multiple values not showing | MULTI_SELECT not in render logic | Field type should be FieldType.MULTI_SELECT |

---

## 📊 Data Structure Examples

### Product Record
```json
{
  "id": "prod-123",
  "name": "Premium Leather",
  "leather_type": "Natural",
  "leather_color_1": "Brown",
  "leather_finish_1": "Glossy"
}
```

### BOM Row (After Auto-Fill)
```json
{
  "item_id": "prod-123",
  "name": "Premium Leather",
  "leather_type": "Natural",
  "leather_color_1": "Brown",
  "leather_finish_1": "Glossy",
  "usage": 2.5,
  "buy_price": 150000,
  "total_price": 375000
}
```

### Dynamic Options
```json
[
  { "id": "opt-1", "category": "leather_type", "label": "Natural", "value": "natural" },
  { "id": "opt-2", "category": "leather_type", "label": "Synthetic", "value": "synthetic" },
  { "id": "opt-3", "category": "leather_color", "label": "Brown", "value": "brown" }
]
```

---

## 🧪 Quick Test Commands

```javascript
// In browser console while editing BOM:

// 1. Check if dynamicOptions loaded
console.log('dynamicOptions:', dynamicOptions);

// 2. Check if enrichRowWithProductData exists
console.log('enrichRowWithProductData:', enrichRowWithProductData);

// 3. Check table columns
console.log('block.tableColumns:', block.tableColumns);

// 4. Manually trigger enrichment (for testing)
const enriched = await enrichRowWithProductData({ item_id: 'prod-id' });
console.log('Enriched row:', enriched);
```

---

## 📚 Related Documentation

- **AUTO_FILL_COMPLETE_GUIDE.md** - Comprehensive guide with examples
- **IMPLEMENTATION_NOTES.md** - Technical details of changes
- **FIELD_POPULATION_GUIDE.md** - Database schema and configuration
- **AUTO_FILL_DEBUG_LOG.md** - Troubleshooting and debugging
- **DATABASE_SCHEMA.md** - Full database structure
- **productsConfig.ts** - Field definitions and table column configs

---

## ✅ Verification Checklist

Run these checks to verify implementation:

```
□ EditableTable receives dynamicOptions prop
□ enrichRowWithProductData is async
□ updateRow triggers enrichment on item_id change
□ SELECT fields show dropdowns when editing
□ MULTI_SELECT fields show checkboxes when editing
□ Values display as labels (not raw values) when not editing
□ Auto-fill values appear in correct fields
□ User can override auto-filled values
□ All values save to database correctly
□ Page reload shows saved values
□ No TypeScript errors in console
□ No JavaScript errors in console
```

---

## 🎓 Learning Path

1. **Start Here:** Read this file (5 min)
2. **Understand:** Read IMPLEMENTATION_NOTES.md (10 min)
3. **Deep Dive:** Read AUTO_FILL_COMPLETE_GUIDE.md (20 min)
4. **Implement:** Add new field following "Add New SELECT Field" section (10 min)
5. **Test:** Follow testing scenarios in COMPLETE_GUIDE.md (15 min)

---

## 📞 Getting Help

**If X doesn't work:**

1. **Auto-fill not triggering**
   - Check: Is item_id being set?
   - Check: enrichRowWithProductData() in console errors?
   - Check: Does product exist in products table?
   - Read: COMPLETE_GUIDE → Issue: Auto-Fill Not Triggering

2. **SELECT dropdown empty**
   - Check: dynamic_options table has data?
   - Check: Category matches dynamicOptionsCategory?
   - Read: COMPLETE_GUIDE → Issue: SELECT Dropdown Not Showing

3. **Values not saving**
   - Check: Product field exists in database?
   - Check: RLS policies allow UPDATE?
   - Read: COMPLETE_GUIDE → Issue: Values Not Saving

---

**Version:** 1.0  
**Last Updated:** 2024  
**Status:** Production Ready ✅

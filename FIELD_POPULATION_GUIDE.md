# Field Population and Dynamic Field Support Guide

## Overview
This document explains the automatic population of custom field values from related product records and support for SELECT/MULTI_SELECT fields in the BOM table editing interface.

## Features Implemented

### 1. Automatic Custom Field Population
When a user selects an item in a BOM table (via `item_id`), the table automatically fetches custom field values from the selected product record.

**How it works:**
- User selects a product in the `item_id` column
- `enrichRowWithProductData()` function is triggered in EditableTable.tsx
- Function queries the products table to fetch all custom field values for the selected product
- Values are merged into the current row, pre-populating all spec fields (leather_type, leather_color_1, etc.)

**Key Function:** [EditableTable.tsx#L47-L65](EditableTable.tsx#L47-L65)
```typescript
const enrichRowWithProductData = async (row: any) => {
    if (!row.item_id) return row;
    
    try {
        // فیلدهایی که نیاز دارند (فیلدهای سفارشی + نام و کد)
        const customFields = block.tableColumns
            ?.filter((col: any) => col.type !== FieldType.RELATION && 
                    col.key !== 'usage' && col.key !== 'unit' && 
                    col.key !== 'buy_price' && col.key !== 'total_price')
            .map((col: any) => col.key)
            .join(', ') || '';
        
        const { data: product } = await supabase
            .from('products')
            .select(`id, name, system_code${customFields ? ', ' + customFields : ''}`)
            .eq('id', row.item_id)
            .single();
        
        if (product) {
            return {
                ...product,
                ...row,
                item_id: row.item_id
            };
        }
    } catch (error) {
        console.error('Error enriching row:', error);
    }
    return row;
};
```

### 2. SELECT and MULTI_SELECT Field Support in EditableTable
The EditableTable component now fully supports editing SELECT and MULTI_SELECT fields in BOM tables.

**Display Mode (when not editing):**
- SELECT fields show the label of the selected value
- MULTI_SELECT fields show comma-separated labels of selected values
- Values are looked up from the `dynamicOptions` parameter

**Edit Mode:**
- SELECT fields render as dropdown menus
- MULTI_SELECT fields render as multi-select dropdown menus
- Options are fetched from `dynamicOptions` parameter
- `dynamicOptionsCategory` property on field definition links to the correct option category

**Example Render Logic:** [EditableTable.tsx#L216-L244](EditableTable.tsx#L216-L244)
```typescript
if (col.type === FieldType.SELECT) {
    const categoryKey = col.dynamicOptionsCategory || col.key;
    const options = dynamicOptions[categoryKey] || [];
    
    return (
        <Select
            value={text}
            onChange={(val: any) => updateRow(index, col.key, val)}
            options={options.map((opt: any) => ({ 
                label: opt.name || opt.label || opt, 
                value: opt.id || opt.value || opt 
            }))}
            placeholder="انتخاب کنید..."
            style={{ width: '100%' }}
            getPopupContainer={(trigger: any) => trigger.parentNode}
        />
    );
}
```

### 3. Integration with updateRow Function
The `updateRow` function has been enhanced to automatically enrich row data when `item_id` changes:

```typescript
const updateRow = async (index: number, key: string, value: any) => {
    const newData = [...tempData];
    newData[index] = { ...newData[index], [key]: value };
    
    // اگر item_id تغییر کرد، مقادیر سفارشی را از محصول فراخوانی کن
    if (key === 'item_id' && value) {
        const enriched = await enrichRowWithProductData({ ...newData[index] });
        newData[index] = enriched;
    }
    
    if (key === 'usage' || key === 'qty' || key === 'buy_price' || key === 'price') {
        newData[index]['total_price'] = calculateRowTotal(newData[index]);
    }
    
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
};
```

### 4. Enhanced fetchOptions in ModuleShow
The `fetchOptions` function now also fetches dynamic options for SELECT/MULTI_SELECT fields in table columns:

```typescript
// جمع‌آوری تمام فیلدهای SELECT/MULTI_SELECT (هم از fields و هم از tableColumns)
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

## Configuration in productsConfig.ts

### Field Definition with Dynamic Options
Each SELECT field must have a `dynamicOptionsCategory` property that links to the dynamic_options table:

```typescript
{ 
  key: 'leather_type', 
  labels: { fa: 'نوع چرم', en: 'Leather Type' }, 
  type: FieldType.SELECT, 
  location: FieldLocation.BLOCK, 
  blockId: 'leatherSpec', 
  order: 1, 
  dynamicOptionsCategory: 'leather_type'
}
```

### Table Column Definition
When creating table columns dynamically using `createBomTableColumns()`, the `dynamicOptionsCategory` is automatically preserved:

```typescript
const createBomTableColumns = (relationConfig, specBlockId, usageTitle, unitDefault) => {
  const specFields = getFieldsForBlock(specBlockId);
  
  return [
    { key: 'item_id', title: 'انتخاب محصول', type: FieldType.RELATION, relationConfig },
    // فیلدهای سفارشی از spec block
    ...specFields.map(f => ({
      key: f.key,
      title: f.labels.fa,
      type: f.type,
      dynamicOptionsCategory: (f as any).dynamicOptionsCategory,
      readonly: false
    })),
    { key: 'usage', title: usageTitle, type: FieldType.NUMBER },
    { key: 'unit', title: 'واحد', type: FieldType.TEXT, defaultValue: unitDefault },
    { key: 'buy_price', title: 'قیمت خرید', type: FieldType.PRICE },
    { key: 'total_price', title: 'جمع', type: FieldType.PRICE, readonly: true }
  ];
};
```

## Data Flow

```
User selects item_id in BOM row
           ↓
updateRow() called with key='item_id'
           ↓
enrichRowWithProductData() triggered
           ↓
Supabase query: SELECT custom fields FROM products WHERE id = item_id
           ↓
Product record fetched
           ↓
Product field values merged into row
           ↓
Row re-rendered with pre-filled custom values
           ↓
User sees populated SELECT/MULTI_SELECT fields
           ↓
User can click dropdown to change values
```

## Database Schema

The system uses two main tables:

### products table
Stores product records with custom fields:
```sql
- id (UUID, PK)
- name (TEXT)
- system_code (TEXT)
- category (TEXT)
- leather_type (TEXT)
- leather_color_1 (TEXT)
- leather_finish_1 (TEXT)
- lining_material (TEXT)
- lining_color (TEXT)
- ... other custom fields
```

### dynamic_options table
Stores available options for SELECT/MULTI_SELECT fields:
```sql
- id (UUID, PK)
- category (TEXT) - references the dynamicOptionsCategory
- label (TEXT) - display name
- value (TEXT) - stored value
- is_active (BOOLEAN)
```

**Example categories:**
- `leather_type` → ['Natural', 'Synthetic', 'Nubuck', ...]
- `leather_color` → ['Black', 'Brown', 'Blue', ...]
- `leather_finish` → ['Matte', 'Glossy', 'Satin', ...]
- `lining_material` → ['Cotton', 'Silk', 'Polyester', ...]
- etc.

## Component Modifications

### EditableTable.tsx Changes
1. Added `enrichRowWithProductData()` async function
2. Modified `updateRow()` to trigger enrichment when item_id changes
3. Added SELECT field render logic (display mode + edit mode)
4. Added MULTI_SELECT field render logic (display mode + edit mode)
5. Updated component signature to accept `dynamicOptions` parameter

### ModuleShow.tsx Changes
1. Enhanced `fetchOptions()` to include table column SELECT/MULTI_SELECT fields
2. Now collects `dynamicOptionsCategory` from both regular fields and table columns
3. Prevents duplicate fetches with category checking

## Usage Example

When a user is editing a BOM for a leather product:

1. **User selects leather in item_id dropdown**
   - Let's say they select "Premium Leather #001"

2. **Automatic Population Occurs**
   - leather_type field is auto-filled with "Natural"
   - leather_color_1 field is auto-filled with "Brown"
   - leather_finish_1 field is auto-filled with "Glossy"

3. **User Can Override**
   - User can click on leather_color_1 dropdown
   - SELECT field renders with all available color options
   - User selects "Black" instead
   - Value is saved in the table row

4. **Data Saved to Database**
   - When user clicks "Save", all values (auto-filled and manually changed) are saved
   - BOM record includes both auto-populated and user-edited values

## Performance Considerations

### Optimization
- Only custom fields (excluding system fields like usage, unit, prices) are fetched
- Dynamic options are fetched once during component initialization
- Product data is cached at row level, not globally
- Async enrichment doesn't block table rendering

### Potential Issues to Monitor
- **Multiple row additions**: If user adds many rows quickly, multiple async queries might fire. Consider debouncing if performance degrades.
- **Network latency**: Auto-population depends on Supabase response. Slow network might cause lag.
- **Option list size**: Very large dynamic_options tables might slow down SELECT rendering. Consider pagination if > 1000 items.

## Testing Checklist

- [ ] Select a leather product in items_leather table → custom fields auto-fill
- [ ] Select a lining product in items_lining table → custom fields auto-fill
- [ ] Edit SELECT field in BOM → dropdown shows available options
- [ ] Edit MULTI_SELECT field in BOM → multi-select renders correctly
- [ ] Save BOM → all values (auto-filled and edited) are persisted
- [ ] Reload page → pre-filled values display correctly
- [ ] Change item_id to different product → old values update to new product's values
- [ ] Add new category to dynamic_options → new option appears in SELECT dropdowns
- [ ] Test on slow network → enrichment completes properly without blocking UI

## Future Enhancements

1. **Debouncing**: Debounce enrichRowWithProductData calls for rapid item_id changes
2. **Caching**: Cache fetched product data to avoid repeated queries for same product
3. **Batch Loading**: Fetch multiple products at once if multiple rows have the same item_id
4. **Validation**: Add validation to ensure selected values match available options
5. **Sync**: Real-time sync if referenced product's custom fields change

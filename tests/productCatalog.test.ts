import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { FieldType } from '../types';
import {
  buildCatalogGroupPrefixedName,
  buildSeedVariantValues,
  buildVariantCombinations,
  composeNameWithAutoSuffix,
  extractManualNamePrefix,
  mapFieldTypeToAttributeValueType,
  normalizeCatalogProductPayload,
  isEligibleProductAttributeField,
  resolveProductAttributeGroupLabel,
  type ProductAttributeRecord,
} from '../utils/productCatalog';
import { persistProductCatalogData } from '../utils/productCatalogPersistence';

type Row = Record<string, any>;
type Filter = { type: 'eq'; column: string; value: any };

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
const runTest = (name: string, fn: () => Promise<void> | void) => {
  tests.push({ name, fn });
};

class MockQuery {
  private filters: Filter[] = [];

  constructor(
    private readonly db: MockSupabase,
    private readonly table: string,
    private readonly mode: 'select' | 'insert' | 'upsert' | 'update',
    private readonly payload?: any,
  ) {}

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  select(_fields?: string) {
    return this;
  }

  insert(payload: any) {
    return new MockQuery(this.db, this.table, 'insert', payload);
  }

  upsert(payload: any, _options?: any) {
    return new MockQuery(this.db, this.table, 'upsert', payload);
  }

  update(payload: any) {
    return new MockQuery(this.db, this.table, 'update', payload).withFilters(this.filters);
  }

  async single() {
    if (this.mode === 'insert') return { data: this.db.insertRows(this.table, this.payload)[0] ?? null, error: null };
    if (this.mode === 'upsert') return { data: this.db.upsertRows(this.table, this.payload)[0] ?? null, error: null };
    return { data: this.executeSelect()[0] ?? null, error: null };
  }

  async then(resolve: (value: { data: any; error: null }) => unknown) {
    if (this.mode === 'insert') return resolve({ data: this.db.insertRows(this.table, this.payload), error: null });
    if (this.mode === 'upsert') return resolve({ data: this.db.upsertRows(this.table, this.payload), error: null });
    if (this.mode === 'update') return resolve({ data: this.db.updateRows(this.table, this.filters, this.payload), error: null });
    return resolve({ data: this.executeSelect(), error: null });
  }

  private withFilters(filters: Filter[]) {
    this.filters = [...filters];
    return this;
  }

  private executeSelect() {
    return this.db.getTable(this.table)
      .filter((row) => this.filters.every((filter) => row?.[filter.column] === filter.value))
      .map((row) => ({ ...row }));
  }
}

class MockSupabase {
  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string) {
    return new MockQuery(this, table, 'select');
  }

  getTable(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  insertRows(table: string, payload: any) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const target = this.getTable(table);
    return rows.map((row) => {
      const next = { id: row.id ?? `${table}_${target.length + 1}`, ...row };
      target.push(next);
      return { ...next };
    });
  }

  upsertRows(table: string, payload: any) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const target = this.getTable(table);
    return rows.map((row) => {
      if (row.id) {
        const idx = target.findIndex((item) => item.id === row.id);
        if (idx >= 0) {
          target[idx] = { ...target[idx], ...row };
          return { ...target[idx] };
        }
      }
      const next = { id: row.id ?? `${table}_${target.length + 1}`, ...row };
      target.push(next);
      return { ...next };
    });
  }

  updateRows(table: string, filters: Filter[], payload: any) {
    const target = this.getTable(table);
    const updated: Row[] = [];
    target.forEach((row, index) => {
      const matches = filters.every((filter) => row?.[filter.column] === filter.value);
      if (!matches) return;
      target[index] = { ...row, ...payload };
      updated.push({ ...target[index] });
    });
    return updated;
  }
}

const makeAttribute = (patch: Partial<ProductAttributeRecord>): ProductAttributeRecord => ({
  scope_type: 'parent',
  parent_product_id: 'parent-1',
  key: 'attr',
  label: 'ویژگی',
  value_type: 'select',
  option_source_type: 'field',
  source_field_key: 'source_key',
  is_variation: true,
  is_visible_on_site: true,
  sort_order: 0,
  is_active: true,
  options: [],
  ...patch,
});

runTest('maps multi select fields to multi_select attributes', () => {
  assert.equal(mapFieldTypeToAttributeValueType(FieldType.MULTI_SELECT), 'multi_select');
  assert.equal(mapFieldTypeToAttributeValueType(FieldType.SELECT), 'select');
});

runTest('seeds variant values from source product fields', () => {
  const product = {
    leather_type: 'cow',
    leather_colors: ['black', 'brown'],
    empty_field: '',
  };

  const attributes: ProductAttributeRecord[] = [
    makeAttribute({ key: 'global_leather_type', source_field_key: 'leather_type' }),
    makeAttribute({ key: 'global_color', source_field_key: 'leather_colors', value_type: 'multi_select' }),
    makeAttribute({ key: 'empty_attr', source_field_key: 'empty_field' }),
    makeAttribute({ key: 'custom_only', option_source_type: 'custom', source_field_key: null }),
  ];

  assert.deepEqual(buildSeedVariantValues(product, attributes), {
    global_leather_type: 'cow',
    global_color: ['black', 'brown'],
  });
});

runTest('builds combinations on top of seeded parent-backed values', () => {
  const attributes: ProductAttributeRecord[] = [
    makeAttribute({ key: 'global_leather_type', source_field_key: 'leather_type' }),
    makeAttribute({ key: 'size', source_field_key: 'size_source' }),
    makeAttribute({ key: 'manual', option_source_type: 'custom', source_field_key: null }),
  ];

  const attributeOptionsMap = new Map([
    ['size', [{ label: 'M', value: 'm' }, { label: 'L', value: 'l' }]],
    ['manual', [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]],
  ]);

  const seedValues = buildSeedVariantValues({ leather_type: 'goat' }, attributes);
  const result = buildVariantCombinations({
    attributes,
    attributeOptionsMap,
    seedValues,
    maxCombinations: 10,
  });

  assert.equal(result.combinationsCount, 4);
  assert.deepEqual(result.combinations, [
    { global_leather_type: 'goat', size: 'm', manual: 'a' },
    { global_leather_type: 'goat', size: 'm', manual: 'b' },
    { global_leather_type: 'goat', size: 'l', manual: 'a' },
    { global_leather_type: 'goat', size: 'l', manual: 'b' },
  ]);
});

runTest('rejects invalid combination plans and enforces max limit', () => {
  const attributes = [makeAttribute({ key: 'no_options' })];
  const noOptionsMap = new Map<string, Array<{ label: string; value: string }>>();

  assert.throws(
    () => buildVariantCombinations({ attributes, attributeOptionsMap: noOptionsMap }),
    /قابل ترکیبی پیدا نشد/,
  );

  const tooManyMap = new Map([
    ['no_options', [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }]],
  ]);

  assert.throws(
    () => buildVariantCombinations({ attributes, attributeOptionsMap: tooManyMap, maxCombinations: 2 }),
    /تعداد ترکیب‌ها/,
  );
});

runTest('normalizes standalone and parent payloads to the same catalog shape', () => {
  const bulkLikePayload = normalizeCatalogProductPayload({
    name: 'Bulk Product',
    product_type: 'raw',
    category: 'leather',
  });

  const parentLikePayload = normalizeCatalogProductPayload({
    name: 'Parent Product',
    catalog_role: 'parent',
    product_type: 'final',
    product_category: 'bag',
    __product_attributes: [{ key: 'color' }],
    __product_variations: [{ variant_values: { color: 'black' } }],
  });

  assert.equal(bulkLikePayload.catalog_role, 'standalone');
  assert.equal(bulkLikePayload.parent_product_id, null);
  assert.equal(bulkLikePayload.variant_signature, null);
  assert.deepEqual(bulkLikePayload.variant_values, {});

  assert.equal(parentLikePayload.catalog_role, 'parent');
  assert.equal(parentLikePayload.parent_product_id, null);
  assert.equal(parentLikePayload.variant_signature, null);
  assert.deepEqual(parentLikePayload.variant_values, {});
  assert.ok(!('__product_attributes' in parentLikePayload));
  assert.ok(!('__product_variations' in parentLikePayload));
});

runTest('prefixes catalog parent and variant auto names with the selected attribute group', () => {
  const groupLabel = resolveProductAttributeGroupLabel({ category: 'leather' });
  assert.equal(groupLabel, 'چرم');
  assert.equal(buildCatalogGroupPrefixedName('کیف مدل آریا', groupLabel), 'چرم کیف مدل آریا');
  assert.equal(buildCatalogGroupPrefixedName('چرم کیف مدل آریا', groupLabel), 'چرم کیف مدل آریا');
});

runTest('preserves a manual product name prefix before the auto-generated suffix', () => {
  const autoName = 'چرم کیف مدل آریا';
  assert.equal(extractManualNamePrefix('پیشوند سفارشی چرم کیف مدل آریا', autoName), 'پیشوند سفارشی');
  assert.equal(composeNameWithAutoSuffix('پیشوند سفارشی', autoName), 'پیشوند سفارشی چرم کیف مدل آریا');
});

runTest('excludes parent-only price fields from attribute source candidates', () => {
  assert.equal(isEligibleProductAttributeField({ key: 'waste_rate', type: FieldType.NUMBER, labels: { fa: 'نرخ پرت' } }), false);
  assert.equal(isEligibleProductAttributeField({ key: 'main_unit_price', type: FieldType.PRICE as any, labels: { fa: 'قیمت واحد اصلی' } }), false);
  assert.equal(isEligibleProductAttributeField({ key: 'model_name', type: FieldType.SELECT, labels: { fa: 'مدل' } }), true);
});

runTest('persists parent variants with prefixed names, variant prices, and bundle id', async () => {
  const supabase = new MockSupabase({
    products: [],
    product_attributes: [],
    product_attribute_options: [],
  });

  const persisted = await persistProductCatalogData({
    supabase: supabase as any,
    values: {
      catalog_role: 'parent',
      product_type: 'raw',
      category: 'leather',
      name: 'کیف مدل آریا',
      auto_name_enabled: true,
      main_unit: 'عدد',
      sub_unit: 'عدد',
      __product_attributes: [
        makeAttribute({
          key: 'color',
          label: 'رنگ',
          option_source_type: 'custom',
          source_field_key: null,
          options: [{ label: 'مشکی', value: 'مشکی' }],
        }),
      ],
      __product_variations: [
        {
          variant_values: { color: 'مشکی' },
          waste_rate: 3,
          main_unit_price: 450,
          sub_unit_price: 45,
          buy_price: 1200,
          sell_price: 1800,
          bundle_id: 'bundle-1',
          opening_stock: 0,
        },
      ],
    },
  });

  const products = supabase.getTable('products');
  const parent = products.find((row) => row.id === persisted.id);
  const variant = products.find((row) => row.catalog_role === 'variant');

  assert.equal(parent?.name, 'چرم کیف مدل آریا');
  assert.equal(variant?.parent_product_id, persisted.id);
  assert.equal(variant?.name, 'چرم کیف مدل آریا - رنگ: مشکی');
  assert.equal(variant?.waste_rate, 3);
  assert.equal(variant?.main_unit_price, 450);
  assert.equal(variant?.sub_unit_price, 45);
  assert.equal(variant?.buy_price, 1200);
  assert.equal(variant?.sell_price, 1800);
  assert.equal(variant?.bundle_id, 'bundle-1');
  assert.deepEqual(supabase.getTable('product_attribute_options'), [
    {
      id: 'product_attribute_options_1',
      attribute_id: 'product_attributes_1',
      label: 'مشکی',
      value: 'مشکی',
      sort_order: 0,
      is_active: true,
    },
  ]);
});

runTest('keeps a user-provided product name prefix when persisting parent and variant auto names', async () => {
  const supabase = new MockSupabase({
    products: [],
    product_attributes: [],
    product_attribute_options: [],
  });

  const persisted = await persistProductCatalogData({
    supabase: supabase as any,
    values: {
      catalog_role: 'parent',
      product_type: 'raw',
      category: 'leather',
      name: 'پیشوند سفارشی چرم کیف مدل آریا',
      __auto_name_prefix: 'پیشوند سفارشی',
      auto_name_enabled: true,
      main_unit: 'عدد',
      sub_unit: 'عدد',
      __product_attributes: [
        makeAttribute({
          key: 'color',
          label: 'رنگ',
          option_source_type: 'custom',
          source_field_key: null,
          options: [{ label: 'مشکی', value: 'مشکی' }],
        }),
      ],
      __product_variations: [
        {
          variant_values: { color: 'مشکی' },
          opening_stock: 0,
        },
      ],
    },
  });

  const products = supabase.getTable('products');
  const parent = products.find((row) => row.id === persisted.id);
  const variant = products.find((row) => row.catalog_role === 'variant');

  assert.equal(parent?.name, 'پیشوند سفارشی چرم کیف مدل آریا');
  assert.equal(variant?.name, 'پیشوند سفارشی چرم کیف مدل آریا - رنگ: مشکی');
});

runTest('combination builder stays responsive near the configured UI cap', () => {
  const attributes: ProductAttributeRecord[] = [
    makeAttribute({ key: 'color' }),
    makeAttribute({ key: 'size' }),
    makeAttribute({ key: 'finish' }),
  ];

  const options = Array.from({ length: 5 }, (_, index) => ({
    label: `opt-${index + 1}`,
    value: `opt-${index + 1}`,
  }));

  const attributeOptionsMap = new Map([
    ['color', options],
    ['size', options],
    ['finish', options],
  ]);

  const startedAt = performance.now();
  const result = buildVariantCombinations({
    attributes,
    attributeOptionsMap,
    maxCombinations: 200,
  });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(result.combinationsCount, 125);
  assert.equal(result.combinations.length, 125);
  assert.ok(elapsedMs < 250, `expected combination build to stay under 250ms, got ${elapsedMs.toFixed(2)}ms`);
});

const main = async () => {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }

  console.log(`\n${tests.length} test(s) passed.`);
};

void main();


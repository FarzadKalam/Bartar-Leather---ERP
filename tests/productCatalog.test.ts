import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { FieldType } from '../types';
import {
  buildSeedVariantValues,
  buildVariantCombinations,
  mapFieldTypeToAttributeValueType,
  normalizeCatalogProductPayload,
  type ProductAttributeRecord,
} from '../utils/productCatalog';

const tests: Array<{ name: string; fn: () => void }> = [];
const runTest = (name: string, fn: () => void) => {
  tests.push({ name, fn });
};

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

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
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


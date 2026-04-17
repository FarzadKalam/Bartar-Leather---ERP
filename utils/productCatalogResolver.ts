import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCanonicalVariantIdentity,
  buildCatalogBaseIdentity,
  matchesCatalogBaseIdentity,
  type CatalogBaseIdentity,
} from './productCatalog';

type ProductMatchRow = {
  id: string;
  name: string | null;
  system_code: string | null;
  product_type: string | null;
  catalog_role: string | null;
  parent_product_id: string | null;
  variant_signature: string | null;
  variant_values: Record<string, any>;
  category: string | null;
  product_category: string | null;
  model_name: string | null;
  related_bom: string | null;
};

type ResolveCatalogProductMatchOptions = {
  supabase: SupabaseClient;
  values: Record<string, any>;
  productType?: string | null;
};

export type ResolveCatalogProductMatchResult = {
  baseIdentity: CatalogBaseIdentity;
  variantValues: Record<string, any>;
  variantSignature: string | null;
  exactProduct: ProductMatchRow | null;
  fallbackProduct: ProductMatchRow | null;
  parentProduct: ProductMatchRow | null;
  candidateProducts: ProductMatchRow[];
  parentProducts: ProductMatchRow[];
};

const PRODUCT_MATCH_SELECT = [
  'id',
  'name',
  'system_code',
  'product_type',
  'catalog_role',
  'parent_product_id',
  'variant_signature',
  'variant_values',
  'category',
  'product_category',
  'model_name',
  'related_bom',
].join(', ');

const normalizeRow = (row: any): ProductMatchRow => ({
  id: String(row?.id || '').trim(),
  name: row?.name ? String(row.name) : null,
  system_code: row?.system_code ? String(row.system_code) : null,
  product_type: row?.product_type ? String(row.product_type) : null,
  catalog_role: row?.catalog_role ? String(row.catalog_role) : null,
  parent_product_id: row?.parent_product_id ? String(row.parent_product_id) : null,
  variant_signature: row?.variant_signature ? String(row.variant_signature) : null,
  variant_values: row?.variant_values && typeof row.variant_values === 'object' ? row.variant_values : {},
  category: row?.category ? String(row.category) : null,
  product_category: row?.product_category ? String(row.product_category) : null,
  model_name: row?.model_name ? String(row.model_name) : null,
  related_bom: row?.related_bom ? String(row.related_bom) : null,
});

const applyBaseIdentityFilters = (
  query: any,
  identity: CatalogBaseIdentity,
) => {
  if (identity.productType) {
    query = query.eq('product_type', identity.productType);
  }
  if (identity.productType === 'raw') {
    if (identity.category) {
      query = query.eq('category', identity.category);
    }
  } else if (identity.productCategory) {
    query = query.eq('product_category', identity.productCategory);
  }
  if (identity.modelName) {
    query = query.eq('model_name', identity.modelName);
  }
  if (identity.relatedBom) {
    query = query.eq('related_bom', identity.relatedBom);
  }
  return query;
};

const normalizeName = (value: any) => String(value || '').trim().toLowerCase();

const compareCandidatePriority = (
  left: ProductMatchRow,
  right: ProductMatchRow,
  sourceValues: Record<string, any>,
  variantSignature: string | null,
) => {
  const score = (row: ProductMatchRow) => {
    let total = 0;
    if (variantSignature && row.variant_signature === variantSignature) total += 100;
    if (row.catalog_role === 'variant') total += 20;
    if (row.catalog_role === 'standalone') total += 10;
    if (normalizeName(row.name) && normalizeName(row.name) === normalizeName(sourceValues?.name)) total += 5;
    return total;
  };
  return score(right) - score(left);
};

export const resolveCatalogProductMatch = async ({
  supabase,
  values,
  productType,
}: ResolveCatalogProductMatchOptions): Promise<ResolveCatalogProductMatchResult> => {
  const sourceValues = {
    ...(values || {}),
    product_type: productType ?? values?.product_type ?? null,
    related_bom: values?.related_bom ?? values?.bom_id ?? null,
  };
  const baseIdentity = buildCatalogBaseIdentity(sourceValues, { productType });
  const { variantValues, variantSignature } = buildCanonicalVariantIdentity(sourceValues);

  const [candidateResult, parentResult] = await Promise.all([
    applyBaseIdentityFilters(
      supabase
        .from('products')
        .select(PRODUCT_MATCH_SELECT)
        .neq('catalog_role', 'parent')
        .limit(50),
      baseIdentity,
    ),
    applyBaseIdentityFilters(
      supabase
        .from('products')
        .select(PRODUCT_MATCH_SELECT)
        .eq('catalog_role', 'parent')
        .limit(25),
      baseIdentity,
    ),
  ]);

  if (candidateResult.error) throw candidateResult.error;
  if (parentResult.error) throw parentResult.error;

  const candidateProducts = (candidateResult.data || [])
    .map(normalizeRow)
    .filter((row: ProductMatchRow) => row.id && matchesCatalogBaseIdentity(row, baseIdentity))
    .sort((left: ProductMatchRow, right: ProductMatchRow) => compareCandidatePriority(left, right, sourceValues, variantSignature));

  const parentProducts = (parentResult.data || [])
    .map(normalizeRow)
    .filter((row: ProductMatchRow) => row.id && matchesCatalogBaseIdentity(row, baseIdentity))
    .sort((left: ProductMatchRow, right: ProductMatchRow) => compareCandidatePriority(left, right, sourceValues, null));

  const exactMatches = variantSignature
    ? candidateProducts.filter((row: ProductMatchRow) => row.variant_signature === variantSignature)
    : [];

  return {
    baseIdentity,
    variantValues,
    variantSignature,
    exactProduct: exactMatches[0] || null,
    fallbackProduct: exactMatches[0] || (candidateProducts.length === 1 ? candidateProducts[0] : null),
    parentProduct: parentProducts.length === 1 ? parentProducts[0] : null,
    candidateProducts,
    parentProducts,
  };
};

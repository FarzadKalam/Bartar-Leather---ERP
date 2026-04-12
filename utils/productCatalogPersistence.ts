import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildVariantName,
  buildVariantSignature,
  normalizeProductAttributeRecord,
  stripProductCatalogFields,
  type ProductAttributeOptionRecord,
  type ProductAttributeRecord,
  type ProductVariationRecord,
} from './productCatalog';

type SaveProductCatalogOptions = {
  supabase: SupabaseClient;
  recordId?: string | null;
  previousRecord?: Record<string, any> | null;
  values: Record<string, any>;
};

const PRODUCT_BASE_COPY_EXCLUDED = new Set<string>([
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'system_code',
  'stock',
  'sub_stock',
  'site_product_link',
  'site_remote_id',
  'site_sync_status',
  'site_last_synced_at',
  'site_sync_error',
]);

const toNumberOrNull = (value: any) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeAttributeOptions = (options?: ProductAttributeOptionRecord[]) =>
  (Array.isArray(options) ? options : [])
    .map((option, index) => ({
      id: option.id,
      attribute_id: option.attribute_id ?? null,
      label: String(option.label || '').trim(),
      value: String(option.value || option.label || '').trim(),
      sort_order: typeof option.sort_order === 'number' ? option.sort_order : index,
      is_active: option.is_active !== false,
    }))
    .filter((option) => option.label && option.value);

const upsertAttributeOptions = async (
  supabase: SupabaseClient,
  attributeId: string,
  options: ProductAttributeOptionRecord[],
) => {
  const normalizedOptions = normalizeAttributeOptions(options);
  const { data: existingRows, error: existingError } = await supabase
    .from('product_attribute_options')
    .select('id')
    .eq('attribute_id', attributeId);
  if (existingError) throw existingError;

  const existingIds = new Set((existingRows || []).map((row: any) => String(row.id)));
  const keptIds = new Set<string>();
  const payload = normalizedOptions.map((option) => {
    if (option.id) keptIds.add(String(option.id));
    return {
      id: option.id,
      attribute_id: attributeId,
      label: option.label,
      value: option.value,
      sort_order: option.sort_order ?? 0,
      is_active: option.is_active !== false,
    };
  });

  if (payload.length > 0) {
    const { error } = await supabase
      .from('product_attribute_options')
      .upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  }

  const deleteIds = Array.from(existingIds).filter((id) => !keptIds.has(id));
  if (deleteIds.length > 0) {
    const { error } = await supabase
      .from('product_attribute_options')
      .delete()
      .in('id', deleteIds);
    if (error) throw error;
  }
};

const upsertAttributeRows = async (
  supabase: SupabaseClient,
  attributes: ProductAttributeRecord[],
) => {
  if (!attributes.length) return [];
  const payload = attributes.map((attribute) => ({
    id: attribute.id,
    scope_type: attribute.scope_type,
    parent_product_id: attribute.parent_product_id ?? null,
    key: attribute.key,
    label: attribute.label,
    value_type: attribute.value_type,
    option_source_type: attribute.option_source_type,
    source_field_key: attribute.source_field_key ?? null,
    is_variation: attribute.is_variation !== false,
    is_visible_on_site: attribute.is_visible_on_site !== false,
    sort_order: attribute.sort_order ?? 0,
    is_active: attribute.is_active !== false,
  }));
  const { data, error } = await supabase
    .from('product_attributes')
    .upsert(payload, { onConflict: 'id' })
    .select('*');
  if (error) throw error;
  return (data || []) as ProductAttributeRecord[];
};

export const loadProductCatalogData = async (
  supabase: SupabaseClient,
  productId?: string | null,
) => {
  const normalizedProductId = String(productId || '').trim();
  const [globalAttrsResult, parentAttrsResult, variantsResult] = await Promise.all([
    supabase
      .from('product_attributes')
      .select('*, product_attribute_options(*)')
      .eq('scope_type', 'global')
      .order('sort_order', { ascending: true }),
    normalizedProductId
      ? supabase
          .from('product_attributes')
          .select('*, product_attribute_options(*)')
          .eq('scope_type', 'parent')
          .eq('parent_product_id', normalizedProductId)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    normalizedProductId
      ? supabase
          .from('products')
          .select('id, name, system_code, site_code, sell_price, image_url, site_product_link, status, related_bom, stock, site_sync_enabled, site_sync_status, variant_values')
          .eq('parent_product_id', normalizedProductId)
          .eq('catalog_role', 'variant')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (globalAttrsResult.error) throw globalAttrsResult.error;
  if (parentAttrsResult?.error) throw parentAttrsResult.error;
  if (variantsResult?.error) throw variantsResult.error;

  const mapAttribute = (row: any) =>
    normalizeProductAttributeRecord({
      ...row,
      options: Array.isArray(row?.product_attribute_options) ? row.product_attribute_options : [],
    });

  const globalAttributes = (globalAttrsResult.data || []).map(mapAttribute);
  const parentAttributes = (parentAttrsResult?.data || []).map(mapAttribute);
  const variations: ProductVariationRecord[] = (variantsResult?.data || []).map((row: any) => ({
    id: row.id ? String(row.id) : undefined,
    name: row.name ? String(row.name) : null,
    site_code: row.site_code ? String(row.site_code) : null,
    sell_price: toNumberOrNull(row.sell_price),
    image_url: row.image_url ? String(row.image_url) : null,
    site_product_link: row.site_product_link ? String(row.site_product_link) : null,
    status: row.status ? String(row.status) : 'active',
    related_bom: row.related_bom ? String(row.related_bom) : null,
    stock: toNumberOrNull(row.stock),
    system_code: row.system_code ? String(row.system_code) : null,
    site_sync_enabled: row.site_sync_enabled === true,
    site_sync_status: row.site_sync_status ? String(row.site_sync_status) : null,
    variant_values: row.variant_values && typeof row.variant_values === 'object' ? row.variant_values : {},
  }));

  return {
    globalAttributes,
    parentAttributes,
    variations,
  };
};

export const persistProductCatalogData = async ({
  supabase,
  recordId,
  previousRecord,
  values,
}: SaveProductCatalogOptions) => {
  const globalAttributesRaw = Array.isArray(values?.__product_global_attributes)
    ? values.__product_global_attributes
    : [];
  const parentAttributesRaw = Array.isArray(values?.__product_attributes)
    ? values.__product_attributes
    : [];
  const variationsRaw = Array.isArray(values?.__product_variations)
    ? values.__product_variations
    : [];

  const productPayload = stripProductCatalogFields(values);
  if (!productPayload.catalog_role) {
    productPayload.catalog_role = 'standalone';
  }
  if (productPayload.catalog_role !== 'variant') {
    productPayload.parent_product_id = null;
    productPayload.variant_signature = null;
    productPayload.variant_values = {};
  }
  if (productPayload.catalog_role === 'variant' && productPayload.parent_product_id) {
    const { data: parentAttributeRows, error: parentAttributesError } = await supabase
      .from('product_attributes')
      .select('key, source_field_key, option_source_type, is_active')
      .eq('scope_type', 'parent')
      .eq('parent_product_id', productPayload.parent_product_id)
      .eq('is_active', true);
    if (parentAttributesError) throw parentAttributesError;

    const nextVariantValues = {
      ...((previousRecord?.variant_values && typeof previousRecord.variant_values === 'object') ? previousRecord.variant_values : {}),
      ...((productPayload.variant_values && typeof productPayload.variant_values === 'object') ? productPayload.variant_values : {}),
    } as Record<string, any>;

    (parentAttributeRows || []).forEach((attribute: any) => {
      if (attribute?.option_source_type !== 'field' || !attribute?.source_field_key) return;
      nextVariantValues[String(attribute.key)] = productPayload[attribute.source_field_key] ?? null;
    });

    productPayload.variant_values = nextVariantValues;
    productPayload.variant_signature = buildVariantSignature(nextVariantValues);
  }

  let productId = String(recordId || '').trim();
  if (productId) {
    const { error } = await supabase.from('products').update(productPayload).eq('id', productId);
    if (error) throw error;
  } else {
    const { data: inserted, error } = await supabase
      .from('products')
      .insert(productPayload)
      .select('id')
      .single();
    if (error) throw error;
    productId = String(inserted?.id || '').trim();
  }

  const normalizedGlobalAttributes = globalAttributesRaw.map((attribute: any, index: number) =>
    normalizeProductAttributeRecord({ ...attribute, scope_type: 'global', parent_product_id: null }, index)
  );
  const normalizedParentAttributes = parentAttributesRaw.map((attribute: any, index: number) =>
    normalizeProductAttributeRecord({ ...attribute, scope_type: 'parent', parent_product_id: productId }, index)
  );

  if (normalizedGlobalAttributes.length > 0) {
    const upsertedGlobals = await upsertAttributeRows(supabase, normalizedGlobalAttributes);
    for (const attribute of upsertedGlobals) {
      if (attribute.option_source_type === 'custom') {
        await upsertAttributeOptions(supabase, String(attribute.id), attribute.options || []);
      }
    }
  }

  const { data: existingParentRows, error: existingParentError } = await supabase
    .from('product_attributes')
    .select('id')
    .eq('scope_type', 'parent')
    .eq('parent_product_id', productId);
  if (existingParentError) throw existingParentError;
  const existingParentIds = new Set((existingParentRows || []).map((row: any) => String(row.id)));

  const upsertedParents = normalizedParentAttributes.length > 0
    ? await upsertAttributeRows(supabase, normalizedParentAttributes)
    : [];
  const keptParentIds = new Set(upsertedParents.map((attribute) => String(attribute.id || '')));

  for (const attribute of upsertedParents) {
    if (attribute.option_source_type === 'custom' && attribute.id) {
      await upsertAttributeOptions(supabase, String(attribute.id), attribute.options || []);
    }
  }

  const deleteParentIds = Array.from(existingParentIds).filter((id) => !keptParentIds.has(id));
  if (deleteParentIds.length > 0) {
    const { error } = await supabase
      .from('product_attributes')
      .delete()
      .in('id', deleteParentIds);
    if (error) throw error;
  }

  if (productPayload.catalog_role === 'parent') {
    const parentBase = { ...(previousRecord || {}), ...productPayload };
    Object.keys(parentBase).forEach((key) => {
      if (PRODUCT_BASE_COPY_EXCLUDED.has(key)) {
        delete parentBase[key];
      }
    });

    const activeAttributes = normalizedParentAttributes.filter((attribute) => attribute.is_active !== false);
    for (const rawVariation of variationsRaw as ProductVariationRecord[]) {
      const variantValues = rawVariation?.variant_values && typeof rawVariation.variant_values === 'object'
        ? rawVariation.variant_values
        : {};
      const siteCode = String(rawVariation?.site_code || '').trim();
      const payload: Record<string, any> = {
        ...parentBase,
        catalog_role: 'variant',
        parent_product_id: productId,
        site_code: siteCode || null,
        sell_price: toNumberOrNull(rawVariation?.sell_price),
        image_url: rawVariation?.image_url || parentBase.image_url || null,
        site_product_link: rawVariation?.site_product_link || null,
        status: rawVariation?.status || 'active',
        related_bom: rawVariation?.related_bom || parentBase.related_bom || null,
        site_sync_enabled: rawVariation?.site_sync_enabled === true,
        variant_values: variantValues,
        variant_signature: buildVariantSignature(variantValues),
      };

      activeAttributes.forEach((attribute) => {
        if (attribute.option_source_type !== 'field' || !attribute.source_field_key) return;
        const value = variantValues?.[attribute.key];
        payload[attribute.source_field_key] = value ?? null;
      });

      payload.name = rawVariation?.name
        ? String(rawVariation.name).trim()
        : buildVariantName(String(parentBase.name || previousRecord?.name || 'محصول'), variantValues, activeAttributes);

      if (rawVariation?.id) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', rawVariation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
      }
    }
  }

  return { id: productId };
};

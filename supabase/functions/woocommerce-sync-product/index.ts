import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

type SiteSettings = {
  base_url?: string;
  woocommerce?: {
    base_url?: string;
    consumer_key?: string;
    consumer_secret?: string;
    default_status?: string;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const admin = createClient(supabaseUrl, supabaseServiceRole);

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

const loadSiteSettings = async () => {
  const { data, error } = await admin
    .from('integration_settings')
    .select('settings')
    .eq('connection_type', 'site')
    .maybeSingle();
  if (error) throw error;
  return (data?.settings || {}) as SiteSettings;
};

const buildAuthParams = (settings: SiteSettings) => {
  const woo = settings?.woocommerce || {};
  const consumerKey = String(woo.consumer_key || '').trim();
  const consumerSecret = String(woo.consumer_secret || '').trim();
  const baseUrl = normalizeUrl(String(woo.base_url || settings?.base_url || '').trim());
  if (!baseUrl || !consumerKey || !consumerSecret) {
    throw new Error('WooCommerce settings are incomplete.');
  }
  return { baseUrl, consumerKey, consumerSecret, defaultStatus: String(woo.default_status || 'draft') };
};

const buildProductPermalink = (baseUrl: string, permalink?: string | null) => {
  if (permalink) return permalink;
  return baseUrl;
};

const fetchProductImages = async (productId: string, fallbackImage?: string | null) => {
  const images: Array<{ src: string }> = [];
  if (fallbackImage) images.push({ src: String(fallbackImage) });
  const { data } = await admin
    .from('record_files')
    .select('file_url, sort_order')
    .eq('module_id', 'products')
    .eq('record_id', productId)
    .eq('file_type', 'image')
    .order('sort_order', { ascending: true })
    .limit(10);
  (data || []).forEach((row: any) => {
    const src = String(row?.file_url || '').trim();
    if (!src) return;
    if (!images.some((item) => item.src === src)) images.push({ src });
  });
  return images;
};

const loadCatalogData = async (productId: string, mode: 'upsert' | 'sync_children') => {
  const { data: product, error } = await admin
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();
  if (error) throw error;

  const lookupParentId = product?.catalog_role === 'variant' ? String(product?.parent_product_id || '') : productId;
  const { data: attributes, error: attrError } = await admin
    .from('product_attributes')
    .select('*, product_attribute_options(*)')
    .eq('scope_type', 'parent')
    .eq('parent_product_id', lookupParentId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (attrError) throw attrError;

  const variations = mode === 'sync_children' || product?.catalog_role === 'parent'
    ? await admin
        .from('products')
        .select('*')
        .eq('parent_product_id', lookupParentId)
        .eq('catalog_role', 'variant')
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (variations.error) throw variations.error;

  return {
    product,
    attributes: (attributes || []).map((attribute: any) => ({
      ...attribute,
      options: Array.isArray(attribute?.product_attribute_options) ? attribute.product_attribute_options : [],
    })),
    variations: variations.data || [],
  };
};

const toWooAttribute = (attribute: any, variations: any[]) => {
  const optionsFromChildren = variations
    .map((variation) => variation?.variant_values?.[attribute.key])
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .map((value) => String(value));
  const optionsFromAttribute = Array.isArray(attribute.options)
    ? attribute.options.map((option: any) => String(option?.label || option?.value || '')).filter(Boolean)
    : [];
  const options = Array.from(new Set([...optionsFromAttribute, ...optionsFromChildren]));
  return {
    name: String(attribute.label || attribute.key),
    visible: attribute.is_visible_on_site !== false,
    variation: attribute.is_variation !== false,
    options,
  };
};

const toWooProductPayload = async (product: any, attributes: any[], variations: any[], settings: ReturnType<typeof buildAuthParams>) => {
  const images = await fetchProductImages(String(product.id), product?.image_url || null);
  const basePayload: Record<string, unknown> = {
    name: String(product?.name || 'محصول'),
    sku: product?.site_code ? String(product.site_code) : undefined,
    status: settings.defaultStatus,
    images,
    attributes: attributes
      .filter((attribute) => attribute.is_visible_on_site !== false)
      .map((attribute) => toWooAttribute(attribute, variations)),
  };

  if (product?.catalog_role === 'parent') {
    basePayload.type = 'variable';
    return basePayload;
  }

  basePayload.type = 'simple';
  if (product?.sell_price !== null && product?.sell_price !== undefined) {
    basePayload.regular_price = String(product.sell_price);
  }
  return basePayload;
};

const toWooVariationPayload = async (parentId: number, variation: any, attributes: any[]) => {
  const images = await fetchProductImages(String(variation.id), variation?.image_url || null);
  const payload: Record<string, unknown> = {
    regular_price: variation?.sell_price !== null && variation?.sell_price !== undefined ? String(variation.sell_price) : undefined,
    sku: variation?.site_code ? String(variation.site_code) : undefined,
    image: images[0] || undefined,
    attributes: attributes
      .filter((attribute) => attribute.is_variation !== false)
      .map((attribute) => ({
        name: String(attribute.label || attribute.key),
        option: variation?.variant_values?.[attribute.key] ? String(variation.variant_values[attribute.key]) : '',
      }))
      .filter((attribute) => attribute.option),
  };
  return { parentId, payload };
};

const wooRequest = async (
  settings: ReturnType<typeof buildAuthParams>,
  path: string,
  method: 'POST' | 'PUT',
  body: Record<string, unknown>,
) => {
  const url = new URL(`${settings.baseUrl}/wp-json/wc/v3/${path.replace(/^\/+/, '')}`);
  url.searchParams.set('consumer_key', settings.consumerKey);
  url.searchParams.set('consumer_secret', settings.consumerSecret);
  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || `WooCommerce request failed: ${response.status}`);
  }
  return data;
};

const syncSingleProduct = async (settings: ReturnType<typeof buildAuthParams>, payload: Record<string, unknown>, remoteId?: string | null) => {
  if (remoteId) {
    return wooRequest(settings, `products/${remoteId}`, 'PUT', payload);
  }
  return wooRequest(settings, 'products', 'POST', payload);
};

const syncVariation = async (
  settings: ReturnType<typeof buildAuthParams>,
  parentRemoteId: number,
  payload: Record<string, unknown>,
  remoteId?: string | null,
) => {
  if (remoteId) {
    return wooRequest(settings, `products/${parentRemoteId}/variations/${remoteId}`, 'PUT', payload);
  }
  return wooRequest(settings, `products/${parentRemoteId}/variations`, 'POST', payload);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { productId, mode = 'upsert' } = await request.json();
    if (!productId) {
      throw new Error('productId is required.');
    }

    const siteSettings = await loadSiteSettings();
    const wooSettings = buildAuthParams(siteSettings);
    const { product, attributes, variations } = await loadCatalogData(String(productId), mode);
    const productPayload = await toWooProductPayload(product, attributes, variations, wooSettings);
    const syncedProduct = await syncSingleProduct(wooSettings, productPayload, product?.site_remote_id || null);

    await admin
      .from('products')
      .update({
        site_remote_id: String(syncedProduct?.id || ''),
        site_product_link: buildProductPermalink(wooSettings.baseUrl, syncedProduct?.permalink || null),
        site_sync_status: 'synced',
        site_last_synced_at: new Date().toISOString(),
        site_sync_error: null,
      })
      .eq('id', product.id);

    if ((product?.catalog_role === 'parent' || mode === 'sync_children') && syncedProduct?.id) {
      for (const variation of variations) {
        const { payload } = await toWooVariationPayload(Number(syncedProduct.id), variation, attributes);
        const syncedVariation = await syncVariation(
          wooSettings,
          Number(syncedProduct.id),
          payload,
          variation?.site_remote_id || null,
        );
        await admin
          .from('products')
          .update({
            site_remote_id: String(syncedVariation?.id || ''),
            site_product_link: buildProductPermalink(wooSettings.baseUrl, syncedVariation?.permalink || null),
            site_sync_status: 'synced',
            site_last_synced_at: new Date().toISOString(),
            site_sync_error: null,
          })
          .eq('id', variation.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, productId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

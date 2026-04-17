import type { SupabaseClient } from '@supabase/supabase-js';

type CompanyInventoryPolicy = {
  allowNegativeInventory: boolean;
};

const inventoryPolicyCache = new WeakMap<object, CompanyInventoryPolicy>();
const inventoryPolicyInflight = new WeakMap<object, Promise<CompanyInventoryPolicy>>();

const toBoolean = (value: any) => value === true || value === 'true' || value === 1;

export const extractCompanyInventoryPolicy = (row: any): CompanyInventoryPolicy => ({
  allowNegativeInventory: toBoolean(row?.allow_negative_inventory),
});

export const setCompanyInventoryPolicyCache = (
  supabase: SupabaseClient,
  policy: Partial<CompanyInventoryPolicy>
) => {
  const key = supabase as unknown as object;
  const existing = inventoryPolicyCache.get(key) || { allowNegativeInventory: false };
  inventoryPolicyCache.set(key, {
    ...existing,
    ...policy,
  });
};

export const getCompanyInventoryPolicy = async (
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<CompanyInventoryPolicy> => {
  const key = supabase as unknown as object;
  if (!options?.forceRefresh) {
    const cached = inventoryPolicyCache.get(key);
    if (cached) return cached;
    const inflight = inventoryPolicyInflight.get(key);
    if (inflight) return inflight;
  }

  const request = (async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('allow_negative_inventory')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const policy = extractCompanyInventoryPolicy(data);
      inventoryPolicyCache.set(key, policy);
      return policy;
    } catch (error) {
      console.warn('Could not load company inventory policy; using defaults.', error);
      return { allowNegativeInventory: false };
    } finally {
      inventoryPolicyInflight.delete(key);
    }
  })();

  inventoryPolicyInflight.set(key, request);
  return request;
};

export const getAllowNegativeInventory = async (
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
) => {
  const policy = await getCompanyInventoryPolicy(supabase, options);
  return policy.allowNegativeInventory;
};

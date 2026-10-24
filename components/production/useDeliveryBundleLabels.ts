import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { isCreateNewBundleValue, isUseSourceBundleValue } from '../../utils/productionBundles';

/** Load referenced bundles even after their source inventory has been exhausted. */
export const useDeliveryBundleLabels = (open: boolean, groups: any[]) => {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const idsKey = JSON.stringify(Array.from(new Set(groups.flatMap((group) =>
    [...(group.deliveryRows || []), ...(group.previousDeliveryRows || [])].flatMap((row: any) =>
      [row.sourceBundleId, row.targetBundleId, row.source_bundle_id, row.target_bundle_id]
    )
  ).filter((id) => id && !isCreateNewBundleValue(id) && !isUseSourceBundleValue(id)))).sort());
  useEffect(() => {
    if (!open) return;
    const ids = JSON.parse(idsKey) as string[];
    if (!ids.length) return;
    let active = true;
    void supabase.from('product_bundles').select('id,bundle_number,system_code').in('id', ids).then(({ data, error }) => {
      if (error) { console.warn('Could not resolve delivery bundle labels', error); return; }
      if (active) setLabels(Object.fromEntries((data || []).map((bundle: any) => [bundle.id, bundle.bundle_number || bundle.system_code || 'بسته بدون شماره'])));
    });
    return () => { active = false; };
  }, [open, idsKey]);
  return labels;
};

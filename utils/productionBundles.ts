export const CREATE_NEW_BUNDLE_VALUE = '__create_new_bundle__';
export const USE_SOURCE_BUNDLE_VALUE = '__use_source_bundle__';

export const isCreateNewBundleValue = (value: unknown) => String(value || '') === CREATE_NEW_BUNDLE_VALUE;
export const isUseSourceBundleValue = (value: unknown) => String(value || '') === USE_SOURCE_BUNDLE_VALUE;

export const resolveRequestedTargetBundleId = (
  requestedValue: unknown,
  sourceBundleId: unknown
): string | null => {
  if (isCreateNewBundleValue(requestedValue)) return null;
  if (isUseSourceBundleValue(requestedValue) || !requestedValue) {
    return sourceBundleId ? String(sourceBundleId) : null;
  }
  return String(requestedValue);
};

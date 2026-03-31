export const formatRelationOptionLabel = (
  targetModule: string | undefined,
  baseLabel: string | null | undefined,
  systemCode?: string | null,
): string => {
  const normalizedBaseLabel = String(baseLabel || '').trim();
  const normalizedSystemCode = String(systemCode || '').trim();

  if (!normalizedSystemCode) {
    return normalizedBaseLabel;
  }

  if (targetModule === 'products') {
    return normalizedBaseLabel ? `${normalizedBaseLabel} - ${normalizedSystemCode}` : normalizedSystemCode;
  }

  return normalizedBaseLabel ? `${normalizedBaseLabel} (${normalizedSystemCode})` : normalizedSystemCode;
};

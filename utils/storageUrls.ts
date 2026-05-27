const STORAGE_PUBLIC_PATH = '/storage/v1/object/public/';

const getStorageBaseUrl = (): string => {
  return (
    import.meta.env.VITE_STORAGE_PUBLIC_BASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    ''
  );
};

export const normalizeStoragePublicUrl = (value?: string | null): string | null => {
  if (value === null || value === undefined) return value ?? null;

  const rawUrl = String(value).trim();
  if (!rawUrl) return rawUrl;

  try {
    const parsedUrl = new URL(rawUrl);
    if (!parsedUrl.pathname.includes(STORAGE_PUBLIC_PATH)) return rawUrl;

    const storageBaseUrl = getStorageBaseUrl();
    if (!storageBaseUrl) return rawUrl;

    const normalizedBase = new URL(storageBaseUrl);
    parsedUrl.protocol = normalizedBase.protocol;
    parsedUrl.hostname = normalizedBase.hostname;
    parsedUrl.port = normalizedBase.port;

    return parsedUrl.toString();
  } catch {
    return rawUrl;
  }
};

export const normalizeStoragePublicUrlsInRecord = <T extends Record<string, any> | null | undefined>(record: T): T => {
  if (!record || typeof record !== 'object') return record;

  const nextRecord: Record<string, any> = { ...record };
  Object.keys(nextRecord).forEach((key) => {
    const value = nextRecord[key];
    if (typeof value !== 'string') return;
    if (!value.includes(STORAGE_PUBLIC_PATH)) return;
    nextRecord[key] = normalizeStoragePublicUrl(value);
  });

  return nextRecord as T;
};

const MODULE_LIST_PAGE_SIZE_STORAGE_KEY = 'bartar:module-list-page-size';

export const DEFAULT_MODULE_LIST_PAGE_SIZE = 50;

const normalizePageSize = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MODULE_LIST_PAGE_SIZE;
  }

  return parsed;
};

export const readModuleListPageSizePreference = (): number => {
  if (typeof window === 'undefined') {
    return DEFAULT_MODULE_LIST_PAGE_SIZE;
  }

  try {
    return normalizePageSize(window.localStorage.getItem(MODULE_LIST_PAGE_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_MODULE_LIST_PAGE_SIZE;
  }
};

export const writeModuleListPageSizePreference = (pageSize: number): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      MODULE_LIST_PAGE_SIZE_STORAGE_KEY,
      String(normalizePageSize(pageSize)),
    );
  } catch {
    // Ignore storage failures and keep the UI functional.
  }
};

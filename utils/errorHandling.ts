const stringifyFallback = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const extractMessageFromObject = (value: Record<string, unknown>): string | null => {
  const directMessage = value.message;
  if (typeof directMessage === 'string' && directMessage.trim()) return directMessage.trim();

  const formattedError = value.formattedError;
  if (typeof formattedError === 'string' && formattedError.trim()) return formattedError.trim();

  const details = value.details;
  if (typeof details === 'string' && details.trim()) return details.trim();

  const hint = value.hint;
  if (typeof hint === 'string' && hint.trim()) return hint.trim();

  const code = value.code;
  if (typeof code === 'string' && code.trim()) return `Error code: ${code.trim()}`;

  return null;
};

export const getErrorMessage = (error: unknown, fallback = 'خطای نامشخص رخ داد.') => {
  if (!error) return fallback;

  if (typeof error === 'string') {
    return error.trim() || fallback;
  }

  if (error instanceof Error) {
    return error.message?.trim() || fallback;
  }

  if (Array.isArray(error)) {
    const parts = error
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') return item.trim() || null;
        if (typeof item === 'object') return extractMessageFromObject(item as Record<string, unknown>);
        return String(item);
      })
      .filter((item): item is string => !!item);

    if (parts.length > 0) return parts.join(' | ');
    return stringifyFallback(error);
  }

  if (typeof error === 'object') {
    const message = extractMessageFromObject(error as Record<string, unknown>);
    return message || stringifyFallback(error);
  }

  return String(error);
};

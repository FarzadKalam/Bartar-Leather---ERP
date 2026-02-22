const DONE_STATUSES = new Set(['done', 'completed']);

export const normalizeTaskStatus = (status: unknown): string => {
  return String(status ?? '').trim().toLowerCase();
};

export const isTaskDoneStatus = (status: unknown): boolean => {
  return DONE_STATUSES.has(normalizeTaskStatus(status));
};

export const buildTaskStatusUpdatePayload = (
  nextStatus: unknown,
  previousCompletedAt: string | null | undefined = null,
) => {
  return {
    status: nextStatus,
    completed_at: isTaskDoneStatus(nextStatus)
      ? (previousCompletedAt || new Date().toISOString())
      : null,
  };
};

type TaskStatusCarrier = {
  status?: unknown;
  completed_at?: string | null;
};

export const attachTaskCompletionIfNeeded = <T extends TaskStatusCarrier>(
  values: T,
  previousCompletedAt: string | null | undefined = null,
): T & { completed_at?: string | null } => {
  if (!Object.prototype.hasOwnProperty.call(values, 'status')) {
    return values;
  }

  const nextStatus = values.status;
  return {
    ...values,
    completed_at: isTaskDoneStatus(nextStatus)
      ? (values.completed_at ?? previousCompletedAt ?? new Date().toISOString())
      : null,
  };
};

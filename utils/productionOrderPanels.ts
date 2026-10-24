export type ProductionOrderPanelStep = 'materials' | 'lines' | 'progress';

/** Only explicit user choices override the count-sensitive initial state. */
export const isProductionOrderPanelExpanded = (
  step: ProductionOrderPanelStep,
  orderId: string,
  orderCount: number,
  overrides: Record<string, boolean>,
): boolean => overrides[`${step}:${orderId}`] ?? (step !== 'materials' && orderCount <= 3);

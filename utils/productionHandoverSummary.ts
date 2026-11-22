import { asNumber, getDeliveryMainQuantity, resolveDeliveryType } from './productionDeliveryRows';
import { normalizeUnitValue } from './unitConversions';

/** Explicit rows (including an empty list) take priority over historical cached totals. */
export function getHandoverCurrentQuantity(group: any): number {
  if (Array.isArray(group?.deliveryRows)) {
    return group.deliveryRows.reduce((sum: number, row: any) =>
      sum + getDeliveryMainQuantity(row, resolveDeliveryType(group)), 0);
  }
  if (group?.totalHandoverQty !== undefined && group?.totalHandoverQty !== null)
    return asNumber(group.totalHandoverQty);
  return (group?.pieces || []).reduce((sum: number, piece: any) =>
    sum + asNumber(piece.handoverQty ?? piece.sourceQty), 0);
}

export function getHandoverPersonAmounts(groups: any[]) {
  return groups.flatMap((group, index) => {
    const units = new Map<string, number>();
    if (Array.isArray(group.deliveryRows)) {
      group.deliveryRows.forEach((row: any) => {
        const unit = normalizeUnitValue(row.mainUnit) || row.mainUnit || 'بدون واحد';
        units.set(unit, (units.get(unit) || 0) + getDeliveryMainQuantity(row, resolveDeliveryType(group)));
      });
    }
    if (!units.size) units.set(group.pieces?.[0]?.mainUnit || 'بدون واحد', getHandoverCurrentQuantity(group));
    return Array.from(units, ([unit, quantity]) => ({
      key: `${group.key || index}:${unit}`,
      label: group.selectedProductName || group.categoryLabel || 'ماده اولیه',
      unit, quantity,
    }));
  });
}

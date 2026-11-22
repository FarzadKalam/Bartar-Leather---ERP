import { materialCostPerItem } from './bomMaterialCost';
import { convertBetweenUnits, normalizeUnitValue } from './unitConversions';

export function materialPieceForProduct(piece: any, product: any) {
  const from = normalizeUnitValue(piece.main_unit);
  const to = normalizeUnitValue(product.main_unit) || from;
  let quantity = piece.quantity;
  if (from && to && from !== to) {
    if (Number(piece.length) && Number(piece.width)) {
      throw new Error('واحد ماده با واحد ابعاد قطعه متفاوت است؛ ابتدا واحد و ابعاد را بررسی کنید.');
    }
    const converted = convertBetweenUnits(Number(quantity) || 0, from, to);
    if (!Number.isFinite(converted)) throw new Error('واحد ماده با مصرف قطعه سازگار نیست؛ مقدار قبلی حفظ شد.');
    quantity = converted;
  }
  return { ...piece, quantity, main_unit: to || null,
    sub_unit: product.sub_unit || piece.sub_unit,
    waste_rate: product.waste_rate ?? piece.waste_rate,
    unit_price: product.main_unit_price ?? product.buy_price ?? piece.unit_price,
    sub_unit_price: product.sub_unit_price ?? product.sub_buy_price ?? piece.sub_unit_price };
}

export function materialCategoryChange(row: any, category: string | null) {
  const header = { ...row.header, category };
  for (const key of Object.keys(header)) if (key.startsWith('selected_product_')) header[key] = null;
  return { header, specs: {}, specs_locked: false, collapsed: false, pieces: row.pieces };
}

export function materialRowsForPersistence(rows: any[], moduleId?: string) {
  return rows.map(row => {
    if (moduleId === 'production_orders' || moduleId === 'production_boms') return { ...row };
    const { key: _key, ...rest } = row;
    return rest;
  });
}

export const calculateMaterialRow = (gridRow: any, orderQuantity = 0) => {
    const pieces = Array.isArray(gridRow.pieces) ? gridRow.pieces : [];
    const qty = Number(orderQuantity) || 0;

    let totalQty = 0;
    let totalMain = 0;
    let totalSub = 0;
    let totalFinal = 0;
    let totalUsageAll = 0;
    let totalCost = 0;

    const nextPieces = pieces.map((piece: any) => {
      const length = parseFloat(piece.length) || 0;
      const width = parseFloat(piece.width) || 0;
      const quantity = parseFloat(piece.quantity) || 0;
      const wasteRate = parseFloat(piece.waste_rate) || 0;
      const baseUsage = length && width ? length * width * (quantity || 1) : quantity || 0;
      const finalUsage = baseUsage * (1 + wasteRate / 100);
      const mainUnit = piece.main_unit || gridRow?.header?.main_unit || null;
      const subUnit = piece.sub_unit || null;
      const qtySubRaw = convertBetweenUnits(baseUsage, mainUnit, subUnit, {
        record: {
          ...(gridRow?.specs || {}),
          conversion_width_mm: piece?.conversion_width_mm ?? gridRow?.specs?.conversion_width_mm,
          category: gridRow?.header?.category || null,
        },
      });
      const qtySub = Number.isFinite(qtySubRaw) ? Math.round(qtySubRaw * 100) / 100 : (parseFloat(piece.qty_sub) || 0);

      const unitPrice = parseFloat(piece.unit_price ?? piece.main_unit_price ?? gridRow?.header?.selected_product_main_unit_price) || 0;
      const subUnitPrice = parseFloat(piece.sub_unit_price ?? piece.sub_buy_price ?? gridRow?.header?.selected_product_sub_unit_price) || 0;
      const costPerItem = materialCostPerItem(unitPrice, finalUsage, subUnitPrice,
        Number.isFinite(qtySubRaw) ? qtySubRaw : qtySub, wasteRate);
      const totalUsage = qty ? finalUsage * qty : 0;
      const totalCostRow = qty ? costPerItem * qty : costPerItem;

      totalQty += quantity || 0;
      totalMain += baseUsage || 0;
      totalSub += qtySub || 0;
      totalFinal += finalUsage || 0;
      totalUsageAll += totalUsage || 0;
      totalCost += totalCostRow || 0;

      return {
        ...piece,
        qty_main: baseUsage,
        qty_sub: qtySub,
        final_usage: finalUsage,
        cost_per_item: costPerItem,
        total_usage: totalUsage,
        total_cost: totalCostRow,
      };
    });

    return {
      ...gridRow,
      pieces: nextPieces,
      totals: {
        total_quantity: totalQty,
        total_qty_main: totalMain,
        total_qty_sub: totalSub,
        total_final_usage: totalFinal,
        total_usage: totalUsageAll,
        total_cost: totalCost,
      },
    };
  };

/** Human-readable production shelf identity; database IDs are never display labels. */
export const formatProductionShelfLabel = (shelf: any): string => {
  const name = String(shelf?.name || '').trim();
  const code = String(shelf?.shelf_number || '').trim();
  const warehouse = Array.isArray(shelf?.warehouses) ? shelf.warehouses[0] : shelf?.warehouses;
  const warehouseName = String(warehouse?.name || '').trim();
  const identity = name && code && name !== code ? `${name} (${code})` : name || code;
  return [identity || 'نام قفسه ثبت نشده', warehouseName ? `انبار ${warehouseName}` : ''].filter(Boolean).join(' — ');
};

type UserNameMap = Map<string, string>;

export const SYSTEM_STOCK_TRANSFER_SOURCES = new Set([
  'sales_invoice',
  'purchase_invoice',
  'production',
  'production_stage',
]);

export const buildStockTransferReferencePayload = (params: {
  invoiceId?: string | null;
  purchaseInvoiceId?: string | null;
  productionOrderId?: string | null;
}) => ({
  invoice_id: params.invoiceId || null,
  purchase_invoice_id: params.purchaseInvoiceId || null,
  production_order_id: params.productionOrderId || null,
});

export const getStockTransferLinkedRecordIds = (row: any) => {
  const transferType = String(row?.transfer_type || '').trim();
  const rawInvoiceId = row?.invoice_id || null;
  const rawPurchaseInvoiceId = row?.purchase_invoice_id || null;

  if (transferType === 'purchase_invoice') {
    return {
      invoiceId: null,
      purchaseInvoiceId: rawPurchaseInvoiceId || rawInvoiceId || null,
      productionOrderId: row?.production_order_id || null,
    };
  }

  return {
    invoiceId: rawInvoiceId || null,
    purchaseInvoiceId: rawPurchaseInvoiceId || null,
    productionOrderId: row?.production_order_id || null,
  };
};

export const isSystemStockTransferRow = (row: any) => {
  const transferType = String(row?.transfer_type || '').trim();
  const refs = getStockTransferLinkedRecordIds(row);
  return (
    SYSTEM_STOCK_TRANSFER_SOURCES.has(transferType) ||
    !!refs.invoiceId ||
    !!refs.purchaseInvoiceId ||
    !!refs.productionOrderId
  );
};

export const mapStockTransferRowToEditorRow = (
  row: any,
  options: {
    mainUnit?: string | null;
    subUnit?: string | null;
    userMap?: UserNameMap;
    keyPrefix?: string;
    index?: number;
    readonly?: boolean;
  } = {}
) => {
  const transferType = String(row?.transfer_type || '').trim() || 'inventory_count';
  const fromShelf = row?.from_shelf_id ? String(row.from_shelf_id) : null;
  const toShelf = row?.to_shelf_id ? String(row.to_shelf_id) : null;
  const creatorId = row?.sender_id || row?.receiver_id || null;
  const refs = getStockTransferLinkedRecordIds(row);

  return {
    id: row?.id,
    key: row?.id || `${options.keyPrefix || 'move'}_${options.index ?? 0}`,
    product_id: row?.product_id ? String(row.product_id) : null,
    product_name: row?.products?.name ? String(row.products.name) : null,
    product_system_code: row?.products?.system_code ? String(row.products.system_code) : null,
    voucher_type: fromShelf && toShelf ? 'transfer' : toShelf ? 'incoming' : 'outgoing',
    source: transferType,
    main_unit: options.mainUnit ?? null,
    main_quantity: Math.abs(parseFloat(row?.delivered_qty) || 0),
    sub_unit: options.subUnit ?? null,
    sub_quantity: Math.abs(parseFloat(row?.required_qty) || 0),
    bundle_id: (row?.product_bundles as any)?.id || row?.bundle_id || null,
    product_bundles: row?.product_bundles || null,
    from_shelf_id: fromShelf,
    to_shelf_id: toShelf,
    invoice_id: refs.invoiceId,
    purchase_invoice_id: refs.purchaseInvoiceId,
    production_order_id: refs.productionOrderId,
    created_by_name: creatorId
      ? (options.userMap?.get(String(creatorId)) || String(creatorId))
      : '-',
    created_at: row?.created_at || null,
    _readonly: typeof options.readonly === 'boolean' ? options.readonly : isSystemStockTransferRow(row),
  };
};

export const buildStockTransferPayload = (params: {
  productId: string;
  transferType: string;
  deliveredQty: number;
  requiredQty: number;
  fromShelfId?: string | null;
  toShelfId?: string | null;
  userId?: string | null;
  bundleId?: string | null;
  invoiceId?: string | null;
  purchaseInvoiceId?: string | null;
  productionOrderId?: string | null;
}) => ({
  product_id: params.productId,
  transfer_type: params.transferType,
  delivered_qty: params.deliveredQty,
  required_qty: params.requiredQty,
  ...buildStockTransferReferencePayload({
    invoiceId: params.invoiceId,
    purchaseInvoiceId: params.purchaseInvoiceId,
    productionOrderId: params.productionOrderId,
  }),
  from_shelf_id: params.fromShelfId || null,
  to_shelf_id: params.toShelfId || null,
  sender_id: params.userId || null,
  receiver_id: params.userId || null,
  bundle_id: params.bundleId ?? null,
});

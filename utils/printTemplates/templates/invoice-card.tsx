import React from 'react';
import { PRINT_PAPER_DIMENSIONS, PrintPaperSize } from '../printSizing';

interface InvoiceCardProps {
  data: any;
  formatPersianPrice: (price: number) => string;
  toPersianNumber: (str: string) => string;
  safeJalaliFormat: (date: any, format: string) => string;
  relationOptions?: Record<string, any[]>;
  templateId?: string;
  customer?: any;
  seller?: any;
  printSize?: PrintPaperSize;
}

const L = {
  invoiceTitle: '\u0641\u0627\u06a9\u062a\u0648\u0631 \u0641\u0631\u0648\u0634',
  buyerInfo: '\u0645\u0634\u062e\u0635\u0627\u062a \u062e\u0631\u06cc\u062f\u0627\u0631',
  sellerInfo: '\u0645\u0634\u062e\u0635\u0627\u062a \u0641\u0631\u0648\u0634\u0646\u062f\u0647',
  invoiceInfo: '\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u0641\u0627\u06a9\u062a\u0648\u0631',
  buyerName: '\u0646\u0627\u0645 \u0648 \u0646\u0627\u0645 \u062e\u0627\u0646\u0648\u0627\u062f\u06af\u06cc',
  businessName: '\u0646\u0627\u0645 \u06a9\u0633\u0628 \u0648 \u06a9\u0627\u0631',
  phone: '\u0634\u0645\u0627\u0631\u0647 \u062a\u0645\u0627\u0633',
  address: '\u0622\u062f\u0631\u0633',
  invoiceNumber: '\u0634\u0645\u0627\u0631\u0647 \u0641\u0627\u06a9\u062a\u0648\u0631',
  invoiceDate: '\u062a\u0627\u0631\u06cc\u062e \u0641\u0627\u06a9\u062a\u0648\u0631',
  items: '\u0627\u0642\u0644\u0627\u0645 \u0641\u0627\u06a9\u062a\u0648\u0631',
  row: '\u0631\u062f\u06cc\u0641',
  product: '\u0645\u062d\u0635\u0648\u0644',
  unit: '\u0648\u0627\u062d\u062f',
  quantity: '\u062a\u0639\u062f\u0627\u062f',
  unitPrice: '\u0642\u06cc\u0645\u062a \u0648\u0627\u062d\u062f',
  discount: '\u062a\u062e\u0641\u06cc\u0641',
  tax: '\u0645\u0627\u0644\u06cc\u0627\u062a',
  total: '\u062c\u0645\u0639',
  noItems: '\u0645\u0648\u0631\u062f\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f',
  hiddenRowsSuffix: '\u0631\u062f\u06cc\u0641 \u062f\u06cc\u06af\u0631 \u062f\u0631 \u0633\u06cc\u0633\u062a\u0645 \u062b\u0628\u062a \u0634\u062f\u0647 \u0627\u0633\u062a.',
  itemsSummary: '\u062c\u0645\u0639 \u0627\u0642\u0644\u0627\u0645',
  paymentsTable: '\u062c\u062f\u0648\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u06cc\u200c\u0647\u0627',
  paymentType: '\u0646\u0648\u0639',
  paymentStatus: '\u0648\u0636\u0639\u06cc\u062a',
  amount: '\u0645\u0628\u0644\u063a',
  noPayments: '\u062f\u0631\u06cc\u0627\u0641\u062a\u06cc \u062b\u0628\u062a \u0646\u0634\u062f\u0647 \u0627\u0633\u062a',
  financialSummary: '\u062e\u0644\u0627\u0635\u0647 \u0648\u0636\u0639\u06cc\u062a \u0645\u0627\u0644\u06cc',
  itemsSubtotal: '\u062c\u0645\u0639 \u06a9\u0627\u0644\u0627\u0647\u0627',
  totalDiscount: '\u062a\u062e\u0641\u06cc\u0641 \u06a9\u0644',
  totalTax: '\u0645\u0627\u0644\u06cc\u0627\u062a \u06a9\u0644',
  payableAmount: '\u0645\u0628\u0644\u063a \u0642\u0627\u0628\u0644 \u067e\u0631\u062f\u0627\u062e\u062a',
  receivedAmount: '\u062f\u0631\u06cc\u0627\u0641\u062a\u200c\u0634\u062f\u0647',
  remaining: '\u0645\u0627\u0646\u062f\u0647',
  invoiceDescription: '\u062a\u0648\u0636\u06cc\u062d\u0627\u062a \u0641\u0627\u06a9\u062a\u0648\u0631',
  sellerSign: '\u0627\u0645\u0636\u0627\u06cc \u0641\u0631\u0648\u0634\u0646\u062f\u0647',
  buyerSign: '\u0627\u0645\u0636\u0627\u06cc \u062e\u0631\u06cc\u062f\u0627\u0631',
  companyFooter: '\u062a\u0648\u0644\u06cc\u062f\u06cc \u0686\u0631\u0645 \u0645\u0647\u0631\u0628\u0627\u0646\u0648',
  sellerFallback: '\u0641\u0631\u0648\u0634\u0646\u062f\u0647',
  paymentCash: '\u0646\u0642\u062f',
  paymentCard: '\u06a9\u0627\u0631\u062a \u0628\u0647 \u06a9\u0627\u0631\u062a',
  paymentTransfer: '\u0627\u0646\u062a\u0642\u0627\u0644',
  paymentCheque: '\u0686\u06a9',
  paymentOnline: '\u0622\u0646\u0644\u0627\u06cc\u0646',
  statusPending: '\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631',
  statusReceived: '\u062f\u0631\u06cc\u0627\u0641\u062a \u0634\u062f\u0647',
  statusPaid: '\u067e\u0631\u062f\u0627\u062e\u062a \u0634\u062f\u0647',
  statusSettled: '\u062a\u0633\u0648\u06cc\u0647 \u0634\u062f\u0647',
  statusReturned: '\u0639\u0648\u062f\u062a',
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasNumericValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
};

const toDateOnly = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

export const InvoiceCard: React.FC<InvoiceCardProps> = ({
  data,
  formatPersianPrice,
  toPersianNumber,
  safeJalaliFormat,
  relationOptions = {},
  templateId = 'invoice_sales_official',
  customer,
  seller,
  printSize = 'A5',
}) => {
  if (!data) return null;

  const isOfficialTemplate = templateId === 'invoice_sales_official';
  // Keep invoice layout stable for printing regardless of viewport/devtools width.
  const isMobilePrint = false;
  const pageSize = PRINT_PAPER_DIMENSIONS[printSize];

  const getRelationLabel = (fieldKey: string, value: any) => {
    if (!value) return '';
    const options = relationOptions[fieldKey] || [];
    const match = options.find((opt: any) => opt.value === value);
    return match?.name || match?.label || '';
  };

  const paymentTypeLabels: Record<string, string> = {
    cash: L.paymentCash,
    card: L.paymentCard,
    transfer: L.paymentTransfer,
    cheque: L.paymentCheque,
    online: L.paymentOnline,
  };

  const paymentStatusLabels: Record<string, string> = {
    pending: L.statusPending,
    received: L.statusReceived,
    paid: L.statusPaid,
    settled: L.statusSettled,
    returned: L.statusReturned,
  };

  const customerLabel = getRelationLabel('customer_id', data.customer_id) || data.customer_name || data.customer_id || '-';

  const buyer = customer || data.customer || {};
  const buyerFullName = buyer.full_name || `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || customerLabel;
  const buyerBusiness = buyer.business_name || buyer.company || buyer.organization;
  const buyerPhone = buyer.mobile_1 || buyer.phone || buyer.mobile || data.customer_phone;
  const buyerAddress = buyer.address || data.customer_address;
  const buyerCity = buyer.city;
  const buyerProvince = buyer.province;

  const sellerInfo = seller || data.company_settings || {};
  const sellerName = sellerInfo.company_name || sellerInfo.name || L.sellerFallback;
  const sellerFullName = sellerInfo.full_name
    || `${sellerInfo.first_name || ''} ${sellerInfo.last_name || ''}`.trim()
    || sellerInfo.contact_name
    || sellerName;
  const sellerMobile = sellerInfo.mobile;
  const sellerPhone = sellerInfo.phone;
  const sellerAddress = sellerInfo.address;
  const sellerContactSummary = [sellerMobile, sellerPhone].filter(Boolean).join(' - ');

  const getInvoiceItemProductLabel = (item: any) => {
    if (!item) return '-';
    return (
      item.selected_product_name
      || item.product_name
      || item.product?.name
      || getRelationLabel('invoiceItems_product_id', item.product_id)
      || getRelationLabel('product_id', item.product_id)
      || item.product_id
      || '-'
    );
  };

  const invoiceItems = Array.isArray(data.invoiceItems) ? data.invoiceItems : [];
  const calculatedItems = invoiceItems.map((item: any) => {
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price);
    const baseTotal = quantity * unitPrice;

    const discountValue = toNumber(item.discount);
    const discountType = item.discount_type === 'percent' ? 'percent' : 'amount';
    const discountAmount = discountType === 'percent' ? (baseTotal * discountValue) / 100 : discountValue;

    const vatValue = toNumber(item.vat);
    const vatType = item.vat_type === 'amount' ? 'amount' : 'percent';
    const afterDiscount = Math.max(baseTotal - discountAmount, 0);
    const vatAmount = vatType === 'percent' ? (afterDiscount * vatValue) / 100 : vatValue;

    const lineTotal = hasNumericValue(item.total_price) ? toNumber(item.total_price) : afterDiscount + vatAmount;

    return {
      item,
      productLabel: getInvoiceItemProductLabel(item),
      quantity,
      unit: item.unit || item.main_unit || '-',
      unitPrice,
      baseTotal,
      discountValue,
      discountType,
      discountAmount,
      vatValue,
      vatType,
      vatAmount,
      lineTotal,
      afterDiscount,
    };
  });

  const visibleItems = calculatedItems.slice(0, isMobilePrint ? 3 : 5);
  const hiddenItemCount = Math.max(calculatedItems.length - visibleItems.length, 0);

  const subTotal = calculatedItems.reduce((sum: number, row: any) => sum + row.baseTotal, 0);
  const discountTotalFromItems = calculatedItems.reduce((sum: number, row: any) => sum + row.discountAmount, 0);
  const taxTotalFromItems = calculatedItems.reduce((sum: number, row: any) => sum + row.vatAmount, 0);
  const invoiceTotalFromItems = calculatedItems.reduce((sum: number, row: any) => sum + row.lineTotal, 0);

  const totalDiscount = hasNumericValue(data.total_discount) ? toNumber(data.total_discount) : discountTotalFromItems;
  const totalTax = hasNumericValue(data.total_tax) ? toNumber(data.total_tax) : taxTotalFromItems;
  const totalInvoiceAmount = hasNumericValue(data.total_invoice_amount) ? toNumber(data.total_invoice_amount) : invoiceTotalFromItems;
  const totalInvoiceAmountWithoutTax = Math.max(subTotal - totalDiscount, 0);
  const displayInvoiceAmount = isOfficialTemplate ? totalInvoiceAmount : totalInvoiceAmountWithoutTax;

  const receivedStatuses = new Set(['received', 'paid', 'settled', L.statusReceived, L.statusPaid, L.statusSettled]);
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const visiblePayments = payments.slice(0, isMobilePrint ? 3 : 4);
  const hiddenPaymentCount = Math.max(payments.length - visiblePayments.length, 0);
  const receivedAmountFromPayments = payments.reduce((sum: number, row: any) => {
    const status = String(row?.status || '').trim().toLowerCase();
    if (!receivedStatuses.has(status)) return sum;
    return sum + toNumber(row?.amount);
  }, 0);

  const totalReceived = hasNumericValue(data.total_received_amount)
    ? toNumber(data.total_received_amount)
    : receivedAmountFromPayments;

  const fallbackRemaining = Math.max(displayInvoiceAmount - totalReceived, 0);
  const remainingBalance = isOfficialTemplate
    ? (hasNumericValue(data.remaining_balance) ? toNumber(data.remaining_balance) : fallbackRemaining)
    : fallbackRemaining;

  const invoiceDescription = typeof data.description === 'string' ? data.description.trim() : '';
  const invoiceDescriptionText = invoiceDescription || '-';

  const showTaxColumn = isOfficialTemplate;
  const displayRowTotal = (row: any): number => (showTaxColumn ? row.lineTotal : row.afterDiscount);
  const tableItemsTotal = calculatedItems.reduce((sum: number, row: any) => sum + displayRowTotal(row), 0);

  const formatPercentOrAmount = (value: number, type: string): string => {
    if (!value) return type === 'percent' ? `${toPersianNumber('0')}%` : formatPersianPrice(0);
    if (type === 'percent') return `${toPersianNumber(String(value))}%`;
    return formatPersianPrice(value);
  };

  const formatDateValue = (value: any): string => {
    const date = toDateOnly(value);
    if (!date) return '-';
    return toPersianNumber(safeJalaliFormat(date, 'YYYY/MM/DD'));
  };

  const formatPaymentType = (value: any): string => {
    if (!value) return '-';
    return paymentTypeLabels[value] || value;
  };

  const formatPaymentStatus = (value: any): string => {
    if (!value) return '-';
    return paymentStatusLabels[value] || value;
  };

  const buyerInfoItems: Array<{ label: string; value: string }> = [
    { label: L.buyerName, value: buyerFullName || customerLabel || '-' },
  ];
  if (buyerBusiness) buyerInfoItems.push({ label: L.businessName, value: buyerBusiness });
  if (buyerPhone) buyerInfoItems.push({ label: L.phone, value: buyerPhone });

  const buyerAddressValue = [buyerProvince, buyerCity, buyerAddress].filter(Boolean).join('\u060c ');
  if (buyerAddressValue) buyerInfoItems.push({ label: L.address, value: buyerAddressValue });

  const sellerInfoItems: Array<{ label: string; value: string }> = [
    { label: L.buyerName, value: sellerFullName || '-' },
    { label: L.phone, value: sellerContactSummary || '-' },
  ];
  if (isOfficialTemplate) sellerInfoItems.push({ label: L.address, value: sellerAddress || '-' });

  const invoiceInfoItems: Array<{ label: string; value: string }> = [
    { label: L.invoiceNumber, value: String(data.system_code || data.name || '-') },
    { label: L.invoiceDate, value: formatDateValue(data.invoice_date) },
  ];

  return (
    <div
      className="print-card invoice-print-card"
      style={{
        width: `${pageSize.widthMm}mm`,
        minHeight: `${pageSize.heightMm}mm`,
        padding: isMobilePrint ? '8px' : '10px',
        display: 'flex',
        flexDirection: 'column',
        fontSize: isMobilePrint ? '6px' : '7px',
      }}
    >
      <div style={{ textAlign: 'right', paddingBottom: isMobilePrint ? '6px' : '8px', borderBottom: '2px solid #c58f60', marginBottom: isMobilePrint ? '6px' : '8px', lineHeight: '1.3' }}>
        <div style={{ fontSize: isMobilePrint ? '12px' : '15px', fontWeight: 'bold', color: '#c58f60', marginBottom: '2px' }}>
          {L.invoiceTitle}
        </div>
        <div style={{ fontSize: isMobilePrint ? '7px' : '8px', color: '#666' }}>{data.system_code || data.name || '-'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobilePrint ? '1fr' : '1fr 1fr 0.65fr', gap: isMobilePrint ? '5px' : '8px', marginBottom: isMobilePrint ? '6px' : '8px', lineHeight: '1.4' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '2px' }}>{L.buyerInfo}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', border: '1px solid #ececec', borderRadius: '4px', padding: '4px', fontSize: isMobilePrint ? '5.5px' : '6.5px' }}>
            {buyerInfoItems.map((entry, index) => (
              <div key={`buyer-${index}`} style={{ display: 'flex', alignItems: 'baseline', gap: '2px', padding: '2px 4px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '3px', maxWidth: '100%' }}>
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{entry.label}:</span>
                <span style={{ wordBreak: 'break-word' }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '2px' }}>{L.sellerInfo}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', border: '1px solid #ececec', borderRadius: '4px', padding: '4px', fontSize: isMobilePrint ? '5.5px' : '6.5px' }}>
            {sellerInfoItems.map((entry, index) => (
              <div key={`seller-${index}`} style={{ display: 'flex', alignItems: 'baseline', gap: '2px', padding: '2px 4px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '3px', maxWidth: '100%' }}>
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{entry.label}:</span>
                <span style={{ wordBreak: 'break-word' }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '2px' }}>{L.invoiceInfo}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #ececec', borderRadius: '4px', padding: '4px', fontSize: isMobilePrint ? '5.5px' : '6.5px' }}>
            {invoiceInfoItems.map((entry, index) => (
              <div key={`invoice-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', padding: '3px 4px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '3px' }}>
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{entry.label}:</span>
                <span style={{ textAlign: 'left', wordBreak: 'break-word' }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: isMobilePrint ? '6px' : '8px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '3px', textAlign: 'right' }}>{L.items}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd', fontSize: isMobilePrint ? '5.5px' : '6.5px' }}>
          <thead>
            <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #c58f60' }}>
              <th style={{ padding: '3px', width: '5%', borderRight: '1px solid #ddd' }}>{L.row}</th>
              <th style={{ padding: '3px', width: showTaxColumn ? '28%' : '31%', borderRight: '1px solid #ddd' }}>{L.product}</th>
              <th style={{ padding: '3px', width: '8%', borderRight: '1px solid #ddd' }}>{L.unit}</th>
              <th style={{ padding: '3px', width: '9%', borderRight: '1px solid #ddd' }}>{L.quantity}</th>
              <th style={{ padding: '3px', width: '14%', borderRight: '1px solid #ddd' }}>{L.unitPrice}</th>
              <th style={{ padding: '3px', width: '12%', borderRight: '1px solid #ddd' }}>{L.discount}</th>
              {showTaxColumn && <th style={{ padding: '3px', width: '12%', borderRight: '1px solid #ddd' }}>{L.tax}</th>}
              <th style={{ padding: '3px', width: showTaxColumn ? '12%' : '21%' }}>{L.total}</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length > 0 ? (
              visibleItems.map((row: any, index: number) => (
                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>{toPersianNumber(String(index + 1))}</td>
                  <td style={{ padding: '2px', textAlign: 'right', borderRight: '1px solid #eee' }}>{row.productLabel}</td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>{row.unit}</td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>{toPersianNumber(String(row.item.quantity ?? row.quantity))}</td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>{formatPersianPrice(row.unitPrice)}</td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>{formatPercentOrAmount(row.discountValue, row.discountType)}</td>
                  {showTaxColumn && <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>{formatPercentOrAmount(row.vatValue, row.vatType)}</td>}
                  <td style={{ padding: '2px', textAlign: 'center', fontWeight: 'bold' }}>{formatPersianPrice(displayRowTotal(row))}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={showTaxColumn ? 8 : 7} style={{ padding: '6px', textAlign: 'center', color: '#999' }}>{L.noItems}</td>
              </tr>
            )}
            {hiddenItemCount > 0 && (
              <tr>
                <td colSpan={showTaxColumn ? 8 : 7} style={{ padding: '3px', textAlign: 'center', color: '#666', background: '#fafafa' }}>
                  {toPersianNumber(String(hiddenItemCount))} {L.hiddenRowsSuffix}
                </td>
              </tr>
            )}
            {visibleItems.length > 0 && (
              <tr style={{ borderTop: '1px solid #c58f60', background: '#fafaf5' }}>
                <td colSpan={5} style={{ padding: '3px 4px', textAlign: 'left', borderRight: '1px solid #eee', fontWeight: 'bold' }}>{L.itemsSummary}</td>
                <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #eee' }}>{formatPersianPrice(discountTotalFromItems)}</td>
                {showTaxColumn && <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #eee' }}>{formatPersianPrice(taxTotalFromItems)}</td>}
                <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>{formatPersianPrice(tableItemsTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobilePrint ? '1fr' : '1.25fr 0.75fr', gap: isMobilePrint ? '5px' : '8px', marginBottom: isMobilePrint ? '6px' : '8px' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ padding: '4px 6px', background: '#f5f5f5', fontWeight: 'bold', textAlign: 'right' }}>{L.paymentsTable}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobilePrint ? '5.5px' : '6px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '3px', width: '23%', borderRight: '1px solid #eee' }}>{L.invoiceDate.replace('\u0641\u0627\u06a9\u062a\u0648\u0631', '')}</th>
                <th style={{ padding: '3px', width: '26%', borderRight: '1px solid #eee' }}>{L.paymentType}</th>
                <th style={{ padding: '3px', width: '24%', borderRight: '1px solid #eee' }}>{L.paymentStatus}</th>
                <th style={{ padding: '3px', width: '27%' }}>{L.amount}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.length > 0 ? (
                visiblePayments.map((payment: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f3f3' }}>
                    <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #f3f3f3' }}>{formatDateValue(payment?.date)}</td>
                    <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #f3f3f3' }}>{formatPaymentType(payment?.payment_type)}</td>
                    <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #f3f3f3' }}>{formatPaymentStatus(payment?.status)}</td>
                    <td style={{ padding: '2px', textAlign: 'center', fontWeight: 'bold' }}>{formatPersianPrice(toNumber(payment?.amount))}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: '5px', textAlign: 'center', color: '#999' }}>{L.noPayments}</td>
                </tr>
              )}
              {hiddenPaymentCount > 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '3px', textAlign: 'center', color: '#666', background: '#fafafa' }}>
                    {toPersianNumber(String(hiddenPaymentCount))} {L.hiddenRowsSuffix}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '6px', background: '#f9f9f9', textAlign: 'right', lineHeight: '1.6', fontSize: isMobilePrint ? '5.5px' : '6.5px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{L.financialSummary}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}><span>{L.itemsSubtotal}:</span><strong>{formatPersianPrice(subTotal)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#b45309' }}><span>{L.totalDiscount}:</span><span>{formatPersianPrice(totalDiscount)}</span></div>
          {showTaxColumn && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#065f46' }}><span>{L.totalTax}:</span><span>{formatPersianPrice(totalTax)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', borderTop: '1px dashed #ddd', paddingTop: '3px' }}><span>{L.payableAmount}:</span><strong>{formatPersianPrice(displayInvoiceAmount)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}><span>{L.receivedAmount}:</span><span>{formatPersianPrice(totalReceived)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ddd', paddingTop: '3px', color: '#7f1d1d', fontWeight: 'bold' }}><span>{L.remaining}:</span><span>{formatPersianPrice(remainingBalance)}</span></div>
        </div>
      </div>

      <div style={{ marginBottom: isMobilePrint ? '5px' : '7px', border: '1px solid #e5e5e5', borderRadius: '4px', padding: '5px 6px', textAlign: 'right', background: '#fcfcfc', lineHeight: '1.6' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{L.invoiceDescription}</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{invoiceDescriptionText}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobilePrint ? '6px' : '10px', marginBottom: isMobilePrint ? '5px' : '7px' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '6px', textAlign: 'center' }}><div style={{ fontWeight: 'bold', marginBottom: '10px' }}>{L.sellerSign}</div><div style={{ height: isMobilePrint ? '20px' : '26px' }} /></div>
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '6px', textAlign: 'center' }}><div style={{ fontWeight: 'bold', marginBottom: '10px' }}>{L.buyerSign}</div><div style={{ height: isMobilePrint ? '20px' : '26px' }} /></div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #ddd', textAlign: 'center', fontSize: isMobilePrint ? '5.5px' : '6.5px', color: '#999', lineHeight: '1.2' }}>
        {L.companyFooter}
      </div>
    </div>
  );
};

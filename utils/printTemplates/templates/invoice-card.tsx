import React from 'react';

interface InvoiceCardProps {
  data: any;
  formatPersianPrice: (price: number) => string;
  toPersianNumber: (str: string) => string;
  safeJalaliFormat: (date: any, format: string) => string;
  relationOptions?: Record<string, any[]>;
  templateId?: string; // invoice_sales_official | invoice_sales_simple
  customer?: any;
  seller?: any;
}

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
}) => {
  if (!data) return null;

  const isOfficialTemplate = templateId === 'invoice_sales_official';
  const isMobilePrint = typeof window !== 'undefined' && window.innerWidth < 768;

  const getRelationLabel = (fieldKey: string, value: any) => {
    if (!value) return '';
    const options = relationOptions[fieldKey] || [];
    const match = options.find((opt: any) => opt.value === value);
    return match?.name || match?.label || '';
  };

  const paymentTypeLabels: Record<string, string> = {
    cash: 'نقد',
    card: 'کارت به کارت',
    transfer: 'انتقال',
    cheque: 'چک',
    online: 'آنلاین',
  };

  const paymentStatusLabels: Record<string, string> = {
    pending: 'در انتظار',
    received: 'دریافت شده',
    paid: 'پرداخت شده',
    settled: 'تسویه شده',
    returned: 'عودت',
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
  const sellerName = sellerInfo.company_name || sellerInfo.name || 'فروشنده';
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

  const receivedStatuses = new Set(['received', 'paid', 'settled', 'دریافت شده', 'پرداخت شده', 'تسویه شده']);
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
    if (!value) return type === 'percent' ? '۰٪' : formatPersianPrice(0);
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
    { label: 'نام و نام خانوادگی', value: buyerFullName || customerLabel || '-' },
  ];
  if (buyerBusiness) buyerInfoItems.push({ label: 'نام کسب و کار', value: buyerBusiness });
  if (buyerPhone) buyerInfoItems.push({ label: 'شماره تماس', value: buyerPhone });

  const buyerAddressValue = [buyerProvince, buyerCity, buyerAddress].filter(Boolean).join('، ');
  if (buyerAddressValue) buyerInfoItems.push({ label: 'آدرس', value: buyerAddressValue });

  const sellerInfoItems: Array<{ label: string; value: string }> = [
    { label: 'نام و نام خانوادگی', value: sellerFullName || '-' },
    { label: 'شماره تماس', value: sellerContactSummary || '-' },
  ];
  if (isOfficialTemplate) sellerInfoItems.push({ label: 'آدرس', value: sellerAddress || '-' });

  const invoiceInfoItems: Array<{ label: string; value: string }> = [
    { label: 'شماره فاکتور', value: String(data.system_code || data.name || '-') },
    { label: 'تاریخ فاکتور', value: formatDateValue(data.invoice_date) },
  ];

  return (
    <div
      className="print-card invoice-print-card"
      style={{
        width: '148mm',
        minHeight: '210mm',
        padding: isMobilePrint ? '8px' : '10px',
        display: 'flex',
        flexDirection: 'column',
        fontSize: isMobilePrint ? '6px' : '7px',
      }}
    >
      <div
        style={{
          textAlign: 'right',
          paddingBottom: isMobilePrint ? '6px' : '8px',
          borderBottom: '2px solid #c58f60',
          marginBottom: isMobilePrint ? '6px' : '8px',
          lineHeight: '1.3',
        }}
      >
        <div
          style={{
            fontSize: isMobilePrint ? '12px' : '15px',
            fontWeight: 'bold',
            color: '#c58f60',
            marginBottom: '2px',
          }}
        >
          فاکتور فروش
        </div>
        <div style={{ fontSize: isMobilePrint ? '7px' : '8px', color: '#666' }}>
          {data.system_code || data.name || '-'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobilePrint ? '1fr' : '1fr 1fr 0.65fr',
          gap: isMobilePrint ? '5px' : '8px',
          marginBottom: isMobilePrint ? '6px' : '8px',
          lineHeight: '1.4',
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '2px' }}>مشخصات خریدار</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              border: '1px solid #ececec',
              borderRadius: '4px',
              padding: '4px',
              fontSize: isMobilePrint ? '5.5px' : '6.5px',
            }}
          >
            {buyerInfoItems.map((entry, index) => (
              <div
                key={`buyer-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '2px',
                  padding: '2px 4px',
                  background: '#fafafa',
                  border: '1px solid #f0f0f0',
                  borderRadius: '3px',
                  maxWidth: '100%',
                }}
              >
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{entry.label}:</span>
                <span style={{ wordBreak: 'break-word' }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '2px' }}>مشخصات فروشنده</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              border: '1px solid #ececec',
              borderRadius: '4px',
              padding: '4px',
              fontSize: isMobilePrint ? '5.5px' : '6.5px',
            }}
          >
            {sellerInfoItems.map((entry, index) => (
              <div
                key={`seller-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '2px',
                  padding: '2px 4px',
                  background: '#fafafa',
                  border: '1px solid #f0f0f0',
                  borderRadius: '3px',
                  maxWidth: '100%',
                }}
              >
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{entry.label}:</span>
                <span style={{ wordBreak: 'break-word' }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '2px' }}>اطلاعات فاکتور</div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              border: '1px solid #ececec',
              borderRadius: '4px',
              padding: '4px',
              fontSize: isMobilePrint ? '5.5px' : '6.5px',
            }}
          >
            {invoiceInfoItems.map((entry, index) => (
              <div
                key={`invoice-${index}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '4px',
                  padding: '3px 4px',
                  background: '#fafafa',
                  border: '1px solid #f0f0f0',
                  borderRadius: '3px',
                }}
              >
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{entry.label}:</span>
                <span style={{ textAlign: 'left', wordBreak: 'break-word' }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: isMobilePrint ? '6px' : '8px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '3px', textAlign: 'right' }}>اقلام فاکتور</div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #ddd',
            fontSize: isMobilePrint ? '5.5px' : '6.5px',
          }}
        >
          <thead>
            <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #c58f60' }}>
              <th style={{ padding: '3px', width: '5%', borderRight: '1px solid #ddd' }}>ردیف</th>
              <th style={{ padding: '3px', width: showTaxColumn ? '28%' : '31%', borderRight: '1px solid #ddd' }}>محصول</th>
              <th style={{ padding: '3px', width: '8%', borderRight: '1px solid #ddd' }}>واحد</th>
              <th style={{ padding: '3px', width: '9%', borderRight: '1px solid #ddd' }}>تعداد</th>
              <th style={{ padding: '3px', width: '14%', borderRight: '1px solid #ddd' }}>قیمت واحد</th>
              <th style={{ padding: '3px', width: '12%', borderRight: '1px solid #ddd' }}>تخفیف</th>
              {showTaxColumn && (
                <th style={{ padding: '3px', width: '12%', borderRight: '1px solid #ddd' }}>مالیات</th>
              )}
              <th style={{ padding: '3px', width: showTaxColumn ? '12%' : '21%' }}>جمع</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length > 0 ? (
              visibleItems.map((row: any, index: number) => (
                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>
                    {toPersianNumber(String(index + 1))}
                  </td>
                  <td style={{ padding: '2px', textAlign: 'right', borderRight: '1px solid #eee' }}>{row.productLabel}</td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>{row.unit}</td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>
                    {toPersianNumber(String(row.item.quantity ?? row.quantity))}
                  </td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>
                    {formatPersianPrice(row.unitPrice)}
                  </td>
                  <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>
                    {formatPercentOrAmount(row.discountValue, row.discountType)}
                  </td>
                  {showTaxColumn && (
                    <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #eee' }}>
                      {formatPercentOrAmount(row.vatValue, row.vatType)}
                    </td>
                  )}
                  <td style={{ padding: '2px', textAlign: 'center', fontWeight: 'bold' }}>
                    {formatPersianPrice(displayRowTotal(row))}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={showTaxColumn ? 8 : 7} style={{ padding: '6px', textAlign: 'center', color: '#999' }}>
                  موردی وجود ندارد
                </td>
              </tr>
            )}
            {hiddenItemCount > 0 && (
              <tr>
                <td colSpan={showTaxColumn ? 8 : 7} style={{ padding: '3px', textAlign: 'center', color: '#666', background: '#fafafa' }}>
                  {toPersianNumber(String(hiddenItemCount))} ردیف دیگر در سیستم ثبت شده است.
                </td>
              </tr>
            )}
            {visibleItems.length > 0 && (
              <tr style={{ borderTop: '1px solid #c58f60', background: '#fafaf5' }}>
                <td
                  colSpan={showTaxColumn ? 7 : 6}
                  style={{ padding: '3px 4px', textAlign: 'left', borderRight: '1px solid #eee', fontWeight: 'bold' }}
                >
                  جمع اقلام
                </td>
                <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>
                  {formatPersianPrice(tableItemsTotal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobilePrint ? '1fr' : '1.25fr 0.75fr',
          gap: isMobilePrint ? '5px' : '8px',
          marginBottom: isMobilePrint ? '6px' : '8px',
        }}
      >
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ padding: '4px 6px', background: '#f5f5f5', fontWeight: 'bold', textAlign: 'right' }}>
            جدول دریافتی‌ها
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobilePrint ? '5.5px' : '6px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '3px', width: '23%', borderRight: '1px solid #eee' }}>تاریخ</th>
                <th style={{ padding: '3px', width: '26%', borderRight: '1px solid #eee' }}>نوع</th>
                <th style={{ padding: '3px', width: '24%', borderRight: '1px solid #eee' }}>وضعیت</th>
                <th style={{ padding: '3px', width: '27%' }}>مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.length > 0 ? (
                visiblePayments.map((payment: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f3f3' }}>
                    <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #f3f3f3' }}>
                      {formatDateValue(payment?.date)}
                    </td>
                    <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #f3f3f3' }}>
                      {formatPaymentType(payment?.payment_type)}
                    </td>
                    <td style={{ padding: '2px', textAlign: 'center', borderRight: '1px solid #f3f3f3' }}>
                      {formatPaymentStatus(payment?.status)}
                    </td>
                    <td style={{ padding: '2px', textAlign: 'center', fontWeight: 'bold' }}>
                      {formatPersianPrice(toNumber(payment?.amount))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: '5px', textAlign: 'center', color: '#999' }}>
                    دریافتی ثبت نشده است
                  </td>
                </tr>
              )}
              {hiddenPaymentCount > 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '3px', textAlign: 'center', color: '#666', background: '#fafafa' }}>
                    {toPersianNumber(String(hiddenPaymentCount))} ردیف دیگر ثبت شده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '6px',
            background: '#f9f9f9',
            textAlign: 'right',
            lineHeight: '1.6',
            fontSize: isMobilePrint ? '5.5px' : '6.5px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>خلاصه وضعیت مالی</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>جمع کالاها:</span>
            <strong>{formatPersianPrice(subTotal)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#b45309' }}>
            <span>تخفیف کل:</span>
            <span>{formatPersianPrice(totalDiscount)}</span>
          </div>
          {showTaxColumn && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#065f46' }}>
              <span>مالیات کل:</span>
              <span>{formatPersianPrice(totalTax)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', borderTop: '1px dashed #ddd', paddingTop: '3px' }}>
            <span>مبلغ قابل پرداخت:</span>
            <strong>{formatPersianPrice(displayInvoiceAmount)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>دریافت‌شده:</span>
            <span>{formatPersianPrice(totalReceived)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid #ddd',
              paddingTop: '3px',
              color: '#7f1d1d',
              fontWeight: 'bold',
            }}
          >
            <span>مانده:</span>
            <span>{formatPersianPrice(remainingBalance)}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          marginBottom: isMobilePrint ? '5px' : '7px',
          border: '1px solid #e5e5e5',
          borderRadius: '4px',
          padding: '5px 6px',
          textAlign: 'right',
          background: '#fcfcfc',
          lineHeight: '1.6',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>توضیحات فاکتور</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{invoiceDescriptionText}</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: isMobilePrint ? '6px' : '10px',
          marginBottom: isMobilePrint ? '5px' : '7px',
        }}
      >
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '6px', textAlign: 'center' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>امضای فروشنده</div>
          <div style={{ height: isMobilePrint ? '20px' : '26px' }} />
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '6px', textAlign: 'center' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>امضای خریدار</div>
          <div style={{ height: isMobilePrint ? '20px' : '26px' }} />
        </div>
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: '6px',
          borderTop: '1px solid #ddd',
          textAlign: 'center',
          fontSize: isMobilePrint ? '5.5px' : '6.5px',
          color: '#999',
          lineHeight: '1.2',
        }}
      >
        تولیدی چرم مهربانو
      </div>
    </div>
  );
};
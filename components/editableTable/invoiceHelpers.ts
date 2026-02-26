const normalizeNumericInput = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
};

const toSafeNumber = (raw: any) => {
  const normalized = normalizeNumericInput(raw);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getInvoiceAmounts = (row: any) => {
  const qty = toSafeNumber(row.quantity) || 0;
  const price = toSafeNumber(row.unit_price) || 0;
  const baseTotal = qty * price;
  const discountInput = toSafeNumber(row.discount) || 0;
  const vatInput = toSafeNumber(row.vat) || 0;
  const discountType = row.discount_type || 'amount';
  const vatType = row.vat_type || 'percent';
  const discountAmount = discountType === 'percent' ? baseTotal * (discountInput / 100) : discountInput;
  const afterDiscount = baseTotal - discountAmount;
  const vatAmount = vatType === 'percent' ? afterDiscount * (vatInput / 100) : vatInput;
  return { discountAmount, vatAmount };
};

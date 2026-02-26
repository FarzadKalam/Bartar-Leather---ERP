import { RowCalculationType, SummaryCalculationType, BlockType } from '../types';

const normalizeNumericInput = (raw: any): string => {
    if (raw === null || raw === undefined) return '';
    return String(raw)
        .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
        .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[\u066C\u060C]/g, ',')
        .replace(/\s+/g, '')
        .replace(/,/g, '');
};

const toSafeNumber = (raw: any): number => {
    const normalized = normalizeNumericInput(raw);
    if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateRow = (row: any, type: RowCalculationType = RowCalculationType.SIMPLE_MULTIPLY) => {
    const lengthVal = toSafeNumber(row.length);
    const widthVal = toSafeNumber(row.width);
    const areaUsage = Number.isFinite(lengthVal) && Number.isFinite(widthVal) ? lengthVal * widthVal : null;
    const qty = toSafeNumber(row.quantity)
        || toSafeNumber(row.usage)
        || (areaUsage !== null ? areaUsage : 0)
        || toSafeNumber(row.qty)
        || toSafeNumber(row.stock)
        || 0;
    const price = toSafeNumber(row.unit_price) || toSafeNumber(row.buy_price) || toSafeNumber(row.price) || 0;
    
    let baseTotal = qty * price;

    // محاسبات فاکتور
    if (type === RowCalculationType.INVOICE_ROW) {
        // اصلاح مهم: مالیات به عنوان درصد در نظر گرفته می‌شود
        // مثال: اگر vat = 9 باشد، یعنی 9 درصد
        let discountInput = toSafeNumber(row.discount) || 0;
        let vatInput = toSafeNumber(row.vat) || 0;

        const discountType = row.discount_type || 'amount';
        const vatType = row.vat_type || 'percent';

        const discountAmount = discountType === 'percent'
            ? baseTotal * (discountInput / 100)
            : discountInput;

        const afterDiscount = baseTotal - discountAmount;

        const vatAmount = vatType === 'percent'
            ? afterDiscount * (vatInput / 100)
            : vatInput;

        return afterDiscount + vatAmount;
    }

    // محاسبات ساده (BOM)
    return baseTotal;
};

export const calculateSummary = (data: any, blocks: any[], summaryConfig: any) => {
    const type = summaryConfig?.calculationType || SummaryCalculationType.SUM_ALL_ROWS;

    // حالت فاکتور
    if (type === SummaryCalculationType.INVOICE_FINANCIALS) {
        const invoiceBlock = blocks.find((b: any) => b.rowCalculationType === RowCalculationType.INVOICE_ROW) || blocks.find((b: any) => b.id === 'invoiceItems');
        const items = data[invoiceBlock?.id || 'invoiceItems'] || [];
        
        const totalInvoice = items.reduce((sum: number, item: any) => {
            return sum + (toSafeNumber(item.total_price) || calculateRow(item, RowCalculationType.INVOICE_ROW));
        }, 0);

        const paymentBlock = blocks.find((b: any) => b.id === 'payments');
        const payments = data[paymentBlock?.id || 'payments'] || [];
        
        const totalReceived = payments.reduce((sum: number, item: any) => {
            if (item?.status !== 'received') return sum;
            return sum + (toSafeNumber(item.amount) || 0);
        }, 0);

        return {
            total: totalInvoice,
            received: totalReceived,
            remaining: totalInvoice - totalReceived
        };
    }

    // حالت پیش‌فرض (BOM)
    let grandTotal = 0;
    blocks.forEach((block: any) => {
        if (block.type === BlockType.TABLE) {
            const rows = data[block.id] || [];
            if (Array.isArray(rows)) {
                rows.forEach((row: any) => {
                    grandTotal += (toSafeNumber(row.total_price) || calculateRow(row, block.rowCalculationType));
                });
            }
        }

        if (block.type === BlockType.GRID_TABLE) {
            const grids = data[block.id] || [];
            if (Array.isArray(grids)) {
                grids.forEach((grid: any) => {
                    const pieces = grid?.pieces || [];
                    if (Array.isArray(pieces)) {
                        pieces.forEach((piece: any) => {
                            grandTotal += toSafeNumber(piece?.total_cost) || toSafeNumber(piece?.cost_per_item) || 0;
                        });
                    }
                });
            }
        }
    });

    return { total: grandTotal };
};

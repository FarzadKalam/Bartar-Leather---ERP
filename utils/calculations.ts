import { RowCalculationType, SummaryCalculationType, BlockType } from '../types';

export const calculateRow = (row: any, type: RowCalculationType = RowCalculationType.SIMPLE_MULTIPLY) => {
    const qty = parseFloat(row.quantity) || parseFloat(row.usage) || parseFloat(row.qty) || 0;
    const price = parseFloat(row.unit_price) || parseFloat(row.buy_price) || parseFloat(row.price) || 0;
    
    let baseTotal = qty * price;

    // محاسبات فاکتور
    if (type === RowCalculationType.INVOICE_ROW) {
        // اصلاح مهم: مالیات به عنوان درصد در نظر گرفته می‌شود
        // مثال: اگر vat = 9 باشد، یعنی 9 درصد
        let discountInput = parseFloat(row.discount) || 0;
        let vatInput = parseFloat(row.vat) || 0;

        // محاسبه تخفیف (اگر زیر 100 باشد درصد، وگرنه مبلغ)
        // البته برای اطمینان می‌توانید فیلد جداگانه‌ای داشته باشید، ولی این روش هوشمند فعلا کار را راه می‌اندازد
        let discountAmount = discountInput;
        // اگر تخفیف درصد بود:
        // if (discountInput <= 100 && discountInput > 0) discountAmount = baseTotal * (discountInput / 100);
        
        let afterDiscount = baseTotal - discountAmount;

        // محاسبه مالیات (همیشه درصد از مبلغ بعد از تخفیف)
        let vatAmount = afterDiscount * (vatInput / 100);

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
            return sum + (parseFloat(item.total_price) || calculateRow(item, RowCalculationType.INVOICE_ROW));
        }, 0);

        const paymentBlock = blocks.find((b: any) => b.id === 'payments');
        const payments = data[paymentBlock?.id || 'payments'] || [];
        
        const totalReceived = payments.reduce((sum: number, item: any) => {
            return sum + (parseFloat(item.amount) || 0);
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
                    grandTotal += (parseFloat(row.total_price) || calculateRow(row, block.rowCalculationType));
                });
            }
        }
    });

    return { total: grandTotal };
};
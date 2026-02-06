import React from 'react';

interface InvoiceCardProps {
  data: any;
  formatPersianPrice: (price: number) => string;
  toPersianNumber: (str: string) => string;
  safeJalaliFormat: (date: any, format: string) => string;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({
  data,
  formatPersianPrice,
  toPersianNumber,
  safeJalaliFormat,
}) => {
  if (!data) return null;

  const isMobilePrint = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div 
      className="print-card invoice-print-card" 
      style={{ 
        width: '148mm', 
        height: '210mm', 
        padding: isMobilePrint ? '8px' : '12px',
        display: 'flex',
        flexDirection: 'column',
        fontSize: isMobilePrint ? '7px' : '8px'
      }}
    >
      {/* هدر */}
      <div 
        style={{ 
          textAlign: 'right', 
          paddingBottom: isMobilePrint ? '8px' : '12px', 
          borderBottom: '2px solid #c58f60', 
          marginBottom: isMobilePrint ? '8px' : '12px',
          lineHeight: '1.3'
        }}
      >
        <div style={{ 
          fontSize: isMobilePrint ? '13px' : '16px', 
          fontWeight: 'bold', 
          color: '#c58f60', 
          marginBottom: '2px' 
        }}>
          فاکتور فروش
        </div>
        <div style={{ 
          fontSize: isMobilePrint ? '8px' : '10px', 
          color: '#666' 
        }}>
          {data.system_code || data.name || '-'}
        </div>
      </div>

      {/* اطلاعات مشتری و فاکتور - 2 ستون */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: isMobilePrint ? '6px' : '12px', 
          margin: isMobilePrint ? '8px 0' : '12px 0',
          fontSize: isMobilePrint ? '7px' : '8px',
          lineHeight: '1.4'
        }}
      >
        {/* سمت راست: اطلاعات مشتری */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ 
            fontWeight: 'bold', 
            color: '#333', 
            marginBottom: isMobilePrint ? '2px' : '3px',
            fontSize: isMobilePrint ? '7px' : '8px'
          }}>
            مشتری
          </div>
          <table style={{ 
            width: '100%', 
            fontSize: isMobilePrint ? '6.5px' : '7.5px',
            borderCollapse: 'collapse'
          }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ fontWeight: 'bold', width: '30%', padding: isMobilePrint ? '1px' : '2px' }}>نام:</td>
                <td style={{ paddingRight: isMobilePrint ? '2px' : '4px', padding: isMobilePrint ? '1px' : '2px' }}>
                  {data.customer_name || data.customer_id || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', padding: isMobilePrint ? '1px' : '2px' }}>تاریخ:</td>
                <td style={{ paddingRight: isMobilePrint ? '2px' : '4px', padding: isMobilePrint ? '1px' : '2px' }}>
                  {data.invoice_date ? toPersianNumber(safeJalaliFormat(data.invoice_date, 'YYYY/MM/DD')) : '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* سمت چپ: اطلاعات فاکتور */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ 
            fontWeight: 'bold', 
            color: '#333', 
            marginBottom: isMobilePrint ? '2px' : '3px',
            fontSize: isMobilePrint ? '7px' : '8px'
          }}>
            اطلاعات
          </div>
          <table style={{ 
            width: '100%', 
            fontSize: isMobilePrint ? '6.5px' : '7.5px',
            borderCollapse: 'collapse'
          }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ fontWeight: 'bold', width: '30%', padding: isMobilePrint ? '1px' : '2px' }}>شماره:</td>
                <td style={{ paddingRight: isMobilePrint ? '2px' : '4px', padding: isMobilePrint ? '1px' : '2px' }}>
                  {data.name || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', padding: isMobilePrint ? '1px' : '2px' }}>وضعیت:</td>
                <td style={{ paddingRight: isMobilePrint ? '2px' : '4px', padding: isMobilePrint ? '1px' : '2px' }}>
                  {data.status || '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* جدول اقلام */}
      <div style={{ 
        margin: isMobilePrint ? '6px 0' : '10px 0', 
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          fontSize: isMobilePrint ? '6px' : '7.5px',
          border: '1px solid #ddd'
        }}>
          <thead>
            <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #c58f60' }}>
              <th style={{ 
                padding: isMobilePrint ? '2px' : '4px', 
                textAlign: 'right', 
                fontWeight: 'bold', 
                width: '45%',
                borderRight: '1px solid #ddd',
                fontSize: isMobilePrint ? '6px' : '7px'
              }}>محصول</th>
              <th style={{ 
                padding: isMobilePrint ? '2px' : '4px', 
                textAlign: 'center', 
                fontWeight: 'bold', 
                width: '15%',
                borderRight: '1px solid #ddd',
                fontSize: isMobilePrint ? '6px' : '7px'
              }}>تعداد</th>
              <th style={{ 
                padding: isMobilePrint ? '2px' : '4px', 
                textAlign: 'center', 
                fontWeight: 'bold', 
                width: '20%',
                borderRight: '1px solid #ddd',
                fontSize: isMobilePrint ? '6px' : '7px'
              }}>قیمت</th>
              <th style={{ 
                padding: isMobilePrint ? '2px' : '4px', 
                textAlign: 'center', 
                fontWeight: 'bold', 
                width: '20%',
                fontSize: isMobilePrint ? '6px' : '7px'
              }}>جمع</th>
            </tr>
          </thead>
          <tbody>
            {data.invoiceItems && Array.isArray(data.invoiceItems) && data.invoiceItems.length > 0 ? (
              data.invoiceItems.slice(0, isMobilePrint ? 4 : 6).map((item: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ 
                    padding: isMobilePrint ? '1px 2px' : '3px 4px', 
                    textAlign: 'right', 
                    borderRight: '1px solid #eee',
                    wordBreak: 'break-word',
                    fontSize: isMobilePrint ? '6px' : '7px'
                  }}>
                    {item.product_name || item.product_id || '-'}
                  </td>
                  <td style={{ 
                    padding: isMobilePrint ? '1px 2px' : '3px 4px', 
                    textAlign: 'center', 
                    borderRight: '1px solid #eee',
                    fontSize: isMobilePrint ? '6px' : '7px'
                  }}>
                    {toPersianNumber(String(item.quantity || 0))}
                  </td>
                  <td style={{ 
                    padding: isMobilePrint ? '1px 2px' : '3px 4px', 
                    textAlign: 'center', 
                    borderRight: '1px solid #eee',
                    fontSize: isMobilePrint ? '6px' : '7px'
                  }}>
                    {formatPersianPrice(item.unit_price || 0)}
                  </td>
                  <td style={{ 
                    padding: isMobilePrint ? '1px 2px' : '3px 4px', 
                    textAlign: 'center', 
                    fontWeight: 'bold',
                    fontSize: isMobilePrint ? '6px' : '7px'
                  }}>
                    {formatPersianPrice((item.quantity || 0) * (item.unit_price || 0))}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ 
                  padding: isMobilePrint ? '4px' : '8px', 
                  textAlign: 'center', 
                  color: '#999',
                  fontSize: isMobilePrint ? '6px' : '7px'
                }}>
                  موردی وجود ندارد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* خلاصه مالی */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: isMobilePrint ? '6px' : '8px', 
        margin: isMobilePrint ? '6px 0' : '8px 0',
        padding: isMobilePrint ? '6px' : '8px',
        background: '#f9f9f9',
        borderRadius: '4px',
        fontSize: isMobilePrint ? '6.5px' : '7.5px'
      }}>
        {/* سمت راست: محاسبات */}
        <div style={{ textAlign: 'right', lineHeight: '1.4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isMobilePrint ? '2px' : '3px', gap: '2px' }}>
            <span>جمع:</span>
            <span style={{ fontWeight: 'bold', fontSize: isMobilePrint ? '6px' : '7px' }}>
              {formatPersianPrice(data.total_invoice_amount || 0)}
            </span>
          </div>
          {data.total_discount && data.total_discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isMobilePrint ? '2px' : '3px', color: '#d97706', gap: '2px' }}>
              <span>تخفیف:</span>
              <span style={{ fontSize: isMobilePrint ? '6px' : '7px' }}>
                {formatPersianPrice(data.total_discount)}
              </span>
            </div>
          )}
          {data.total_tax && data.total_tax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', gap: '2px' }}>
              <span>مالیات:</span>
              <span style={{ fontSize: isMobilePrint ? '6px' : '7px' }}>
                {formatPersianPrice(data.total_tax)}
              </span>
            </div>
          )}
        </div>

        {/* سمت چپ: جمع کل */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center',
          textAlign: 'center',
          padding: isMobilePrint ? '4px' : '6px',
          background: '#c58f60',
          borderRadius: '3px',
          color: 'white'
        }}>
          <div style={{ 
            fontSize: isMobilePrint ? '6px' : '7px', 
            opacity: 0.9, 
            marginBottom: isMobilePrint ? '1px' : '2px'
          }}>
            جمع کل
          </div>
          <div style={{ 
            fontSize: isMobilePrint ? '9px' : '11px', 
            fontWeight: 'bold', 
            fontFamily: 'monospace'
          }}>
            {formatPersianPrice(data.total_invoice_amount || 0)}
          </div>
        </div>
      </div>

      {/* فوتر */}
      <div style={{ 
        marginTop: 'auto',
        paddingTop: isMobilePrint ? '4px' : '8px', 
        borderTop: '1px solid #ddd',
        textAlign: 'center',
        fontSize: isMobilePrint ? '6px' : '7px',
        color: '#999',
        lineHeight: '1.2'
      }}>
        تولیدی چرم مهربانو
      </div>
    </div>
  );
};

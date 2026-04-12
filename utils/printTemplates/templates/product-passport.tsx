import React, { useMemo } from 'react';
import { QRCode } from 'antd';
import { PRINT_PAPER_DIMENSIONS, PrintPaperSize } from '../printSizing';

interface ProductPassportProps {
  title: string;
  subtitle: string;
  qrValue: string;
  fields: any[];
  formatPrintValue: (field: any, value: any) => string;
  printSize?: PrintPaperSize;
}

export const ProductPassport: React.FC<ProductPassportProps> = ({
  title,
  subtitle,
  qrValue,
  fields,
  formatPrintValue,
  printSize = 'A6',
}) => {
  const pageSize = PRINT_PAPER_DIMENSIONS[printSize];
  const safeFields = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const columnCount = printSize === 'A4' ? 3 : printSize === 'A5' ? 2 : 1;

  const fieldMap = useMemo(() => {
    const map = new Map<string, any>();
    safeFields.forEach((field) => {
      const key = String(field?.key || '');
      if (!key || map.has(key)) return;
      map.set(key, field);
    });
    return map;
  }, [safeFields]);

  const getFormattedValue = (key: string) => {
    const field = fieldMap.get(key);
    if (!field) return '';
    return formatPrintValue(field, field.value);
  };

  const productName = getFormattedValue('name');
  const productCode = getFormattedValue('system_code') || getFormattedValue('manual_code');
  const chipItems = [
    { label: 'نوع کالا', value: getFormattedValue('product_type') },
    { label: 'دسته', value: getFormattedValue('category') || getFormattedValue('product_category') },
    { label: 'برند', value: getFormattedValue('brand_name') },
  ].filter((item) => item.value && String(item.value).trim() !== '');

  return (
    <div
      className="print-card print-card--product-passport"
      style={{ width: `${pageSize.widthMm}mm`, minHeight: `${pageSize.heightMm}mm` }}
    >
      <div className="product-passport-topline">
        <span>{title || 'شناسنامه کالا'}</span>
      </div>

      <div className="product-passport-hero">
        <div className="product-passport-head-text">
          <div className="product-passport-subtitle">{subtitle || 'واحد کالا'}</div>
          <div className="product-passport-name">{productName || title || '-'}</div>
          {productCode ? (
            <div className="product-passport-code">کد: {productCode}</div>
          ) : null}
        </div>
        <div className="product-passport-qr">
          <QRCode value={qrValue} bordered={false} size={82} />
        </div>
      </div>

      {chipItems.length > 0 ? (
        <div className="product-passport-chips">
          {chipItems.map((item) => (
            <div key={item.label} className="product-passport-chip">
              <span className="product-passport-chip-label">{item.label}</span>
              <span className="product-passport-chip-value">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className="product-passport-grid"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {safeFields.map((field, index) => (
          <div key={field.key || `field_${index}`} className="product-passport-item">
            <div className="product-passport-item-label">
              {field?.labels?.fa || field?.labels?.en || field?.key || '-'}
            </div>
            <div className="product-passport-item-value">
              {formatPrintValue(field, field.value) || '-'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

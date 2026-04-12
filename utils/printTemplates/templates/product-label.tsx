import React from 'react';
import { QRCode } from 'antd';
import { PRINT_PAPER_DIMENSIONS, PrintPaperSize } from '../printSizing';

interface ProductLabelProps {
  title: string;
  subtitle: string;
  qrValue: string;
  fields: any[];
  formatPrintValue: (field: any, value: any) => string;
  printSize?: PrintPaperSize;
  qrSize?: number;
  containerStyle?: React.CSSProperties;
  className?: string;
}

export const ProductLabel: React.FC<ProductLabelProps> = ({
  title,
  subtitle,
  qrValue,
  fields,
  formatPrintValue,
  printSize = 'A6',
  qrSize,
  containerStyle,
  className,
}) => {
  const pageSize = PRINT_PAPER_DIMENSIONS[printSize];
  const resolvedQrSize = qrSize ?? (printSize === 'A7' ? 48 : 92);
  return (
    <div
      className={`print-card print-card--size-${String(printSize).toLowerCase()} ${className || ''}`.trim()}
      style={{ width: `${pageSize.widthMm}mm`, minHeight: `${pageSize.heightMm}mm`, ...containerStyle }}
    >
      <div className="print-header">
        <div className="print-head-text">
          <div className="print-title">{title}</div>
          <div className="print-subtitle">{subtitle}</div>
        </div>
        <div className="print-qr">
          <QRCode value={qrValue} bordered={false} size={resolvedQrSize} />
        </div>
      </div>
      <div className="print-table-wrap">
        <table className="print-table">
          <tbody>
            {fields.map(field => (
              <tr key={field.key}>
                <td className="print-label">{field.labels.fa}</td>
                <td className="print-value">{formatPrintValue(field, field.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

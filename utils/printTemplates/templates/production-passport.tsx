import React from 'react';
import { QRCode } from 'antd';
import { PRINT_PAPER_DIMENSIONS, PrintPaperSize } from '../printSizing';

interface ProductionPassportProps {
  title: string;
  subtitle: string;
  qrValue: string;
  fields: any[];
  formatPrintValue: (field: any, value: any) => string;
  printSize?: PrintPaperSize;
}

export const ProductionPassport: React.FC<ProductionPassportProps> = ({
  title,
  subtitle,
  qrValue,
  fields,
  formatPrintValue,
  printSize = 'A5',
}) => {
  const pageSize = PRINT_PAPER_DIMENSIONS[printSize];
  const columnCount = printSize === 'A4' ? 2 : 1;
  const safeFields = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const isSpecField = (field: any) =>
    typeof field?.blockId === 'string' && field.blockId.toLowerCase().includes('spec');
  const getFieldLabel = (field: any) =>
    field?.labels?.fa || field?.labels?.en || field?.key || '-';
  const chunkFields = (list: any[], size: number) => {
    const chunks: any[][] = [];
    for (let i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks;
  };
  const specFields = safeFields.filter(isSpecField);
  const generalFields = safeFields.filter((field) => !isSpecField(field));
  const sections =
    specFields.length > 0
      ? [
          { id: 'specs', title: 'مشخصات کالا', fields: specFields },
          ...(generalFields.length > 0
            ? [{ id: 'general', title: 'سایر اطلاعات', fields: generalFields }]
            : []),
        ]
      : [{ id: 'general', title: 'اطلاعات تولید', fields: safeFields }];

  return (
    <div
      className="print-card print-card--passport"
      style={{ width: `${pageSize.widthMm}mm`, minHeight: `${pageSize.heightMm}mm` }}
    >
      <div className="print-header">
        <div className="print-head-text">
          <div className="print-title">{title}</div>
          <div className="print-subtitle">{subtitle}</div>
        </div>
        <div className="print-qr">
          <QRCode value={qrValue} bordered={false} size={92} />
        </div>
      </div>
      <div className="print-table-wrap print-table-wrap--stacked">
        {sections.map((section) => (
          <section key={section.id} className="print-section">
            <div className="print-section-title">{section.title}</div>
            <table className={`print-table ${columnCount === 2 ? 'print-table--two-col' : ''}`}>
              <tbody>
                {chunkFields(section.fields, columnCount).map((row, rowIndex) => (
                  <tr key={`${section.id}_${rowIndex}`}>
                    {row.map((field: any) => (
                      <React.Fragment key={field.key}>
                        <td className="print-label">{getFieldLabel(field)}</td>
                        <td className="print-value">{formatPrintValue(field, field.value) || '-'}</td>
                      </React.Fragment>
                    ))}
                    {row.length < columnCount &&
                      Array.from({ length: columnCount - row.length }).map((_, emptyIndex) => (
                        <React.Fragment key={`empty_${section.id}_${rowIndex}_${emptyIndex}`}>
                          <td className="print-label print-label-empty" />
                          <td className="print-value print-value-empty" />
                        </React.Fragment>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
};

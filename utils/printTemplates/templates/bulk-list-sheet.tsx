import React from 'react';

interface BulkListSheetProps {
  title: string;
  subtitle?: string;
  rows: any[];
  fields: any[];
  formatPrintValue: (field: any, value: any, record: any) => string;
}

export const BulkListSheet: React.FC<BulkListSheetProps> = ({
  title,
  subtitle,
  rows,
  fields,
  formatPrintValue,
}) => (
  <div className="bulk-print-list-sheet">
    <div className="bulk-print-list-header">
      <div>
        <div className="bulk-print-list-title">{title}</div>
        {subtitle ? <div className="bulk-print-list-subtitle">{subtitle}</div> : null}
      </div>
      <div className="bulk-print-list-meta">تعداد رکورد: {rows.length}</div>
    </div>

    <table className="bulk-print-list-table">
      <thead>
        <tr>
          <th className="bulk-print-list-index">ردیف</th>
          {fields.map((field) => (
            <th key={field.key}>{field?.labels?.fa || field?.labels?.en || field?.key}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((record, rowIndex) => (
          <tr key={record?.id || `row_${rowIndex}`}>
            <td className="bulk-print-list-index">{rowIndex + 1}</td>
            {fields.map((field) => (
              <td key={`${record?.id || rowIndex}_${field.key}`}>
                {formatPrintValue(field, record?.[field.key], record) || '-'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);


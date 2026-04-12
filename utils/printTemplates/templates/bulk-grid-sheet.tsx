import React from 'react';

interface BulkGridSheetProps<TRecord = any> {
  title: string;
  subtitle?: string;
  records: TRecord[];
  renderCard: (record: TRecord, index: number) => React.ReactNode;
  rotateCards?: boolean;
}

const chunkRecords = <T,>(records: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size));
  }
  return chunks;
};

export const BulkGridSheet = <TRecord,>({
  records,
  renderCard,
  rotateCards = false,
}: BulkGridSheetProps<TRecord>) => {
  const sheets = chunkRecords(records, 8);

  return (
    <div className="bulk-print-sheet-stack">
      {sheets.map((sheetRecords, sheetIndex) => (
        <section key={`sheet_${sheetIndex}`} className="bulk-print-grid-sheet">
          <div className="bulk-print-grid-sheet__grid">
            {Array.from({ length: 8 }).map((_, slotIndex) => {
              const record = sheetRecords[slotIndex];
              return (
                <div
                  key={`slot_${sheetIndex}_${slotIndex}`}
                  className={`bulk-print-grid-sheet__slot ${rotateCards ? 'bulk-print-grid-sheet__slot--rotated' : ''} ${record ? '' : 'bulk-print-grid-sheet__slot--empty'}`}
                >
                  {record ? (
                    <div className={`bulk-print-grid-sheet__slot-inner ${rotateCards ? 'bulk-print-grid-sheet__slot-inner--rotated' : ''}`}>
                      {renderCard(record, sheetIndex * 8 + slotIndex)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

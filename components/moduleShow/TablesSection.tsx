import React from 'react';
import { CalculatorOutlined } from '@ant-design/icons';
import BomStructureRenderer from '../renderers/BomStructureRenderer';
import EditableTable from '../EditableTable';

interface TablesSectionProps {
  linkedBomData: any;
  standardTableBlocks: any[];
  data: any;
  moduleId: string;
  recordId: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  onLinkedBomUpdate: (bomId: string) => void;
  onTableSave: (blockId: string, newData: any[]) => void;
}

const TablesSection: React.FC<TablesSectionProps> = ({
  linkedBomData,
  standardTableBlocks,
  data,
  moduleId,
  recordId,
  relationOptions,
  dynamicOptions,
  onLinkedBomUpdate,
  onTableSave,
}) => {
  if (linkedBomData) {
    return (
      <BomStructureRenderer
        bomData={linkedBomData}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        onUpdate={() => onLinkedBomUpdate(linkedBomData.id)}
      />
    );
  }

  if (!standardTableBlocks || standardTableBlocks.length === 0) return null;

  const hasAnyRows = standardTableBlocks.some(b => (data[b.id] || []).length > 0);

  return (
    <div className="space-y-6 overflow-x-auto pb-4">
      <div className="min-w-[600px]">
        {standardTableBlocks.map(block => (
          <div key={block.id} className="mb-6">
            <EditableTable
              block={block}
              initialData={data[block.id] || []}
              moduleId={moduleId}
              recordId={recordId}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
              onSaveSuccess={(newData) => onTableSave(block.id, newData)}
            />
          </div>
        ))}
      </div>

      {hasAnyRows && (
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 dark:from-leather-900 dark:to-black text-white p-6 rounded-[2rem] shadow-xl mt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl shadow-inner">
              <CalculatorOutlined />
            </div>
            <div>
              <h3 className="text-white font-bold text-base m-0">جمع کل مواد اولیه</h3>
              <div className="text-xs text-white/60">مجموع تمام اقلام مواد اولیه</div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-3xl font-black font-mono tracking-tight text-white drop-shadow-md">
              {(() => {
                let total = 0;
                const tables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];
                tables.forEach(tableName => {
                  const rows = data[tableName];
                  if (Array.isArray(rows)) {
                    rows.forEach(row => {
                      const val = row.total_price || ((parseFloat(row.usage || row.qty) || 0) * (parseFloat(row.buy_price) || 0));
                      total += val;
                    });
                  }
                });
                return total.toLocaleString();
              })()}
              <span className="text-sm font-sans font-normal opacity-70"> تومان</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TablesSection;

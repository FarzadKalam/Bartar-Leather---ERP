import React from 'react';
import EditableTable from '../EditableTable';
import SummaryCard from '../SummaryCard';
import ProductionStagesField from '../../components/ProductionStagesField';
import { calculateSummary } from '../../utils/calculations';
import { SummaryCalculationType, FieldType } from '../../types';

// 👇 اینترفیس اصلاح شد: حذف linkedBomData و ...
interface TablesSectionProps {
  module: any; 
  data: any; 
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
}

const TablesSection: React.FC<TablesSectionProps> = ({
  module,
  data,
  relationOptions,
  dynamicOptions,
}) => {
  if (!module || !data) return null;

  const getSummaryData = () => {
      const summaryBlock = module.blocks?.find((b: any) => b.summaryConfig);
      if (summaryBlock) {
          return calculateSummary(data, module.blocks || [], summaryBlock.summaryConfig);
      }
      if (module.blocks?.some((b: any) => b.type === 'table')) {
          return calculateSummary(data, module.blocks || [], {});
      }
      return null;
  };

  const summaryData = getSummaryData();
  const summaryConfig = module.blocks?.find((b: any) => b.summaryConfig)?.summaryConfig || {};
  const progressFields = module.fields?.filter((f: any) => f.type === FieldType.PROGRESS_STAGES) || [];

  return (
    <div className="space-y-8">

      {progressFields.map((field: any) => (
        <div key={field.key} className="bg-white dark:bg-[#1e1e1e] p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <h3 className="text-lg font-bold mb-4 text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-1 h-6 bg-blue-500 rounded-full inline-block"></span>
                {field.labels.fa}
            </h3>
            <ProductionStagesField 
                recordId={data.id} 
                readOnly={false} // در حالت نمایش فقط خواندنی (یا false اگر میخواهید دکمه + باشد)
                compact={false}
            />
        </div>
      ))}

      {module.blocks?.filter((b: any) => b.type === 'table').map((block: any) => (
        <div key={block.id}>
           <EditableTable
              block={block}
              initialData={data[block.id] || []}
              mode="db"
              moduleId={module.id}
              recordId={data.id}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
           />
        </div>
      ))}

      {summaryData && (
          <SummaryCard 
            type={summaryConfig.calculationType || SummaryCalculationType.SUM_ALL_ROWS} 
            data={summaryData} 
          />
      )}
    </div>
  );
};

export default TablesSection;

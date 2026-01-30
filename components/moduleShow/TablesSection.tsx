import React from 'react';
import EditableTable from '../EditableTable';
import SummaryCard from '../SummaryCard';
import { calculateSummary } from '../../utils/calculations';
import { SummaryCalculationType } from '../../types';

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

  return (
    <div className="space-y-8">
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
import React from 'react';
import { Tabs } from 'antd';
import EditableTable from '../EditableTable';
import { FieldType } from '../../types';

interface FieldGroupsTabsProps {
  fieldGroups: any[];
  moduleConfig: any;
  data: any;
  moduleId: string;
  recordId: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  renderSmartField: (field: any) => React.ReactNode;
  checkVisibility: (logic: any) => boolean;
  canViewField?: (fieldKey: string) => boolean;
}

const FieldGroupsTabs: React.FC<FieldGroupsTabsProps> = ({
  fieldGroups,
  moduleConfig,
  data,
  moduleId,
  recordId,
  relationOptions,
  dynamicOptions,
  renderSmartField,
  checkVisibility,
  canViewField,
}) => {
  if (!fieldGroups || fieldGroups.length === 0) return null;

  return (
    <div className="field-groups-tabs bg-white dark:bg-[#1a1a1a] p-1 md:p-1 sm:p-0 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 mb-6">
      <Tabs
        tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
        items={fieldGroups.map(block => ({
          key: block.id,
          label: <span className="flex items-center gap-2 py-3">{block.titles.fa}</span>,
          children: (
            <div className="p-6 md:p-4 sm:p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 md:gap-4">
                {moduleConfig.fields
                  .filter((f: any) => f.blockId === block.id)
                  .filter((f: any) => f.type !== FieldType.PROGRESS_STAGES)
                  .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
                  .map((f: any) => (!f.logic || checkVisibility(f.logic)) && (
                    <div key={f.key} className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">{f.labels.fa}</span>
                      {renderSmartField(f)}
                    </div>
                  ))}
              </div>
              {block.tableColumns && (
                <div className="mt-6">
                  <EditableTable
                    block={block}
                    initialData={data?.[block.id] || []}
                    mode="db"
                    moduleId={moduleId}
                    recordId={recordId}
                    relationOptions={relationOptions}
                    dynamicOptions={dynamicOptions}
                  />
                </div>
              )}
            </div>
          ),
        }))}
      />
    </div>
  );
};

export default FieldGroupsTabs;

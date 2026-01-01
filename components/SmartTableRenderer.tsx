import React from 'react';
import { Table, Button, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { TableColumnDefinition, FieldType } from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';

interface SmartTableRendererProps {
  columns: TableColumnDefinition[];
  data: any[];
  onAdd?: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  readonly?: boolean;
}

const SmartTableRenderer: React.FC<SmartTableRendererProps> = ({ 
  columns, 
  data = [], 
  onAdd, 
  onEdit, 
  onDelete, 
  readonly = false 
}) => {

  // Desktop Table Columns
  const tableColumns = [
    ...columns.map(col => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      width: col.width,
      render: (val: any) => (
        <SmartFieldRenderer 
          value={val} 
          type={col.type} 
          onSave={() => {}} 
          readonly={true} // Inside table, usually readonly until edit clicked
          showLabel={false}
          className="text-xs"
          options={col.options}
        />
      )
    })),
    {
      title: 'عملیات',
      key: 'actions',
      width: 80,
      render: (_: any, record: any) => !readonly && (
        <div className="flex gap-2">
           <Button size="small" type="text" icon={<EditOutlined className="text-blue-500" />} />
           <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </div>
      )
    }
  ];

  // Mobile Card Renderer
  const renderMobileCard = (item: any, index: number) => {
    return (
      <div key={item.id || index} className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 p-4 rounded-xl mb-3 relative shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          {columns.map(col => (
             <div key={col.key} className={`flex flex-col ${col.key === columns[0].key ? 'col-span-2 border-b border-gray-100 dark:border-gray-800 pb-2 mb-1' : ''}`}>
                 <span className="text-[9px] text-gray-400 dark:text-gray-500 font-black">{col.title}</span>
                 <SmartFieldRenderer 
                    value={item[col.key]} 
                    type={col.type} 
                    onSave={() => {}} 
                    readonly={true} 
                    showLabel={false}
                    className={col.key === columns[0].key ? 'text-sm font-black text-gray-800 dark:text-white' : 'text-xs text-gray-600 dark:text-gray-300'}
                    options={col.options}
                 />
             </div>
          ))}
        </div>
        {!readonly && (
          <div className="absolute top-3 left-3">
             <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Header Actions */}
      {!readonly && (
        <div className="flex justify-end mb-4">
           <Button type="dashed" icon={<PlusOutlined />} onClick={onAdd} className="w-full md:w-auto border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-leather-500 hover:border-leather-500">
              افزودن ردیف جدید
           </Button>
        </div>
      )}

      {/* Mobile View */}
      <div className="md:hidden">
         {data.length > 0 ? data.map(renderMobileCard) : <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </div>

      {/* Desktop View */}
      <div className="hidden md:block bg-white dark:bg-[#1a1a1a] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none">
        <Table 
           dataSource={data} 
           columns={tableColumns} 
           rowKey="id" 
           pagination={false}
           size="small"
           className="custom-erp-table-compact"
           locale={{ emptyText: <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </div>
    </div>
  );
};

export default SmartTableRenderer;
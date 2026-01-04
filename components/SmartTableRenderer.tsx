import React, { useMemo, useState } from 'react';
import { Table, Button, Empty, Avatar, Input, Space } from 'antd';
import { EditOutlined, SearchOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldLocation, ViewConfig, FieldType } from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';

interface SmartTableRendererProps {
  module: ModuleDefinition;
  data: any[];
  loading: boolean;
  onRowClick?: (record: any) => void;
  viewConfig?: ViewConfig | null;
  selection?: {
    selectedRowKeys: React.Key[];
    onChange: (keys: React.Key[]) => void;
  };
  onEditRow?: (record: any) => void;
}

const SmartTableRenderer: React.FC<SmartTableRendererProps> = ({ 
  module, 
  data, 
  loading, 
  onRowClick, 
  viewConfig, 
  selection, 
  onEditRow 
}) => {
  
  const columns = useMemo(() => {
    let fieldsToShow = module.fields.filter(f => f.location !== FieldLocation.SYSTEM_FOOTER);
    
    // فیلتر بر اساس View Config
    if (viewConfig && viewConfig.columns && viewConfig.columns.length > 0) {
        fieldsToShow = fieldsToShow.filter(f => viewConfig.columns.includes(f.key));
    } else {
        // پیش‌فرض: مخفی کردن فیلدهای طولانی و JSON
        fieldsToShow = fieldsToShow.filter(f => f.type !== FieldType.LONG_TEXT && f.type !== FieldType.JSON);
    }

    fieldsToShow.sort((a, b) => a.order - b.order);

    const tableCols = fieldsToShow.map(field => ({
        title: <span className="text-[12px] font-bold text-gray-600 dark:text-gray-400">{field.labels.fa}</span>,
        dataIndex: field.key,
        key: field.key,
        // --- قابلیت جستجو در ستون ---
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
          <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
            <Input
              placeholder={`جستجو در ${field.labels.fa}`}
              value={selectedKeys[0]}
              onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={() => confirm()}
              style={{ marginBottom: 8, display: 'block' }}
            />
            <Space>
              <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
                جستجو
              </Button>
              <Button onClick={() => { clearFilters(); confirm(); }} size="small" style={{ width: 90 }}>
                بازنشانی
              </Button>
            </Space>
          </div>
        ),
        filterIcon: (filtered: boolean) => (
          <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
        ),
        onFilter: (value: any, record: any) =>
          record[field.key]
            ? record[field.key].toString().toLowerCase().includes((value as string).toLowerCase())
            : '',
        
        // --- نحوه رندر کردن سلول ---
        render: (val: any) => {
           // ۱. اگر تصویر بود
           if (field.type === FieldType.IMAGE) {
               return val ? (
                 <Avatar 
                    src={val} 
                    shape="square" 
                    size="large" 
                    className="border border-gray-200 dark:border-gray-700 bg-white" 
                 /> 
               ) : <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-[10px] text-gray-400">---</div>;
           }

           // ۲. بقیه فیلدها
           return (
            <SmartFieldRenderer 
              value={val} 
              type={field.type} 
              options={field.options}
              readonly 
              showLabel={false} 
              className="text-xs"
            />
           );
        }
    }));

    if (onEditRow) {
      tableCols.push({
        title: '',
        key: 'actions',
        width: 50,
        fixed: 'right', // چسبیدن به راست
        render: (_, record) => (
             <Button 
               icon={<EditOutlined />} 
               type="text" 
               size="small"
               className="text-gray-400 hover:text-leather-600"
               onClick={(e) => { e.stopPropagation(); onEditRow(record); }} 
             />
        )
      } as any);
    }

    return tableCols;
  }, [module, viewConfig, onEditRow]);

  if (!module) return null;

  return (
    <Table 
      rowKey="id"
      columns={columns} 
      dataSource={data} 
      loading={loading}
      onRow={(record) => ({
        onClick: () => onRowClick && onRowClick(record),
        className: 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors'
      })}
      rowSelection={selection ? {
        type: 'checkbox',
        selectedRowKeys: selection.selectedRowKeys,
        onChange: selection.onChange,
      } : undefined}
      pagination={{ 
        pageSize: 20, 
        position: ['bottomCenter'], 
        showSizeChanger: true,
        showTotal: (total) => <span className="text-xs text-gray-400">مجموع: {total}</span>
      }}
      size="small"
      scroll={{ x: 'max-content' }}
      locale={{ emptyText: <Empty description="داده‌ای یافت نشد" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      className="custom-erp-table"
    />
  );
};

export default SmartTableRenderer;
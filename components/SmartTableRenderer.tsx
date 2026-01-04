import React, { useRef, useState } from 'react';
import { Table, Tag, Avatar, Input, Button, Space, Checkbox } from 'antd';
import { AppstoreOutlined, SearchOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType } from '../types';
import dayjs from 'dayjs';
import type { InputRef } from 'antd';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import type { FilterConfirmProps } from 'antd/es/table/interface';
import { Link } from 'react-router-dom'; 

interface SmartTableRendererProps {
  moduleConfig: ModuleDefinition | null | undefined;
  data: any[];
  loading: boolean;
  rowSelection?: any; // اضافه شده برای انتخاب گروهی
  onRow?: (record: any) => any;
  onChange?: (pagination: any, filters: any, sorter: any) => void;
  pagination?: any;
}

const SmartTableRenderer: React.FC<SmartTableRendererProps> = ({ 
  moduleConfig, 
  data, 
  loading, 
  rowSelection, 
  onRow,
  onChange,
  pagination
}) => {
  const searchInput = useRef<InputRef>(null);

  if (!moduleConfig || !moduleConfig.fields) return null;

  // --- لاجیک جستجوی ستونی (بهینه شده) ---
  const handleSearch = (selectedKeys: string[], confirm: (param?: FilterConfirmProps) => void) => {
    confirm();
  };

  const handleReset = (clearFilters: () => void, confirm: any) => {
    clearFilters();
    confirm();
  };

  const getColumnSearchProps = (dataIndex: string, title: string): ColumnType<any> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`جستجو در ${title}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm)}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], confirm)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            بگرد
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters, confirm)}
            size="small"
            style={{ width: 90 }}
          >
            حذف
          </Button>
          <Button type="link" size="small" onClick={() => close()}>بستن</Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? '#c58f60' : undefined }} />
    ),
    // فیلترینگ کلاینت‌ساید ساده و سریع
    onFilter: (value, record) => {
        const text = record[dataIndex] ? record[dataIndex].toString() : '';
        return text.toLowerCase().includes((value as string).toLowerCase());
    },
    onFilterDropdownOpenChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
  });

  // --- ساخت ستون‌ها ---
  let tableFields = moduleConfig.fields
    .filter(f => f.isTableColumn)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Fallback
  if (tableFields.length === 0) {
      tableFields = moduleConfig.fields.filter(f => 
          ['name', 'title', 'business_name', 'system_code', 'sell_price', 'stock_quantity', 'status', 'mobile_1', 'rank'].includes(f.key)
      );
  }

  const columns: ColumnsType<any> = tableFields.map(field => {
    // تشخیص اینکه آیا ستون باید قابلیت جستجو داشته باشد
    const isSearchable = field.type === FieldType.TEXT || field.key.includes('name') || field.key.includes('code') || field.key.includes('title');

    return {
      title: <span className="text-[11px] text-gray-500">{field.labels.fa}</span>,
      dataIndex: field.key,
      key: field.key,
      width: field.key === 'id' ? 60 : undefined,
      
      // اضافه کردن قابلیت جستجو اگر متنی باشد
      ...(isSearchable ? getColumnSearchProps(field.key, field.labels.fa) : {}),

      // فیلتر وضعیت‌ها
      filters: (field.type === FieldType.STATUS || field.type === FieldType.SELECT) && field.options 
          ? field.options.map(o => ({ text: o.label, value: o.value }))
          : undefined,
      onFilter: (field.type === FieldType.STATUS || field.type === FieldType.SELECT)
          ? (value, record) => record[field.key] === value
          : undefined,

      render: (value: any, record: any) => {
        if (field.type === FieldType.IMAGE) {
            return <Avatar src={value} icon={<AppstoreOutlined />} shape="square" size="default" className="bg-gray-100 border border-gray-200" />;
        }
        if (field.type === FieldType.DATE && value) {
            return <span className="dir-ltr text-gray-500 font-mono text-[11px]">{dayjs(value).calendar('jalali').format('YYYY/MM/DD')}</span>;
        }
        if (field.type === FieldType.STATUS) {
            const opt = field.options?.find(o => o.value === value);
            return <Tag color={opt?.color || 'default'} style={{fontSize: '10px', marginRight: 0}}>{opt?.label || value}</Tag>;
        }
        if (field.type === FieldType.PRICE) {
            if (!value) return '-';
            return <span className="font-bold text-gray-700 dark:text-gray-300 text-xs">{Number(value).toLocaleString()}</span>;
        }
        if (field.type === FieldType.STOCK) {
             const reorderPoint = record.reorder_point || 10;
             const color = value <= 0 ? 'red' : value <= reorderPoint ? 'orange' : 'green';
             return <span style={{ color }} className="font-bold text-xs">{value}</span>;
        }
        if (field.isKey || ['name', 'title', 'business_name'].includes(field.key)) {
             // لینک به صفحه جزئیات با جلوگیری از Propagation (برای اینکه کلیک روی ردیف تداخل نکنه)
            return (
                <span className="text-leather-600 font-bold text-sm hover:underline">
                    {value}
                </span>
            );
        }
        return <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>;
      }
    };
  });

  return (
    <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="id" 
        loading={loading} 
        size="small" 
        pagination={pagination || { pageSize: 20, position: ['bottomCenter'], size: 'small' }} 
        onChange={onChange}
        className="custom-erp-table h-full"
        scroll={{ x: true, y: 'calc(100vh - 240px)' }}
        // 🔥 اتصال انتخاب گروهی
        rowSelection={rowSelection ? {
            type: 'checkbox',
            ...rowSelection,
            columnWidth: 40,
        } : undefined}
        onRow={onRow}
    />
  );
};

export default SmartTableRenderer;
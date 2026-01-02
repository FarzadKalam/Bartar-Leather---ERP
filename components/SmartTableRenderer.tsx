import React, { useRef, useState } from 'react';
import { Table, Tag, Avatar, Input, Button, Space } from 'antd';
import { Link } from 'react-router-dom';
import { AppstoreOutlined, SearchOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType } from '../types';
import dayjs from 'dayjs';
import type { InputRef } from 'antd';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import type { FilterConfirmProps } from 'antd/es/table/interface';

interface SmartTableRendererProps {
  moduleConfig: ModuleDefinition;
  data: any[];
  loading: boolean;
  rowSelection?: any;
  onRow?: (record: any) => any;
}

const SmartTableRenderer: React.FC<SmartTableRendererProps> = ({ moduleConfig, data, loading, rowSelection, onRow }) => {
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef<InputRef>(null);

  // --- منطق جستجو در ستون‌ها ---
  const handleSearch = (selectedKeys: string[], confirm: (param?: FilterConfirmProps) => void, dataIndex: string) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters: () => void) => {
    clearFilters();
    setSearchText('');
  };

  const getColumnSearchProps = (dataIndex: string): ColumnType<any> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`جستجو...`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            بگرد
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters)}
            size="small"
            style={{ width: 90 }}
          >
            پاک کن
          </Button>
          <Button type="link" size="small" onClick={() => close()}>بستن</Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? '#d4a373' : undefined }} />
    ),
    onFilter: (value, record) =>
      record[dataIndex]
        ? record[dataIndex].toString().toLowerCase().includes((value as string).toLowerCase())
        : '',
    onFilterDropdownOpenChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
  });

  // --- انتخاب ستون‌های جدول ---
  let tableFields = moduleConfig.fields
    .filter(f => f.isTableColumn)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Fallback اگر فیلدی انتخاب نشده بود
  if (tableFields.length === 0) {
      tableFields = moduleConfig.fields.filter(f => 
          ['name', 'title', 'business_name', 'system_code', 'sell_price', 'stock_quantity', 'status', 'mobile_1', 'rank'].includes(f.key)
      );
  }

  const columns: ColumnsType<any> = tableFields.map(field => {
    let col: ColumnType<any> = {
      title: <span className="text-[11px] text-gray-500">{field.labels.fa}</span>, // فونت هدر ریزتر
      dataIndex: field.key,
      key: field.key,
      // اعمال فیلتر بر اساس نوع فیلد
      ...(field.type === FieldType.TEXT || field.key.includes('name') || field.key.includes('code') 
          ? getColumnSearchProps(field.key) 
          : {}),
      // اعمال فیلتر دراپ‌داون برای وضعیت و سلکت‌ها
      filters: (field.type === FieldType.STATUS || field.type === FieldType.SELECT) && field.options 
          ? field.options.map(o => ({ text: o.label, value: o.value }))
          : undefined,
      onFilter: (field.type === FieldType.STATUS || field.type === FieldType.SELECT)
          ? (value, record) => record[field.key] === value
          : undefined,

      render: (value: any, record: any) => {
        // 1. رندر تصاویر
        if (field.type === FieldType.IMAGE) {
            return <Avatar src={value} icon={<AppstoreOutlined />} shape="square" size="default" className="bg-gray-100 border border-gray-200" />;
        }
        
        // 2. رندر تاریخ
        if (field.type === FieldType.DATE && value) {
            return <span className="dir-ltr text-gray-500 font-mono text-[11px]">{dayjs(value).calendar('jalali').format('YYYY/MM/DD')}</span>;
        }

        // 3. رندر وضعیت (Status)
        if (field.type === FieldType.STATUS) {
            const opt = field.options?.find(o => o.value === value);
            return <Tag color={opt?.color || 'default'} style={{fontSize: '10px', marginRight: 0}}>{opt?.label || value}</Tag>;
        }

        // 4. رندر قیمت (Price)
        if (field.type === FieldType.PRICE) {
            if (!value) return '-';
            return <span className="font-bold text-gray-700 dark:text-gray-300 text-xs">{Number(value).toLocaleString()}</span>;
        }

        // 5. رندر موجودی (Stock)
        if (field.type === FieldType.STOCK) {
             const reorderPoint = record.reorder_point || 10;
             const color = value <= 0 ? 'red' : value <= reorderPoint ? 'orange' : 'green';
             return <span style={{ color }} className="font-bold text-xs">{value}</span>;
        }

        // 6. لینک دار کردن فیلدهای کلیدی
        if (field.isKey || field.key === 'name' || field.key === 'title' || field.key === 'business_name') {
            let displayText = value;
            if (moduleConfig.id === 'customers' && field.key === 'last_name') {
                displayText = `${record.first_name || ''} ${value}`;
            }
            // فونت کمی کوچکتر (text-sm)
            return <span className="text-leather-600 font-bold text-sm hover:underline">{displayText}</span>;
        }

        return <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>;
      }
    };
    return col;
  });

  // نکته: ستون Actions حذف شد چون درخواست کردی در لیست نباشد

  return (
    <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="id" 
        loading={loading} 
        // سایز small برای فشردگی بیشتر
        size="small" 
        pagination={{ pageSize: 15, position: ['bottomCenter'], size: 'small' }} 
        className="custom-erp-table h-full"
        scroll={{ x: true, y: 'calc(100vh - 280px)' }}
        rowSelection={rowSelection}
        onRow={onRow}
    />
  );
};

export default SmartTableRenderer;
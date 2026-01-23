import React from 'react';
import { Input, InputNumber, Select, Button, Space } from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { FieldType, FilterOperator } from '../types';
import dayjs from 'dayjs';


// نگاشت نوع فیلد به عملگر پیش‌فرض
export const getMessageForOperator = (op: FilterOperator) => {
    switch(op) {
        case FilterOperator.CONTAINS: return 'شامل';
        case FilterOperator.EQUALS: return 'برابر با';
        case FilterOperator.GREATER_THAN: return 'بزرگتر از';
        case FilterOperator.LESS_THAN: return 'کوچکتر از';
        default: return '';
    }
};

// تابع اصلی که پراپرتی‌های سرچ ستون جدول رو می‌سازه
export const getColumnSearchProps = (
  field: any, 
  handleSearch: (selectedKeys: any[], confirm: () => void, dataIndex: string) => void,
  handleReset: (clearFilters: () => void) => void
) => {
  
  // 1. جستجوی متنی (Text, Email, Phone)
  if ([FieldType.TEXT, FieldType.PHONE, FieldType.EMAIL].includes(field.type)) {
    return {
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
          <Input
            placeholder={`جستجو در ${field.labels.fa}`}
            value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => handleSearch(selectedKeys, confirm, field.key)}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => handleSearch(selectedKeys, confirm, field.key)}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 90 }}
            >
              جستجو
            </Button>
            <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small" style={{ width: 90 }}>
              پاک کردن
            </Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#c58f60' : undefined }} />
      ),
      onFilter: (value: any, record: any) =>
        record[field.key]?.toString().toLowerCase().includes((value as string).toLowerCase()),
    };
  }

  // 2. جستجوی بازه‌ای (Price, Number, Stock)
  if ([FieldType.PRICE, FieldType.NUMBER, FieldType.STOCK].includes(field.type)) {
    return {
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8, width: 250 }}>
          <div className="flex gap-2 mb-2">
              <InputNumber
                placeholder="از"
                value={selectedKeys[0]}
                onChange={(v) => setSelectedKeys([v, selectedKeys[1]])}
                style={{ width: '100%' }}
              />
              <InputNumber
                placeholder="تا"
                value={selectedKeys[1]}
                onChange={(v) => setSelectedKeys([selectedKeys[0], v])}
                style={{ width: '100%' }}
              />
          </div>
          <Space>
            <Button type="primary" onClick={() => handleSearch(selectedKeys, confirm, field.key)} size="small">اعمال</Button>
            <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small">حذف</Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered: boolean) => <FilterOutlined style={{ color: filtered ? '#c58f60' : undefined }} />,
      // نکته: فیلترینگ کلاینت‌ساید برای دمو (در عمل این باید سمت سرور انجام بشه)
      onFilter: (value: any, record: any) => true, 
    };
  }

  // 3. جستجوی انتخابی (Select, Status, Relation)
  if ([FieldType.SELECT, FieldType.STATUS, FieldType.RELATION].includes(field.type)) {
    return {
      filters: field.options?.map((opt: any) => ({ text: opt.label, value: opt.value })),
      filterSearch: true, // قابلیت سرچ در لیست دراپ‌داون
      onFilter: (value: any, record: any) => record[field.key] === value,
      filterIcon: (filtered: boolean) => <FilterOutlined style={{ color: filtered ? '#c58f60' : undefined }} />,
    };
  }
  
  return {};
};
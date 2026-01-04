import React from 'react';
import { Button, Select, Input, InputNumber, DatePicker, Row, Col, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { 
  ModuleDefinition, 
  FilterCondition, 
  FilterOperator, 
  FieldType, 
  OPERATORS_BY_TYPE 
} from '../types';
import dayjs from 'dayjs';
import { DatePicker as DatePickerJalali } from "antd-jalali";
import fa_IR from "antd/lib/locale/fa_IR";

interface FilterBuilderProps {
  module: ModuleDefinition;
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
}

const FilterBuilder: React.FC<FilterBuilderProps> = ({ module, filters, onChange }) => {

  const handleAdd = () => {
    // اولین فیلد ماژول رو به عنوان پیش‌فرض انتخاب میکنیم
    const defaultField = module.fields[0];
    const newFilter: FilterCondition = {
      id: Math.random().toString(36).substr(2, 9),
      field: defaultField.key,
      operator: FilterOperator.EQUALS, // یا عملگر پیش فرض بر اساس نوع
      value: ''
    };
    onChange([...filters, newFilter]);
  };

  const handleRemove = (id: string) => {
    onChange(filters.filter(f => f.id !== id));
  };

  const handleUpdate = (id: string, key: keyof FilterCondition, val: any) => {
    const updatedFilters = filters.map(f => {
      if (f.id !== id) return f;
      
      // اگر فیلد عوض شد، باید مقدار و عملگر رو ریست کنیم تا با نوع فیلد جدید بخونه
      if (key === 'field') {
         const newFieldDef = module.fields.find(field => field.key === val);
         let defaultOp = FilterOperator.EQUALS;
         if (newFieldDef?.type === FieldType.TEXT) defaultOp = FilterOperator.CONTAINS;
         
         return { ...f, field: val, operator: defaultOp, value: '' };
      }

      return { ...f, [key]: val };
    });
    onChange(updatedFilters);
  };

  // رندر کردن ورودی مقدار (Value Input) بر اساس نوع فیلد
  const renderValueInput = (filter: FilterCondition, fieldDef: any) => {
    if (!fieldDef) return <Input disabled />;

    // 1. اگر فیلد سلکتی یا وضعیت است
    if (fieldDef.type === FieldType.SELECT || fieldDef.type === FieldType.STATUS || fieldDef.type === FieldType.MULTI_SELECT) {
        return (
            <Select
                className="w-full"
                value={filter.value}
                onChange={v => handleUpdate(filter.id, 'value', v)}
                options={fieldDef.options}
                placeholder="انتخاب گزینه..."
            />
        );
    }

    // 2. اگر فیلد تاریخ است (شمسی)
    if (fieldDef.type === FieldType.DATE || fieldDef.type === FieldType.DATETIME) {
        return (
            // @ts-ignore
            <DatePickerJalali
                className="w-full"
                value={filter.value ? dayjs(filter.value) : null}
                onChange={(date) => {
                    // ذخیره به صورت ISO میلادی
                    const val = date ? date.toISOString() : null;
                    handleUpdate(filter.id, 'value', val);
                }}
                locale={fa_IR}
            />
        );
    }

    // 3. اگر فیلد عددی یا پول است
    if (fieldDef.type === FieldType.NUMBER || fieldDef.type === FieldType.PRICE || fieldDef.type === FieldType.STOCK) {
        return (
            <InputNumber
                className="w-full"
                value={filter.value}
                onChange={v => handleUpdate(filter.id, 'value', v)}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
            />
        );
    }

    // 4. پیش فرض (متن)
    return (
        <Input 
            value={filter.value} 
            onChange={e => handleUpdate(filter.id, 'value', e.target.value)} 
            placeholder="مقدار..."
        />
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {filters.map((filter) => {
        const fieldDef = module.fields.find(f => f.key === filter.field);
        
        // پیدا کردن لیست عملگرهای مجاز برای این نوع فیلد
        let allowedOps = OPERATORS_BY_TYPE['text']; // پیش فرض
        if (fieldDef) {
            if ([FieldType.NUMBER, FieldType.PRICE, FieldType.STOCK].includes(fieldDef.type)) allowedOps = OPERATORS_BY_TYPE['number'];
            else if ([FieldType.DATE, FieldType.DATETIME].includes(fieldDef.type)) allowedOps = OPERATORS_BY_TYPE['date'];
            else if ([FieldType.SELECT, FieldType.STATUS].includes(fieldDef.type)) allowedOps = OPERATORS_BY_TYPE['select'];
        }

        return (
          <Row key={filter.id} gutter={8} align="middle" className="bg-gray-50 p-2 rounded border border-gray-200">
            <Col span={8}>
              <Select
                className="w-full"
                value={filter.field}
                onChange={v => handleUpdate(filter.id, 'field', v)}
                options={module.fields.map(f => ({ label: f.labels.fa, value: f.key }))}
                showSearch
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Col>
            <Col span={5}>
              <Select
                className="w-full"
                value={filter.operator}
                onChange={v => handleUpdate(filter.id, 'operator', v)}
                options={allowedOps}
              />
            </Col>
            <Col span={9}>
                {renderValueInput(filter, fieldDef)}
            </Col>
            <Col span={2}>
              <Button danger type="text" icon={<DeleteOutlined />} onClick={() => handleRemove(filter.id)} />
            </Col>
          </Row>
        );
      })}

      <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd} block>
        افزودن شرط جدید
      </Button>
    </div>
  );
};

export default FilterBuilder;
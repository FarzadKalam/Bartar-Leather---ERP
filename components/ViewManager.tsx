import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Divider, Row, Col, message, Space, Tag } from 'antd';
import { SaveOutlined, DeleteOutlined, PlusOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType, ViewConfig, SavedView } from '../types';
import { supabase } from '../supabaseClient';

interface ViewManagerProps {
  moduleConfig: ModuleDefinition;
  viewToEdit: SavedView | null; // نمایی که قراره ویرایش بشه (یا نال برای جدید)
  onViewSaved: (view: SavedView) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ViewManager: React.FC<ViewManagerProps> = ({ moduleConfig, viewToEdit, onViewSaved, isOpen, onClose }) => {
  const [viewName, setViewName] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]); // ترتیب مهم است
  const [filters, setFilters] = useState<any[]>([]);

  // لیست فیلدها برای انتخاب ستون (آنهایی که هنوز انتخاب نشده‌اند)
  const availableFields = moduleConfig.fields.filter(f => !selectedColumns.includes(f.key));

  useEffect(() => {
    if (isOpen) {
      if (viewToEdit) {
        setViewName(viewToEdit.name);
        setSelectedColumns(viewToEdit.config.columns || []);
        setFilters(viewToEdit.config.filters || []);
      } else {
        // حالت جدید: پیش‌فرض‌ها
        setViewName('');
        // ستون‌های پیش‌فرض: هدرها منهای عکس و کد سیستمی (طبق خواسته جدید)
        const defaultCols = moduleConfig.fields
            .filter(f => f.location === 'header' && f.key !== 'image_url' && f.key !== 'system_code')
            .sort((a, b) => a.order - b.order)
            .map(f => f.key);
        setSelectedColumns(defaultCols);
        setFilters([]);
      }
    }
  }, [isOpen, viewToEdit, moduleConfig]);

  const handleSave = async () => {
    if (!viewName) return message.error('نام نما را وارد کنید');

    const config: ViewConfig = {
      columns: selectedColumns,
      filters: filters
    };

    const payload = {
      module_id: moduleConfig.id,
      name: viewName,
      config: config,
      is_default: false
    };

    try {
      let result;
      if (viewToEdit?.id) {
         // آپدیت
         result = await supabase.from('views').update(payload).eq('id', viewToEdit.id).select().single();
      } else {
         // ایجاد جدید
         result = await supabase.from('views').insert([payload]).select().single();
      }

      if (result.error) throw result.error;
      
      message.success('نما با موفقیت ذخیره شد');
      onViewSaved(result.data);
      onClose();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // --- توابع تغییر ترتیب ستون‌ها ---
  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newCols = [...selectedColumns];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCols.length) return;
    
    [newCols[index], newCols[targetIndex]] = [newCols[targetIndex], newCols[index]];
    setSelectedColumns(newCols);
  };

  const removeColumn = (key: string) => {
    setSelectedColumns(selectedColumns.filter(c => c !== key));
  };

  const addColumn = (key: string) => {
    setSelectedColumns([...selectedColumns, key]);
  };

  // --- رندر مقدار فیلتر (هوشمند) ---
  // ... داخل ViewManager ...

  const renderFilterValueInput = (filter: any, index: number) => {
    const fieldDef = moduleConfig.fields.find(f => f.key === filter.field);
    
    // اگر فیلد پیدا نشد یا متنی بود
    if (!fieldDef || !([FieldType.SELECT, FieldType.STATUS, FieldType.MULTI_SELECT].includes(fieldDef.type))) {
        return (
            <Input 
                placeholder="مقدار" 
                value={filter.value}
                onChange={e => { const n = [...filters]; n[index].value = e.target.value; setFilters(n); }} 
            />
        );
    }

    // اگر فیلد گزینه‌ای بود، از دراپ‌داون استفاده کن
    return (
        <Select
            placeholder="انتخاب کنید"
            className="w-full"
            value={filter.value} // مقدار ذخیره شده (مثلاً 'active')
            onChange={val => { const n = [...filters]; n[index].value = val; setFilters(n); }}
            // آپشن‌ها رو از کانفیگ ماژول بگیر
            options={fieldDef.options} 
        />
    );
  };
  return (
    <Modal title={viewToEdit ? "ویرایش نما" : "ساخت نمای جدید"} open={isOpen} onCancel={onClose} footer={null} width={700}>
      <Space direction="vertical" className="w-full">
        <Input placeholder="نام لیست (مثلا: پیگیری‌های فوری)" value={viewName} onChange={e => setViewName(e.target.value)} prefix={<SaveOutlined />} />
        
        <Divider orientation="left" className="text-xs m-0 text-leather-600">۱. انتخاب و چیدمان ستون‌ها</Divider>
        
        {/* لیست ستون‌های انتخاب شده با قابلیت مرتب‌سازی */}
        <div className="bg-gray-50 dark:bg-white/5 p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
            {selectedColumns.map((colKey, index) => {
                const field = moduleConfig.fields.find(f => f.key === colKey);
                return (
                    <div key={colKey} className="flex justify-between items-center bg-white dark:bg-dark-surface p-2 rounded shadow-sm border border-gray-100 dark:border-gray-800">
                        <span className="text-sm font-medium">{field?.labels.fa || colKey}</span>
                        <Space>
                            <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveColumn(index, 'up')} />
                            <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === selectedColumns.length - 1} onClick={() => moveColumn(index, 'down')} />
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeColumn(colKey)} />
                        </Space>
                    </div>
                );
            })}
            
            {/* افزودن ستون جدید */}
            <Select
                placeholder="+ افزودن ستون به لیست"
                className="w-full mt-2"
                value={null}
                onChange={addColumn}
                options={availableFields.map(f => ({ label: f.labels.fa, value: f.key }))}
            />
        </div>


        <Divider orientation="left" className="text-xs m-0 text-leather-600">۲. فیلترهای پیش‌فرض</Divider>
        <div className="bg-gray-50 dark:bg-white/5 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-500">شرط‌هایی که همیشه روی این لیست اعمال می‌شوند:</span>
                <Button size="small" icon={<PlusOutlined />} onClick={() => setFilters([...filters, { field: '', operator: 'eq', value: '' }])}>افزودن شرط</Button>
            </div>
            {filters.map((filter, index) => (
            <Row gutter={8} key={index} className="mb-2">
                <Col span={8}>
                <Select 
                    placeholder="فیلد" 
                    value={filter.field}
                    className="w-full"
                    onChange={val => {
                        const newFilters = [...filters];
                        newFilters[index].field = val;
                        // تنظیم هوشمند عملگر
                        const fieldType = moduleConfig.fields.find(f => f.key === val)?.type;
                        if(fieldType === FieldType.PRICE || fieldType === FieldType.NUMBER) newFilters[index].operator = 'gt';
                        else newFilters[index].operator = 'eq';
                        // ریست کردن مقدار چون نوع فیلد عوض شده
                        newFilters[index].value = ''; 
                        setFilters(newFilters);
                    }}
                    options={moduleConfig.fields.map(f => ({ label: f.labels.fa, value: f.key }))} 
                />
                </Col>
                <Col span={6}>
                <Select 
                    value={filter.operator}
                    className="w-full"
                    onChange={val => { const n = [...filters]; n[index].operator = val; setFilters(n); }}
                    options={[
                        { label: 'برابر با', value: 'eq' },
                        { label: 'شامل', value: 'ilike' },
                        { label: 'بزرگتر از', value: 'gt' },
                        { label: 'کوچکتر از', value: 'lt' },
                    ]}
                />
                </Col>
                <Col span={8}>
                   {renderFilterValueInput(filter, index)}
                </Col>
                <Col span={2}>
                   <Button danger icon={<DeleteOutlined />} size="small" onClick={() => setFilters(filters.filter((_, i) => i !== index))} />
                </Col>
            </Row>
            ))}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
           <Button onClick={onClose}>انصراف</Button>
           <Button type="primary" onClick={handleSave} className="bg-leather-500">ذخیره تغییرات</Button>
        </div>
      </Space>
    </Modal>
  );
};

export default ViewManager;
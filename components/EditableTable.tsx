import React, { useState, useEffect } from 'react';
import { Table, Button, Input, InputNumber, Select, Space, message, Popconfirm, Empty } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { FieldType } from '../types';

interface EditableTableProps {
  block: any;
  initialData: any[];
  moduleId?: string; // اختیاری برای حالت لوکال
  recordId?: string; // اختیاری برای حالت لوکال
  relationOptions: Record<string, any[]>;
  onSaveSuccess?: (newData: any[]) => void; // کال‌بک بعد از ذخیره
  onChange?: (newData: any[]) => void; // برای حالت لوکال (SmartForm)
  mode?: 'db' | 'local'; // حالت عملکرد
}

const EditableTable: React.FC<EditableTableProps> = ({ 
  block, 
  initialData, 
  moduleId, 
  recordId, 
  relationOptions, 
  onSaveSuccess,
  onChange,
  mode = 'db' 
}) => {
  const [isEditing, setIsEditing] = useState(mode === 'local'); // در حالت لوکال همیشه ادیت فعال است
  const [data, setData] = useState<any[]>(initialData || []);
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(initialData || []);
    if (mode === 'local') {
        setTempData(initialData || []);
        setIsEditing(true);
    }
  }, [initialData, mode]);

  const startEdit = () => {
    setIsEditing(true);
    setTempData(JSON.parse(JSON.stringify(data)));
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setTempData([]);
  };

  const handleSave = async () => {
    // اگر حالت لوکال است، نیازی به ذخیره در DB نیست
    if (mode === 'local') return;

    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('Module ID or Record ID missing');

      const { error } = await supabase
        .from(moduleId)
        .update({ [block.id]: tempData })
        .eq('id', recordId);

      if (error) throw error;

      message.success('لیست ذخیره شد');
      setData(tempData);
      if (onSaveSuccess) onSaveSuccess(tempData);
      setIsEditing(false);
    } catch (e: any) {
      message.error('خطا در ذخیره: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (index: number, key: string, value: any) => {
    const newData = [...tempData];
    newData[index] = { ...newData[index], [key]: value };
    setTempData(newData);
    // در حالت لوکال، تغییرات را لحظه‌ای به والد خبر بده
    if (mode === 'local' && onChange) {
        onChange(newData);
    }
  };

  const addRow = () => {
    const newRow = { key: Date.now() };
    const newData = [...tempData, newRow];
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const removeRow = (index: number) => {
    const newData = [...tempData];
    newData.splice(index, 1);
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  // تابع کمکی برای پیدا کردن لیبل
  const getLabel = (colKey: string, value: any) => {
      // اول در کلید مستقیم جستجو کن
      let opt = relationOptions[colKey]?.find((o: any) => o.value === value);
      if (opt) return opt.label;

      // اگر نبود، در کلیدهای ترکیبی (blockId_colKey) جستجو کن
      // این برای حالتی است که آپشن‌ها با کلید خاص کش شده‌اند
      const specificKey = `${block.id}_${colKey}`;
      opt = relationOptions[specificKey]?.find((o: any) => o.value === value);
      if (opt) return opt.label;

      // جستجوی کلی (Fallback)
      for (const k in relationOptions) {
          opt = relationOptions[k]?.find((o: any) => o.value === value);
          if (opt) return opt.label;
      }

      return value; // اگر پیدا نشد خود مقدار (UUID) را برگردان
  };

  const columns = [
    ...(block.tableColumns?.map((col: any) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      render: (text: any, record: any, index: number) => {
        // --- حالت نمایش (فقط در حالت DB و زمانی که دکمه ویرایش زده نشده) ---
        if (!isEditing && mode === 'db') {
          if (col.type === FieldType.RELATION) {
            const label = getLabel(col.key, text);
            // لینک‌دهی
            if (text && typeof text === 'string' && text.length > 10) { 
                return <Link to={`/products/${text}`} className="text-leather-600 hover:underline font-medium">{label}</Link>;
            }
            return <span className="text-gray-500">{label || '-'}</span>;
          }
          return <span className="text-gray-700 dark:text-gray-300">{text}</span>;
        }

        // --- حالت ویرایش (Local یا DB Edit Mode) ---
        if (col.type === FieldType.RELATION) {
           // تجمیع آپشن‌ها برای دراپ‌داون
           const specificKey = `${block.id}_${col.key}`;
           const options = relationOptions[specificKey] || relationOptions[col.key] || [];
           
           return (
            <Select
              value={text}
              onChange={(val) => updateRow(index, col.key, val)}
              className="w-full"
              placeholder="جستجو..."
              showSearch
              filterOption={(input, option) => (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              options={options}
            />
          );
        }
        if (col.type === FieldType.NUMBER) {
          return <InputNumber value={text} onChange={(val) => updateRow(index, col.key, val)} className="w-full" />;
        }
        return <Input value={text} onChange={(e) => updateRow(index, col.key, e.target.value)} />;
      }
    })) || []),
    // ستون عملیات (همیشه در حالت ادیت یا لوکال هست)
    ...(isEditing ? [{
      title: 'عملیات',
      key: 'actions',
      width: 80,
      render: (_: any, __: any, index: number) => (
        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(index)} />
      )
    }] : [])
  ];

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border ${isEditing && mode === 'db' ? 'border-leather-500 ring-1 ring-leather-500' : 'border-gray-200 dark:border-gray-800'} transition-all`}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <h3 className="font-bold text-lg text-gray-700 dark:text-white m-0 flex items-center gap-2">
          <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>
          {block.titles.fa}
        </h3>
        
        {/* دکمه‌های کنترل (فقط در حالت DB) */}
        {mode === 'db' && (
            <Space>
            {isEditing ? (
                <>
                <Button onClick={cancelEdit} disabled={saving} icon={<CloseOutlined />}>انصراف</Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} className="bg-green-500 border-none">ذخیره</Button>
                </>
            ) : (
                <Button size="small" icon={<EditOutlined />} onClick={startEdit}>ویرایش لیست</Button>
            )}
            </Space>
        )}
      </div>

      <Table
        dataSource={isEditing ? tempData : data}
        columns={columns}
        pagination={false}
        size="middle"
        // استفاده از key یا index برای جلوگیری از باگ رندر
        rowKey={(record: any, index) => record.key || record.item_id || index} 
        locale={{ emptyText: <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        className="custom-erp-table"
        footer={(isEditing || mode === 'local') ? () => (
          <Button type="dashed" block icon={<PlusOutlined />} onClick={addRow}>افزودن ردیف جدید</Button>
        ) : undefined}
      />
    </div>
  );
};

export default EditableTable;
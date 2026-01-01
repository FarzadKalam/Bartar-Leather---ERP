import React, { useState, useEffect } from 'react';
import { Table, Button, Input, InputNumber, Select, Space, message, Empty, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { FieldType } from '../types';

const { Text } = Typography;

interface EditableTableProps {
  block: any;
  initialData: any[];
  moduleId?: string; 
  recordId?: string; 
  relationOptions: Record<string, any[]>;
  onSaveSuccess?: (newData: any[]) => void; 
  onChange?: (newData: any[]) => void; 
  mode?: 'db' | 'local'; 
  // پراپ‌های جدید برای آپشن‌های داینامیک
  dynamicOptions?: Record<string, any[]>;
}

const EditableTable: React.FC<EditableTableProps> = ({ 
  block, initialData, moduleId, recordId, relationOptions, onSaveSuccess, onChange, mode = 'db', dynamicOptions = {}
}) => {
  const [isEditing, setIsEditing] = useState(mode === 'local');
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

  // محاسبه خودکار بهای تمام شده برای یک ردیف
  const calculateRowTotal = (row: any) => {
      const usage = parseFloat(row.usage) || 0;
      const price = parseFloat(row.buy_price) || 0;
      return usage * price;
  };

  const startEdit = () => {
    setIsEditing(true);
    // هنگام شروع ویرایش، مطمئن شویم محاسبات درست است
    const preparedData = (data || []).map(row => ({
        ...row,
        total_price: calculateRowTotal(row)
    }));
    setTempData(JSON.parse(JSON.stringify(preparedData)));
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setTempData([]);
  };

  const handleSave = async () => {
    if (mode === 'local') return;

    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('Module ID or Record ID missing');

      // محاسبه نهایی قبل از ذخیره
      const dataToSave = tempData.map(row => ({
          ...row,
          total_price: calculateRowTotal(row)
      }));

      const { error } = await supabase
        .from(moduleId)
        .update({ [block.id]: dataToSave })
        .eq('id', recordId);

      if (error) throw error;

      message.success('لیست ذخیره شد');
      setData(dataToSave);
      if (onSaveSuccess) onSaveSuccess(dataToSave);
      setIsEditing(false);
    } catch (e: any) {
      message.error('خطا در ذخیره: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateRow = async (index: number, key: string, value: any) => {
    const newData = [...tempData];
    newData[index] = { ...newData[index], [key]: value };

    // اگر آیتم (چرم/یراق) تغییر کرد، اطلاعات پیش‌فرضش را بکش
    if (key === 'item_id' && value) {
        const relCol = block.tableColumns?.find((c: any) => c.key === 'item_id');
        if (relCol?.relationConfig) {
            const { data: product } = await supabase.from(relCol.relationConfig.targetModule).select('*').eq('id', value).single();
            if (product) {
                // پر کردن فیلدهای مرتبط (اگر در محصول وجود داشته باشند)
                // اینجا نگاشت دستی یا هوشمند انجام می‌دهیم
                if (product.sell_price || product.buy_price) newData[index]['buy_price'] = product.buy_price || product.sell_price;
                
                // کپی کردن ویژگی‌ها (رنگ، جنس و...)
                // فرض بر این است که نام فیلدها در محصول و BOM یکی است یا شبیه است
                ['leather_type', 'leather_color_1', 'lining_material', 'lining_color', 'fitting_type', 'acc_material'].forEach(field => {
                    if (product[field]) {
                        // نگاشت leather_color_1 به leather_color
                        const targetKey = field === 'leather_color_1' ? 'leather_color' : field;
                        newData[index][targetKey] = product[field];
                    }
                });
            }
        }
    }

    // محاسبه مجدد بهای تمام شده اگر قیمت یا مصرف تغییر کرد
    if (key === 'usage' || key === 'buy_price' || key === 'item_id') {
        newData[index]['total_price'] = calculateRowTotal(newData[index]);
    }

    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const addRow = () => {
    const newRow = { key: Date.now(), usage: 1, buy_price: 0, total_price: 0 };
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

  const columns = [
    ...(block.tableColumns?.map((col: any) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      width: col.key === 'item_id' ? 250 : undefined,
      render: (text: any, record: any, index: number) => {
        // --- حالت نمایش ---
        if (!isEditing && mode === 'db') {
          if (col.type === FieldType.RELATION) {
             const specificKey = `${block.id}_${col.key}`;
             const options = relationOptions[specificKey] || relationOptions[col.key] || [];
             const opt = options.find((o: any) => o.value === text);
             const label = opt ? opt.label : text;
             if (text && typeof text === 'string' && text.length > 10) return <Link to={`/products/${text}`} className="text-leather-600 hover:underline font-medium">{label}</Link>;
             return <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>;
          }
          if (col.type === FieldType.PRICE) return <span className="font-mono">{text ? Number(text).toLocaleString() : '0'}</span>;
          if (col.type === FieldType.SELECT) {
             // پیدا کردن لیبل برای سلکت
             let options = col.options;
             if (col.dynamicOptionsCategory && dynamicOptions) options = dynamicOptions[col.dynamicOptionsCategory];
             const opt = options?.find((o:any) => o.value === text);
             return <span>{opt?.label || text}</span>;
          }
          return <span>{text}</span>;
        }

        // --- حالت ویرایش ---
        // فیلدهای محاسباتی فقط خواندنی هستند
        if (col.isCalculated) {
             return <span className="font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded block text-center">{Number(text || 0).toLocaleString()}</span>;
        }

        if (col.type === FieldType.RELATION) {
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

        if (col.type === FieldType.SELECT) {
            let options = col.options;
            if (col.dynamicOptionsCategory && dynamicOptions) {
                options = dynamicOptions[col.dynamicOptionsCategory]?.map((o: any) => ({ label: o.label, value: o.value }));
            }
            return <Select value={text} onChange={(val) => updateRow(index, col.key, val)} className="w-full" options={options} allowClear />;
        }

        if (col.type === FieldType.NUMBER || col.type === FieldType.PRICE) {
          return <InputNumber value={text} onChange={(val) => updateRow(index, col.key, val)} className="w-full" formatter={col.type === FieldType.PRICE ? value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : undefined} parser={col.type === FieldType.PRICE ? value => value!.replace(/\$\s?|(,*)/g, '') : undefined} />;
        }
        return <Input value={text} onChange={(e) => updateRow(index, col.key, e.target.value)} />;
      }
    })) || []),
    ...(isEditing ? [{ title: '', key: 'actions', width: 50, render: (_: any, __: any, i: number) => <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(i)} /> }] : [])
  ];

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border ${isEditing && mode === 'db' ? 'border-leather-500 ring-1 ring-leather-500' : 'border-gray-200 dark:border-gray-800'} transition-all`}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <h3 className="font-bold text-lg text-gray-700 dark:text-white m-0 flex items-center gap-2">
          <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>
          {block.titles.fa}
        </h3>
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
        rowKey={(record: any, index) => record.key || record.item_id || index} 
        locale={{ emptyText: <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        className="custom-erp-table"
        footer={(isEditing || mode === 'local') ? () => (
          <Button type="dashed" block icon={<PlusOutlined />} onClick={addRow}>افزودن ردیف جدید</Button>
        ) : undefined}
        summary={(pageData) => {
            let totalUsage = 0;
            let totalCost = 0;
            pageData.forEach((row: any) => {
                totalUsage += parseFloat(row.usage) || 0;
                // محاسبه جمع بر اساس مقادیر موجود (چه در حال ادیت چه نمایش)
                const price = row.total_price !== undefined ? row.total_price : ((parseFloat(row.usage)||0) * (parseFloat(row.buy_price)||0));
                totalCost += price;
            });
            return (
                <Table.Summary.Row className="bg-gray-50 dark:bg-white/5 font-bold">
                    <Table.Summary.Cell index={0} colSpan={1}>جمع کل</Table.Summary.Cell>
                    {/* پر کردن سلول‌های خالی تا برسیم به ستون‌های عددی */}
                    {block.tableColumns.slice(1).map((col: any, idx: number) => {
                         if (col.key === 'usage') return <Table.Summary.Cell key={idx} index={idx + 1}><Text>{Number(totalUsage).toLocaleString()}</Text></Table.Summary.Cell>;
                         if (col.key === 'total_price') return <Table.Summary.Cell key={idx} index={idx + 1}><Text type="success">{Number(totalCost).toLocaleString()}</Text></Table.Summary.Cell>;
                         return <Table.Summary.Cell key={idx} index={idx + 1} />;
                    })}
                    {isEditing && <Table.Summary.Cell index={99} />}
                </Table.Summary.Row>
            );
        }}
      />
    </div>
  );
};

export default EditableTable;
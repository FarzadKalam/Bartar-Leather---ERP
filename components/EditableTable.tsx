import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Empty, Typography, Modal, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { FieldType, ModuleField } from '../types'; // ModuleField اضافه شد
import { calculateRow } from '../utils/calculations';
import SmartFieldRenderer from './SmartFieldRenderer'; // ایمپورت کامپوننت اصلی

const { Text } = Typography;

interface EditableTableProps {
  block: any;
  initialData: any[];
  moduleId?: string;
  recordId?: string;
  relationOptions: Record<string, any[]>;
  onSaveSuccess?: (newData: any[]) => void;
  onChange?: (newData: any[]) => void;
  mode?: 'db' | 'local' | 'external_view';
  dynamicOptions?: Record<string, any[]>;
  externalSource?: { moduleId?: string; recordId?: string; column?: string; };
  populateSource?: { moduleId?: string; recordId?: string; column?: string; };
}

const EditableTable: React.FC<EditableTableProps> = ({ 
  block, initialData, moduleId, recordId, relationOptions, onSaveSuccess, onChange, 
  mode = 'db', dynamicOptions = {}, externalSource, populateSource
}) => {
  const [isEditing, setIsEditing] = useState(mode === 'local');
  const [data, setData] = useState<any[]>(initialData || []);
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // --- دریافت دیتای خارجی ---
  useEffect(() => {
      const fetchExternalData = async () => {
          if (mode === 'external_view' && externalSource?.moduleId && externalSource?.recordId) {
              setLoadingData(true);
              try {
                  const { data: extData, error } = await supabase
                      .from(externalSource.moduleId!)
                      .select(externalSource.column || 'items')
                      .eq('id', externalSource.recordId)
                      .single();
                  if (error) throw error;
                  const items = extData ? (extData as any)[externalSource.column || 'items'] : [];
                  const dataWithKeys = Array.isArray(items) ? items.map((i: any, idx: number) => ({...i, key: i.key || idx})) : [];
                  setData(dataWithKeys);
              } catch (err) { console.error(err); setData([]); } finally { setLoadingData(false); }
          }
      };
      fetchExternalData();
  }, [mode, externalSource?.recordId]);

  // --- کپی دیتا (Populate) ---
  useEffect(() => {
      const fetchAndPopulate = async () => {
          if (populateSource?.moduleId && populateSource?.recordId) {
              setLoadingData(true);
              try {
                  const { data: sourceData, error } = await supabase
                      .from(populateSource.moduleId!)
                      .select(populateSource.column || 'items')
                      .eq('id', populateSource.recordId)
                      .single();
                  if (error) throw error;
                  const items = sourceData ? (sourceData as any)[populateSource.column || 'items'] : [];
                  const populatedItems = (Array.isArray(items) ? items : []).map((item: any) => ({
                      ...item,
                      id: undefined, 
                      key: Date.now() + Math.random(), 
                  }));
                  setTempData(populatedItems);
                  if (onChange) onChange(populatedItems);
                  setIsEditing(true);
                  message.success('اقلام کپی شدند');
              } catch (err) { console.error(err); } finally { setLoadingData(false); }
          }
      };
      if (populateSource?.recordId) fetchAndPopulate();
  }, [populateSource?.recordId]);

  // --- مقداردهی اولیه ---
  useEffect(() => {
      if (mode !== 'external_view' && !populateSource?.recordId) {
          const safeData = Array.isArray(initialData) ? initialData : [];
          const dataWithKey = safeData.map((item, index) => ({
              ...item,
              key: item.key || item.id || `${Date.now()}_${index}`
          }));
          setData(dataWithKey);
          if (mode === 'local') setTempData(dataWithKey);
      }
  }, [initialData, mode]);

  const updateRow = (index: number, key: string, value: any) => {
    const newData = [...tempData];
    newData[index] = { ...newData[index], [key]: value };
    
    // محاسبه مجدد قیمت کل
    if (['quantity', 'qty', 'usage', 'unit_price', 'price', 'buy_price', 'discount', 'vat'].includes(key)) {
        newData[index]['total_price'] = calculateRow(newData[index], block.rowCalculationType);
    }
    
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  // --- هندلر ویژه برای فیلدهای Relation (شامل اتوپرفر) ---
  const handleRelationChange = async (index: number, key: string, value: any, relationConfig: any) => {
      updateRow(index, key, value);

      if (value && relationConfig?.targetModule) {
          try {
              const { data: record, error } = await supabase
                  .from(relationConfig.targetModule)
                  .select('*')
                  .eq('id', value)
                  .single();

              if (!error && record) {
                  const newData = [...tempData];
                  const currentRow = { ...newData[index], [key]: value };

                  block.tableColumns?.forEach((col: any) => {
                      if (record[col.key] !== undefined && col.key !== key) {
                          currentRow[col.key] = record[col.key];
                      }
                      // منطق هوشمند تطبیق قیمت
                      if ((col.key === 'unit_price' || col.key === 'price')) {
                          if (record['sell_price']) currentRow[col.key] = record['sell_price'];
                          else if (record['price']) currentRow[col.key] = record['price'];
                      }
                      if ((col.key === 'buy_price')) {
                          if (record['buy_price']) currentRow[col.key] = record['buy_price'];
                      }
                  });

                  currentRow['total_price'] = calculateRow(currentRow, block.rowCalculationType);
                  
                  newData[index] = currentRow;
                  setTempData(newData);
                  if (mode === 'local' && onChange) onChange(newData);
                  message.success('اطلاعات بارگذاری شد');
              }
          } catch (e) { console.error(e); }
      }
  };

  const addRow = () => {
    const newRow = { 
        key: Date.now(), 
        quantity: 1, unit_price: 0, discount: 0, vat: 0, total_price: 0 
    };
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

  const startEdit = () => {
    setIsEditing(true);
    const preparedData = data.map((row, i) => ({
        ...row,
        key: row.key || row.id || `edit_${i}`,
        total_price: calculateRow(row, block.rowCalculationType)
    }));
    setTempData(JSON.parse(JSON.stringify(preparedData)));
  };

  const cancelEdit = () => { setIsEditing(false); setTempData([]); };

  const handleSave = async () => {
    if (mode === 'local' || mode === 'external_view') return;
    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('رکورد یافت نشد');
      const dataToSave = tempData.map(({ key, ...rest }) => ({ 
          ...rest, 
          total_price: calculateRow(rest, block.rowCalculationType) 
      }));
      const { error } = await supabase.from(moduleId!).update({ [block.id]: dataToSave }).eq('id', recordId);
      if (error) throw error;
      message.success('ذخیره شد');
      setData(dataToSave);
      if (onSaveSuccess) onSaveSuccess(dataToSave);
      setIsEditing(false);
    } catch (e: any) { message.error(e.message); } finally { setSaving(false); }
  };

  // --- تنظیم عرض پیش‌فرض بر اساس نوع ---
  const getColWidth = (col: any) => {
      if (col.width) return col.width;
      if (col.type === FieldType.RELATION) return 200;
      if (col.type === FieldType.NUMBER || col.type === FieldType.PERCENTAGE_OR_AMOUNT) return 100;
      if (col.type === FieldType.PRICE) return 130;
      if (col.type === FieldType.DATE) return 120;
      return 150;
  };

  const columns = [
    ...(block.tableColumns?.map((col: any) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      width: getColWidth(col),
      render: (text: any, record: any, index: number) => {
        // ۱. ساخت یک آبجکت فیلد موقت برای ارسال به SmartFieldRenderer
        const fieldConfig: ModuleField = {
            key: col.key,
            type: col.type,
            labels: { fa: col.title, en: col.key }, // لیبل فقط جهت سازگاری تایپ است و نمایش داده نمی‌شود
            options: col.options, // برای فیلد Select
            relationConfig: col.relationConfig, // برای فیلد Relation
            dynamicOptionsCategory: col.dynamicOptionsCategory
        };

        // ۲. محاسبه آپشن‌ها (مشابه لاجیک SmartForm)
        let options = col.options;
        if (col.dynamicOptionsCategory) options = dynamicOptions[col.dynamicOptionsCategory];
        if (col.type === FieldType.RELATION) {
             const specificKey = `${block.id}_${col.key}`;
             options = relationOptions[specificKey] || relationOptions[col.key] || [];
        }

        // ۳. هندل کردن تغییر مقدار
        // اگر Relation بود، از تابع خاص handleRelationChange استفاده کن، وگرنه updateRow معمولی
        const handleChange = (val: any) => {
            if (col.type === FieldType.RELATION) {
                handleRelationChange(index, col.key, val, col.relationConfig);
            } else {
                updateRow(index, col.key, val);
            }
        };

        // ۴. رندر با استفاده از SmartFieldRenderer
        return (
            <div style={{ minWidth: '100%' }}> {/* برای پر کردن سلول */}
                <SmartFieldRenderer
                    field={fieldConfig}
                    value={isEditing ? text : text} // در هر دو حالت مقدار را پاس می‌دهیم
                    onChange={handleChange}
                    forceEditMode={isEditing} // اگر در حال ویرایش هستیم، اینپوت رندر کن، وگرنه متن
                    options={options}
                    // برای جلوگیری از نمایش لیبل بالای فیلد در داخل جدول (چون جدول هدر دارد)
                    compactMode={true} 
                />
            </div>
        );
      }
    })) || []),
    ...(isEditing ? [{ title: '', key: 'actions', width: 50, render: (_: any, __: any, i: number) => <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(i)} /> }] : [])
  ];

  if (loadingData) return <div className="p-10 text-center"><Spin /></div>;

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border ${isEditing ? 'border-leather-500' : 'border-gray-200 dark:border-gray-800'} transition-all font-['Vazirmatn']`}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <h3 className="font-bold text-lg text-gray-700 dark:text-white m-0 flex items-center gap-2">
          <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>
          {block.titles.fa}
        </h3>
        <Space>
            {mode === 'db' && !isEditing && <Button size="small" icon={<EditOutlined />} onClick={startEdit}>ویرایش لیست</Button>}
            {isEditing && mode !== 'local' && (
                <>
                <Button type="primary" onClick={handleSave} loading={saving} icon={<SaveOutlined />}>ذخیره</Button>
                <Button onClick={cancelEdit} disabled={saving} icon={<CloseOutlined />}>انصراف</Button>
                </>
            )}
        </Space>
      </div>

      <Table
        dataSource={isEditing ? tempData : data}
        columns={columns}
        pagination={false}
        size="middle"
        rowKey={(record: any) => record.key || record.id || Math.random()} 
        locale={{ emptyText: <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        className="custom-erp-table font-['Vazirmatn']"
        scroll={{ x: 'max-content' }}
        footer={(isEditing || mode === 'local') ? () => <Button type="dashed" block icon={<PlusOutlined />} onClick={addRow}>افزودن ردیف جدید</Button> : undefined}
        summary={(pageData) => {
            return (
                <Table.Summary fixed>
                    <Table.Summary.Row className="bg-gray-50 dark:bg-gray-800 font-bold">
                        {columns.map((col: any, index) => {
                            if (col.key === 'actions') return <Table.Summary.Cell index={index} key={index} />;
                            if (index === 0) return <Table.Summary.Cell index={index} key={index}>جمع:</Table.Summary.Cell>;

                            if (col.showTotal || ['total_price', 'amount', 'quantity', 'usage'].includes(col.key)) {
                                const total = pageData.reduce((prev: number, current: any) => prev + (parseFloat(current[col.key]) || 0), 0);
                                return (
                                    <Table.Summary.Cell index={index} key={index}>
                                        <Text type="success">{total.toLocaleString()}</Text>
                                    </Table.Summary.Cell>
                                );
                            }
                            return <Table.Summary.Cell index={index} key={index} />;
                        })}
                    </Table.Summary.Row>
                </Table.Summary>
            );
        }}
      />
    </div>
  );
};

export default EditableTable;

<<<<<<< HEAD
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

=======
import React, { useState, useEffect } from 'react';
import { Table, Button, Input, InputNumber, Select, Space, message, Empty, Spin, Modal } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, CloseOutlined, LinkOutlined, QrcodeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { FieldType } from '../types';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';

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
  canViewField?: (fieldKey: string) => boolean;
  readOnly?: boolean;
  externalSource?: {
      moduleId?: string;
      recordId?: string;
      column?: string;
  };
}

const EditableTable: React.FC<EditableTableProps> = ({ 
  block, initialData, moduleId, recordId, relationOptions, onSaveSuccess, onChange, 
  mode = 'db', externalSource, dynamicOptions = {}, canViewField, readOnly = false
}) => {
  const [isEditing, setIsEditing] = useState(mode === 'local' && !readOnly);
  const [data, setData] = useState<any[]>(initialData || []);
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingExternal, setLoadingExternal] = useState(false);

  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<{ rowIndex: number, fieldKey: string } | null>(null);
  const [scannedCode, setScannedCode] = useState('');

  const getSelectPopupContainer = (trigger: HTMLElement): HTMLElement => {
    const modal = trigger.closest('.ant-modal') as HTMLElement | null;
    return modal || document.body;
  };

    const getColumnDefaultValue = (key: string) => {
      return block.tableColumns?.find((col: any) => col.key === key)?.defaultValue;
    };

    const getColumnWidth = (col: any) => {
      if (col.key === 'item_id' || col.type === FieldType.RELATION) return 280;
      if (col.key === 'unit') return 90;
      if (col.key === 'usage' || col.type === FieldType.NUMBER || col.type === FieldType.STOCK) return 120;
      if (col.type === FieldType.PRICE || col.key === 'total_price') return 140;
      if (col.type === FieldType.MULTI_SELECT) return 220;
      if (col.type === FieldType.SELECT) return 200;
      if (col.type === FieldType.TEXT) return 180;
      return 160;
    };

  // تابع برای fetch کردن مقادیر سفارشی از محصول مرتبط
  const enrichRowWithProductData = async (row: any) => {
      if (!row.item_id) return row;
      
      try {
        const fillKeys = (block.tableColumns || [])
          .map((col: any) => col.key)
          .filter((key: string) => key !== 'item_id' && key !== 'usage' && key !== 'total_price');
          
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('id', row.item_id)
          .single();
          
          if (product) {
          const nextRow = { ...row, item_id: row.item_id };
          fillKeys.forEach((key: string) => {
            const hasValue = nextRow[key] !== undefined && nextRow[key] !== null && nextRow[key] !== '';
            if (!hasValue && product[key] !== undefined && product[key] !== null) {
              nextRow[key] = product[key];
            }
          });

          if (!nextRow.unit) {
            nextRow.unit = product.unit || getColumnDefaultValue('unit');
          }
          if (!nextRow.buy_price && product.buy_price !== undefined && product.buy_price !== null) {
            nextRow.buy_price = product.buy_price;
          }

          return nextRow;
          }
      } catch (error) {
          console.error('Error enriching row:', error);
      }
      return row;
  };

  useEffect(() => {
      const fetchExternalData = async () => {
          if (mode === 'external_view' && externalSource?.moduleId && externalSource?.recordId) {
              setLoadingExternal(true);
              try {
                  const { data: extData, error } = await supabase
                      .from(externalSource.moduleId)
                      .select(externalSource.column || 'items')
                      .eq('id', externalSource.recordId)
                      .single();
                  
                  if (error) throw error;
                  const columnKey = externalSource.column || 'items';
                  const items = (extData as any)?.[columnKey] || [];
                  setData(items || []);
              } catch (err) {
                  console.error("Error fetching external data:", err);
                  setData([]);
              } finally {
                  setLoadingExternal(false);
              }
          } else {
              setData(initialData || []);
              if (mode === 'local') setTempData(initialData || []);
          }
      };
      fetchExternalData();
  }, [initialData, mode, externalSource?.recordId]);

  const calculateRowTotal = (row: any) => {
      const usage = parseFloat(row.usage) || parseFloat(row.qty) || 0;
      const price = parseFloat(row.buy_price) || parseFloat(row.price) || 0;
      return usage * price;
  };

  const startEdit = () => {
    if (readOnly) return;
    setIsEditing(true);
    const preparedData = (data || []).map((row: any) => ({
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
    if (mode === 'external_view') {
        message.info('ویرایش دیتای خارجی از این قسمت غیرفعال است.');
        return;
    }

    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('مشخصات ماژول یا رکورد یافت نشد');

      const dataToSave = tempData.map((row: any) => ({
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
    
    // اگر item_id تغییر کرد، مقادیر سفارشی را از محصول فراخوانی کن
    if (key === 'item_id' && value) {
      const enriched = await enrichRowWithProductData({ ...newData[index] });
      newData[index] = {
        ...enriched,
        total_price: calculateRowTotal(enriched)
      };
    }
    
    if (key === 'usage' || key === 'qty' || key === 'buy_price' || key === 'price') {
        newData[index]['total_price'] = calculateRowTotal(newData[index]);
    }
    
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const addRow = async () => {
    if (readOnly) return;
    const unitDefault = getColumnDefaultValue('unit');
    const newRow = { key: Date.now(), usage: 1, qty: 1, unit: unitDefault, buy_price: 0, total_price: 0 };
    const newData = [...tempData, newRow];
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const removeRow = (index: number) => {
    if (readOnly) return;
    const newData = [...tempData];
    newData.splice(index, 1);
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const handleScanClick = (index: number, fieldKey: string) => {
      setScanTarget({ rowIndex: index, fieldKey });
      setScannedCode('');
      setIsScanModalOpen(true);
  };

  const processScan = () => {
      if (!scanTarget || !scannedCode) return;
      const { rowIndex, fieldKey } = scanTarget;
      const specificKey = `${block.id}_${fieldKey}`;
      const options = relationOptions[specificKey] || relationOptions[fieldKey] || [];
      
      const foundOption = options.find((opt: any) => 
          opt.value === scannedCode || 
          opt.label.includes(scannedCode)
      );

      if (foundOption) {
          updateRow(rowIndex, fieldKey, foundOption.value);
          message.success(`محصول "${foundOption.label}" شناسایی شد`);
          setIsScanModalOpen(false);
      } else {
          message.error('محصولی با این مشخصات یافت نشد');
      }
  };

  const visibleTableColumns = (block.tableColumns || []).filter((col: any) => {
    if (!canViewField) return true;
    return canViewField(col.key) !== false;
  });

  const canShowTableTotal = canViewField ? canViewField('total_price') !== false : true;

  const columns = [
    ...(visibleTableColumns.map((col: any) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      width: getColumnWidth(col),
      ellipsis: true,
      render: (text: any, _record: any, index: number) => {
        if (!isEditing) {
          if (col.type === FieldType.RELATION) {
             const specificKey = `${block.id}_${col.key}`;
             const options = relationOptions[specificKey] || relationOptions[col.key] || [];
             const opt = options.find((o: any) => o.value === text);
             // اگر option پیدا شد، label را نمایش بده؛ اگر نه خالی نمایش بده
             const label = opt ? opt.label : '-';
             return <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>;
          }
          if (col.type === FieldType.SELECT) {
              const categoryKey = col.dynamicOptionsCategory || col.key;
              const options = dynamicOptions[categoryKey] || [];
              const opt = options.find((o: any) => (o.id || o.value || o) === text);
              const label = opt ? (opt.name || opt.label || opt) : '-';
              return <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>;
          }
          if (col.type === FieldType.MULTI_SELECT) {
              const categoryKey = col.dynamicOptionsCategory || col.key;
              const options = dynamicOptions[categoryKey] || [];
              const values = Array.isArray(text) ? text : (text ? [text] : []);
              const labels = values.map(v => {
                  const opt = options.find((o: any) => (o.id || o.value || o) === v);
                  return opt ? (opt.name || opt.label || opt) : v;
              }).join(', ');
              return <span className="font-medium text-gray-800 dark:text-gray-200">{labels || '-'}</span>;
          }
          if (col.type === FieldType.PRICE) {
              const persianPrice = formatPersianPrice(text);
              return <span className="persian-number font-bold">{persianPrice}</span>;
          }
          if (col.type === FieldType.NUMBER || col.type === FieldType.STOCK) {
              const persianNum = toPersianNumber(text);
              return <span className="persian-number font-bold">{persianNum}</span>;
          }
          return <span>{text}</span>;
        }

        if (col.type === FieldType.RELATION) {
            const specificKey = `${block.id}_${col.key}`;
            const options = relationOptions[specificKey] || relationOptions[col.key] || [];
            
            return (
                <Space.Compact style={{ width: '100%' }}>
                    <Select
                        showSearch
                        value={text}
                        onChange={(val: any) => updateRow(index, col.key, val)}
                        options={options}
                        optionFilterProp="label"
                        placeholder="جستجو..."
                        style={{ width: '100%' }}
                        filterOption={(input: any, option: any) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        // 👇 اصلاح برای باز شدن در مودال 👇
                        getPopupContainer={getSelectPopupContainer}
                        dropdownStyle={{ zIndex: 3000 }}
                    />
                    <Button 
                        icon={<QrcodeOutlined />} 
                        onClick={() => handleScanClick(index, col.key)} 
                        title="اسکن بارکد/QR"
                    />
                </Space.Compact>
            );
        }

        if (col.type === FieldType.SELECT) {
            // دریافت گزینه‌های این فیلد از dynamicOptions
            const categoryKey = col.dynamicOptionsCategory || col.key;
            const options = dynamicOptions[categoryKey] || [];
            
            return (
                <Select
                    value={text}
                    onChange={(val: any) => updateRow(index, col.key, val)}
                    options={options.map((opt: any) => ({ 
                        label: opt.name || opt.label || opt, 
                        value: opt.id || opt.value || opt 
                    }))}
                    placeholder="انتخاب کنید..."
                    style={{ width: '100%' }}
                    getPopupContainer={getSelectPopupContainer}
                    dropdownStyle={{ zIndex: 3000 }}
                />
            );
        }

        if (col.type === FieldType.MULTI_SELECT) {
            // دریافت گزینه‌های این فیلد از dynamicOptions
            const categoryKey = col.dynamicOptionsCategory || col.key;
            const options = dynamicOptions[categoryKey] || [];
            
            return (
                <Select
                    mode="multiple"
                    value={Array.isArray(text) ? text : (text ? [text] : [])}
                    onChange={(val: any) => updateRow(index, col.key, val)}
                    options={options.map((opt: any) => ({ 
                        label: opt.name || opt.label || opt, 
                        value: opt.id || opt.value || opt 
                    }))}
                    placeholder="انتخاب کنید..."
                    style={{ width: '100%' }}
                    getPopupContainer={getSelectPopupContainer}
                    dropdownStyle={{ zIndex: 3000 }}
                />
            );
        }

        if (col.type === FieldType.NUMBER || col.type === FieldType.PRICE) {
          return <InputNumber value={text} onChange={(val: any) => updateRow(index, col.key, val)} className="w-full" controls={false} />;
        }

        return <Input value={text} onChange={(e: any) => updateRow(index, col.key, e.target.value)} />;
      }
    })) || []),
    ...(isEditing ? [{ title: '', key: 'actions', width: 50, render: (_: any, __: any, i: number) => <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(i)} /> }] : [])
  ];

  // محاسبه جمع کل برای ستون‌های قیمتی
  const calculateTotal = () => {
    const dataToSum = isEditing ? tempData : data;
    return dataToSum.reduce((sum: number, row: any) => {
      const rowTotal = calculateRowTotal(row);
      return sum + rowTotal;
    }, 0);
  };

  if (loadingExternal) return <div className="p-10 text-center"><Spin /> <span className="text-gray-400 mr-2">در حال بارگذاری اقلام...</span></div>;

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border ${isEditing ? 'border-leather-500' : 'border-gray-200 dark:border-gray-800'} transition-all`}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <h3 className="font-bold text-lg text-gray-700 dark:text-white m-0 flex items-center gap-2">
          <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>
          {block.titles.fa}
          {mode === 'external_view' && <span className="text-xs font-normal text-gray-400 mr-2">(نمایش از سند مرتبط)</span>}
        </h3>
        
        <Space>
            {mode === 'external_view' && externalSource?.recordId && (
                <Link to={`/${externalSource.moduleId}/${externalSource.recordId}`} target="_blank">
                    <Button icon={<LinkOutlined />}>مشاهده جزئیات اصلی</Button>
                </Link>
            )}

          {mode === 'db' && !isEditing && !readOnly && (
                <Button size="small" icon={<EditOutlined />} onClick={startEdit}>ویرایش لیست</Button>
            )}
            
          {isEditing && mode !== 'local' && !readOnly && (
                <>
                <Button onClick={cancelEdit} disabled={saving} icon={<CloseOutlined />}>انصراف</Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} className="bg-green-500 border-none">ذخیره</Button>
                </>
            )}
        </Space>
      </div>

      <div className="overflow-x-auto custom-scrollbar px-2 sm:px-4">
        <Table
          dataSource={isEditing ? tempData : data}
          columns={columns}
          pagination={false}
          size="middle"
          rowKey={(record: any) => record.key || record.item_id || record.id || Math.random()} 
          locale={{ emptyText: <Empty description={mode === 'external_view' ? "لیست در سند مرتبط خالی است" : "لیست خالی است"} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          className="custom-erp-table min-w-[1000px] md:min-w-full"
          scroll={{ x: 'max-content' }}
          footer={(isEditing || mode === 'local') && !readOnly ? () => (
            <>
              <Button type="dashed" block icon={<PlusOutlined />} onClick={addRow}>افزودن ردیف جدید</Button>
              {(data.length > 0 || tempData.length > 0) && canShowTableTotal && (
                <div className="mt-4 flex justify-end items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <span className="font-bold text-blue-700 dark:text-blue-300">جمع کل:</span>
                  <span className="text-lg font-mono font-bold text-blue-900 dark:text-blue-100">
                    {calculateTotal().toLocaleString()} تومان
                  </span>
                </div>
              )}
            </>
          ) : undefined}
          summary={() => {
            if (!isEditing && mode !== 'local' && data.length > 0 && canShowTableTotal) {
              const total = calculateTotal();
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row className="bg-gray-50 dark:bg-gray-800">
                    <Table.Summary.Cell index={0} colSpan={block.tableColumns?.length - 1 || 3}>
                      <div className="text-right font-bold">جمع کل</div>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>
                      <div className="text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {total.toLocaleString()}
                      </div>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }
            return null;
          }}
        />
      </div>

      <Modal
        title={<Space><QrcodeOutlined /> اسکن محصول</Space>}
        open={isScanModalOpen}
        onCancel={() => setIsScanModalOpen(false)}
        onOk={processScan}
        okText="تایید"
        cancelText="لغو"
        zIndex={2000}
      >
          <div className="flex flex-col gap-4">
              <p className="text-gray-500">
                  لطفاً کد محصول را با بارکدخوان اسکن کنید یا به صورت دستی وارد نمایید:
              </p>
              <Input 
                autoFocus
                placeholder="کد محصول را اینجا اسکن کنید..." 
                value={scannedCode}
                onChange={e => setScannedCode(e.target.value)}
                onPressEnter={processScan}
                size="large"
                prefix={<QrcodeOutlined className="text-gray-400" />}
              />
          </div>
      </Modal>
    </div>
  );
};

>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
export default EditableTable;
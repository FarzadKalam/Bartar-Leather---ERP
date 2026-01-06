import React, { useState, useEffect } from 'react';
import { Table, Button, Input, InputNumber, Select, Space, message, Empty, Typography, Spin, Modal } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, CloseOutlined, LinkOutlined, QrcodeOutlined } from '@ant-design/icons';
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
  mode?: 'db' | 'local' | 'external_view';
  dynamicOptions?: Record<string, any[]>;
  externalSource?: {
      moduleId?: string;
      recordId?: string;
      column?: string;
  };
}

const EditableTable: React.FC<EditableTableProps> = ({ 
  block, initialData, moduleId, recordId, relationOptions, onSaveSuccess, onChange, 
  mode = 'db', dynamicOptions = {}, externalSource
}) => {
  const [isEditing, setIsEditing] = useState(mode === 'local');
  const [data, setData] = useState<any[]>(initialData || []);
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingExternal, setLoadingExternal] = useState(false);

  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<{ rowIndex: number, fieldKey: string } | null>(null);
  const [scannedCode, setScannedCode] = useState('');

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
                  const items = extData ? extData[externalSource.column || 'items'] : [];
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
    setIsEditing(true);
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
    if (mode === 'external_view') {
        message.info('ویرایش دیتای خارجی از این قسمت غیرفعال است.');
        return;
    }

    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('مشخصات ماژول یا رکورد یافت نشد');

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

  const updateRow = (index: number, key: string, value: any) => {
    const newData = [...tempData];
    newData[index] = { ...newData[index], [key]: value };
    
    if (key === 'usage' || key === 'qty' || key === 'buy_price' || key === 'price') {
        newData[index]['total_price'] = calculateRowTotal(newData[index]);
    }
    
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const addRow = () => {
    const newRow = { key: Date.now(), usage: 1, qty: 1, buy_price: 0, total_price: 0 };
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
      
      const foundOption = options.find(opt => 
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

  const columns = [
    ...(block.tableColumns?.map((col: any) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      width: col.key === 'item_id' || col.type === FieldType.RELATION ? 300 : undefined,
      render: (text: any, record: any, index: number) => {
        if (!isEditing) {
          if (col.type === FieldType.RELATION) {
             const specificKey = `${block.id}_${col.key}`;
             const options = relationOptions[specificKey] || relationOptions[col.key] || [];
             const opt = options.find((o: any) => o.value === text);
             const label = opt ? opt.label : text;
             return <span className="font-medium text-gray-800 dark:text-gray-200">{label || '-'}</span>;
          }
          if (col.type === FieldType.PRICE) return <span className="font-mono">{text ? Number(text).toLocaleString() : '0'}</span>;
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
                        onChange={(val) => updateRow(index, col.key, val)}
                        options={options}
                        optionFilterProp="label"
                        placeholder="جستجو..."
                        style={{ width: '100%' }}
                        filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        // 👇 اصلاح برای باز شدن در مودال 👇
                        getPopupContainer={(trigger) => trigger.parentNode}
                    />
                    <Button 
                        icon={<QrcodeOutlined />} 
                        onClick={() => handleScanClick(index, col.key)} 
                        title="اسکن بارکد/QR"
                    />
                </Space.Compact>
            );
        }

        if (col.type === FieldType.NUMBER || col.type === FieldType.PRICE) {
          return <InputNumber value={text} onChange={(val) => updateRow(index, col.key, val)} className="w-full" controls={false} />;
        }

        return <Input value={text} onChange={(e) => updateRow(index, col.key, e.target.value)} />;
      }
    })) || []),
    ...(isEditing ? [{ title: '', key: 'actions', width: 50, render: (_: any, __: any, i: number) => <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(i)} /> }] : [])
  ];

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

            {mode === 'db' && !isEditing && (
                <Button size="small" icon={<EditOutlined />} onClick={startEdit}>ویرایش لیست</Button>
            )}
            
            {isEditing && mode !== 'local' && (
                <>
                <Button onClick={cancelEdit} disabled={saving} icon={<CloseOutlined />}>انصراف</Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} className="bg-green-500 border-none">ذخیره</Button>
                </>
            )}
        </Space>
      </div>

      <Table
        dataSource={isEditing ? tempData : data}
        columns={columns}
        pagination={false}
        size="middle"
        rowKey={(record: any, index) => record.key || record.item_id || index || Math.random()} 
        locale={{ emptyText: <Empty description={mode === 'external_view' ? "لیست در سند مرتبط خالی است" : "لیست خالی است"} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        className="custom-erp-table"
        footer={(isEditing || mode === 'local') ? () => (
          <Button type="dashed" block icon={<PlusOutlined />} onClick={addRow}>افزودن ردیف جدید</Button>
        ) : undefined}
      />

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

export default EditableTable;
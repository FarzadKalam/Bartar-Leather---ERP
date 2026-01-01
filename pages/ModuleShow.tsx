import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Descriptions, Tag, Spin, Image, Breadcrumb, Tabs, message, App, Upload, Input, InputNumber, Select, Tooltip, Popover, QRCode, Divider, Space, Table, Empty, Drawer } from 'antd';
import { 
  ArrowRightOutlined, DeleteOutlined, HomeOutlined, EditOutlined, 
  CheckOutlined, CloseOutlined, UploadOutlined, LoadingOutlined, 
  PrinterOutlined, ShareAltOutlined, QrcodeOutlined, AppstoreOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, BlockType, LogicOperator, FieldLocation } from '../types';
import EditableTable from '../components/EditableTable';
import SmartForm from '../components/SmartForm';

const ModuleShow: React.FC = () => {
  const { moduleId = 'products', id } = useParams();
  const navigate = useNavigate();
  const { message: msg, modal } = App.useApp();
  const moduleConfig = MODULES[moduleId];

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // استیت برای دراور ویرایش کامل
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  // استیت‌های ویرایش سریع (Inline)
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  const [tempValues, setTempValues] = useState<Record<string, any>>({});
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // استیت آپشن‌ها و ریلیشن‌ها
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});

  useEffect(() => {
    fetchRecord();
  }, [moduleId, id]);

  // وقتی دیتا لود شد، آپشن‌ها را بر اساس دیتای موجود فچ کن (برای حل مشکل نمایش نام در جدول)
  useEffect(() => {
    if (data) fetchOptions(data);
  }, [data]);

  const fetchRecord = async () => {
    if (!id || !moduleConfig) return;
    setLoading(true);
    const { data: record, error } = await supabase.from(moduleId).select('*').eq('id', id).single();
    if (!error && record) setData(record);
    else msg.error('خطا در دریافت اطلاعات');
    setLoading(false);
  };

  const fetchOptions = async (recordData: any = null) => {
    if (!moduleConfig) return;

    // 1. دریافت آپشن‌های داینامیک (رنگ، جنس و...)
    const dynFields = moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory);
    const dynOpts: Record<string, any[]> = {};
    for (const field of dynFields) {
        const cat = (field as any).dynamicOptionsCategory;
        const { data } = await supabase.from('option_sets').select('label, value').eq('category', cat);
        if (data) dynOpts[cat] = data.filter(i => i.value !== null);
    }
    setDynamicOptions(dynOpts);

    // 2. دریافت ریلیشن‌ها (برای فیلدهای فرم + ستون‌های جدول)
    const relFields = [...moduleConfig.fields.filter(f => f.type === FieldType.RELATION)];
    
    // اضافه کردن ستون‌های ریلیشن جداول به لیست درخواست
    moduleConfig.blocks?.forEach(b => {
        if (b.type === BlockType.TABLE && b.tableColumns) {
            b.tableColumns.forEach(c => {
                if (c.type === FieldType.RELATION) {
                    // کلید اختصاصی برای ستون جدول
                    relFields.push({ ...c, key: `${b.id}_${c.key}` }); 
                }
            });
        }
    });

    const relOpts: Record<string, any[]> = {};
    for (const field of relFields) {
        if (field.relationConfig) {
            const { targetModule, targetField } = field.relationConfig;
            
            // کوئری هوشمند: دریافت نام و کد برای نمایش بهتر
            const { data: relData } = await supabase
                .from(targetModule)
                .select(`id, ${targetField}, system_code`)
                .limit(200); // لیمیت برای جلوگیری از سنگین شدن
            
            if (relData) {
                const options = relData.map(i => ({ 
                    label: `${i[targetField]} ${i.system_code ? `(${i.system_code})` : ''}`, 
                    value: i.id 
                })).filter(i => i.value !== null);
                
                // ذخیره با کلید اصلی
                relOpts[field.key] = options;
                
                // اگر کلید ترکیبی بود (مثلا bundleItems_item_id)، با کلید ساده هم ذخیره کن که EditableTable پیدا کند
                if (field.key.includes('_')) {
                    const originalKey = field.key.split('_').pop(); 
                    if (originalKey) relOpts[originalKey] = options; 
                }
            }
        }
    }
    setRelationOptions(relOpts);
  };

  const handleAddOption = async (category: string, newValue: string) => {
      if(!newValue) return;
      const { error } = await supabase.from('option_sets').insert([{ category, label: newValue, value: newValue }]);
      if(!error) {
          msg.success('گزینه اضافه شد');
          setDynamicOptions(prev => ({ ...prev, [category]: [...(prev[category] || []), { label: newValue, value: newValue }] }));
      } else {
          msg.error('خطا در افزودن');
      }
  };

  const handleDelete = () => {
    modal.confirm({
      title: 'حذف رکورد',
      content: 'آیا از حذف این رکورد اطمینان دارید؟',
      okType: 'danger',
      onOk: async () => {
        const { error } = await supabase.from(moduleId).delete().eq('id', id);
        if (!error) { msg.success('حذف شد'); navigate(`/${moduleId}`); }
        else msg.error(error.message);
      }
    });
  };

  const handleImageUpdate = async (file: File) => {
    setUploadingImage(true);
    try {
      const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
      const { error: upErr } = await supabase.storage.from('images').upload(fileName, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
      
      await supabase.from(moduleId).update({ image_url: urlData.publicUrl }).eq('id', id);
      setData((prev: any) => ({ ...prev, image_url: urlData.publicUrl }));
      msg.success('تصویر بروزرسانی شد');
    } catch (e: any) {
      msg.error('خطا: ' + e.message);
    } finally {
      setUploadingImage(false);
    }
    return false;
  };

  // --- Inline Edit Functions ---
  const startEdit = (key: string, value: any) => {
    setEditingFields(prev => ({ ...prev, [key]: true }));
    setTempValues(prev => ({ ...prev, [key]: value }));
  };

  const cancelEdit = (key: string) => {
    setEditingFields(prev => ({ ...prev, [key]: false }));
    const newTemps = { ...tempValues };
    delete newTemps[key];
    setTempValues(newTemps);
  };

  const saveEdit = async (key: string) => {
    setSavingField(key);
    const newValue = tempValues[key];
    try {
      const { error } = await supabase.from(moduleId).update({ [key]: newValue }).eq('id', id);
      if (error) throw error;
      
      setData((prev: any) => ({ ...prev, [key]: newValue }));
      msg.success('ذخیره شد');
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
    } catch (error: any) {
      msg.error(error.message);
    } finally {
      setSavingField(null);
    }
  };

  const checkVisibility = (logic: any) => {
    if (!logic || !logic.visibleIf) return true;
    const { field, operator, value } = logic.visibleIf;
    const currentValue = data[field];
    if (operator === LogicOperator.EQUALS) return currentValue === value;
    if (operator === LogicOperator.NOT_EQUALS) return currentValue !== value;
    return true;
  };

  const getOptionLabel = (field: any, value: any) => {
      let opt = field.options?.find((o: any) => o.value === value);
      if (opt) return opt.label;

      if ((field as any).dynamicOptionsCategory) {
          const cat = (field as any).dynamicOptionsCategory;
          opt = dynamicOptions[cat]?.find((o: any) => o.value === value);
          if (opt) return opt.label;
      }

      if (field.type === FieldType.RELATION) {
          // جستجو در تمام لیست‌های ریلیشن
          for (const key in relationOptions) {
              const found = relationOptions[key]?.find((o: any) => o.value === value);
              if (found) return found.label;
          }
      }
      return value;
  };

  const renderSmartField = (field: any, isHeader = false) => {
    const isEditing = editingFields[field.key];
    const value = data[field.key];
    const tempValue = tempValues[field.key] !== undefined ? tempValues[field.key] : (value ?? undefined);

    if (isEditing) {
      let inputNode;
      let options = field.options;
      if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
      else if (field.type === FieldType.RELATION) options = relationOptions[field.key];

      if ((field as any).dynamicOptionsCategory) {
          inputNode = (
            <Select
                value={tempValue}
                onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))}
                className="w-full"
                showSearch
                placeholder="انتخاب یا تایپ..."
                filterOption={(input, option) => (option?.label as string ?? '').includes(input)}
                options={options}
                dropdownRender={(menu) => (<><>{menu}</><Divider style={{ margin: '8px 0' }} /><Space style={{ padding: '0 8px 4px' }}><Input placeholder="جدید..." onPressEnter={(e) => handleAddOption((field as any).dynamicOptionsCategory, e.currentTarget.value)} /></Space></>)}
            />
          );
      } else if (field.type === FieldType.SELECT || field.type === FieldType.STATUS || field.type === FieldType.RELATION) {
           inputNode = <Select value={tempValue} onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" options={options} showSearch filterOption={(input, option) => (option?.label as string ?? '').includes(input)} />;
      } else if (field.type === FieldType.PRICE) {
           inputNode = <InputNumber formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value!.replace(/\$\s?|(,*)/g, '')} value={tempValue} onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" />;
      } else if (field.type === FieldType.NUMBER || field.type === FieldType.STOCK || field.type === FieldType.PERCENTAGE) {
           inputNode = <InputNumber value={tempValue} onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" />;
      } else {
           inputNode = <Input value={tempValue} onChange={e => setTempValues(prev => ({ ...prev, [field.key]: e.target.value }))} />;
      }

      return (
        <div className="flex items-center gap-1 animate-fadeIn min-w-[150px]">
          <div className="flex-1">{inputNode}</div>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => saveEdit(field.key)} loading={savingField === field.key} className="bg-green-500 hover:!bg-green-600 border-none" />
          <Button size="small" icon={<CloseOutlined />} onClick={() => cancelEdit(field.key)} danger />
        </div>
      );
    }

    let displayContent;
    if (value === null || value === undefined || value === '') {
       displayContent = <span className="text-gray-300 text-xs italic">---</span>;
    } else if (field.type === FieldType.PRICE) {
       displayContent = <span className="font-mono font-bold text-lg">{Number(value).toLocaleString()} <span className="text-[10px] text-gray-500 font-sans font-normal">تومان</span></span>;
    } else if (field.type === FieldType.STATUS) {
       const opt = field.options?.find((o: any) => o.value === value);
       displayContent = <Tag color={opt?.color || 'default'} className="px-2 py-0.5 text-sm">{opt?.label || value}</Tag>;
    } else if (field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.RELATION) {
        displayContent = <span className="font-medium">{getOptionLabel(field, value)}</span>;
    } else if (field.type === FieldType.STOCK) {
        displayContent = <span className={`font-mono font-bold ${value < (data.reorder_point || 10) ? 'text-red-500' : 'text-green-600'}`}>{value}</span>;
    } else {
       displayContent = <span className="font-medium">{value}</span>;
    }

    if (isHeader) {
        return (
            <div className="group flex items-center gap-2 cursor-pointer" onClick={() => !field.readonly && startEdit(field.key, value)}>
                {displayContent}
                {!field.readonly && <EditOutlined className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />}
            </div>
        );
    }

    return (
      <div className="group flex items-center justify-between min-h-[32px] hover:bg-gray-50 dark:hover:bg-white/5 px-3 rounded-lg -mx-3 transition-colors cursor-pointer border border-transparent hover:border-gray-100 dark:hover:border-gray-700" onClick={() => !field.readonly && startEdit(field.key, value)}>
        <div className="text-gray-800 dark:text-gray-200">{displayContent}</div>
        {!field.readonly && (
          <EditOutlined className="text-leather-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    );
  };

  if (!moduleConfig || !data) return loading ? <div className="flex h-screen items-center justify-center"><Spin size="large" /></div> : null;

  const fieldGroups = moduleConfig.blocks?.filter(b => b.type === BlockType.FIELD_GROUP && checkVisibility(b));
  const tableBlocks = moduleConfig.blocks?.filter(b => b.type === BlockType.TABLE && checkVisibility(b));

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto pb-20">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
             <Button icon={<ArrowRightOutlined />} onClick={() => navigate(`/${moduleId}`)} shape="circle" size="large" className="border-none shadow-sm" />
             <Breadcrumb items={[{ title: <HomeOutlined />, onClick: () => navigate('/') }, { title: moduleConfig.titles.fa, onClick: () => navigate(`/${moduleId}`) }, { title: data.name }]} />
        </div>
        <div className="flex gap-2">
            <Tooltip title="چاپ"><Button icon={<PrinterOutlined />} onClick={() => window.print()} /></Tooltip>
            <Tooltip title="اشتراک گذاری"><Button icon={<ShareAltOutlined />} /></Tooltip>
            <Popover content={<QRCode value={window.location.href} bordered={false} />} trigger="click">
                <Button icon={<QrcodeOutlined />}>QR</Button>
            </Popover>
            {/* دکمه ویرایش کامل */}
            <Button icon={<EditOutlined />} onClick={() => setIsEditDrawerOpen(true)}>ویرایش کامل</Button>
            <Button icon={<DeleteOutlined />} danger onClick={handleDelete} className="hidden md:flex">حذف رکورد</Button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 mb-6 flex flex-col lg:flex-row gap-8 items-stretch relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-leather-500 to-leather-800 opacity-80"></div>

         <div className="w-40 h-40 lg:w-56 lg:h-56 shrink-0 rounded-2xl border-4 border-white dark:border-gray-700 shadow-xl relative group overflow-hidden bg-gray-100 dark:bg-black/20 self-center lg:self-start">
             {data.image_url ? (
                 <Image src={data.image_url} className="w-full h-full" style={{objectFit: 'cover', width: '100%', height: '100%'}} />
             ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                    <LoadingOutlined className="text-3xl opacity-20" />
                    <span className="text-xs">بدون تصویر</span>
                 </div>
             )}
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center backdrop-blur-sm">
                 <Upload showUploadList={false} beforeUpload={handleImageUpdate}>
                     <Button type="primary" icon={uploadingImage ? <LoadingOutlined /> : <UploadOutlined />} className="bg-leather-500 border-none">
                        {uploadingImage ? 'در حال آپلود...' : 'تغییر تصویر'}
                     </Button>
                 </Upload>
             </div>
         </div>
         
         <div className="flex-1 w-full flex flex-col justify-center">
             <div>
                 <div className="flex flex-wrap items-center gap-3 mb-4 mt-2">
                     {editingFields['name'] ? (
                         <div className="flex items-center gap-2">
                            <Input value={tempValues['name'] ?? data.name} onChange={e => setTempValues(prev => ({...prev, name: e.target.value}))} className="text-2xl font-bold w-full md:w-96" />
                            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => saveEdit('name')} />
                            <Button size="small" icon={<CloseOutlined />} onClick={() => cancelEdit('name')} />
                         </div>
                     ) : (
                        <h1 className="text-3xl font-black m-0 text-gray-800 dark:text-white cursor-pointer hover:text-leather-600 transition-colors" onClick={() => startEdit('name', data.name)}>
                            {data.name}
                        </h1>
                     )}
                     
                     {moduleConfig.fields.find(f => f.key === 'status') && renderSmartField(moduleConfig.fields.find(f => f.key === 'status'), true)}
                     {(data.system_code || data.custom_code) && (
                        <Tag className="font-mono dir-ltr bg-gray-100 dark:bg-white/10 border-none text-gray-500 px-2 py-1">
                            {data.system_code || data.custom_code}
                        </Tag>
                     )}
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-8">
                     {moduleConfig.fields
                        .filter(f => f.location === FieldLocation.HEADER && !['name', 'image_url', 'status', 'system_code'].includes(f.key))
                        .map(f => (
                            <div key={f.key} className="flex flex-col gap-1 border-r last:border-0 border-gray-100 dark:border-gray-700 px-4 first:pr-0">
                                <span className="text-xs text-gray-400 uppercase tracking-wider">{f.labels.fa}</span>
                                {renderSmartField(f, true)}
                            </div>
                        ))}
                 </div>
             </div>

             <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                 {data.category && (
                    <Tag icon={<AppstoreOutlined />} className="rounded-full px-3 py-1 bg-gray-50 dark:bg-white/5 border-none text-gray-600 dark:text-gray-300">
                        {getOptionLabel(moduleConfig.fields.find(f => f.key === 'category'), data.category)}
                    </Tag>
                 )}
                 {data.product_type && (
                    <Tag className="rounded-full px-3 py-1 bg-leather-50 text-leather-600 border-none">
                        {getOptionLabel(moduleConfig.fields.find(f => f.key === 'product_type'), data.product_type)}
                    </Tag>
                 )}
             </div>
         </div>
      </div>

      {fieldGroups && fieldGroups.length > 0 && (
          <div className="bg-white dark:bg-[#1a1a1a] p-1 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 mb-6">
              <Tabs 
                tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
                items={fieldGroups.map(block => ({
                  key: block.id,
                  label: <span className="flex items-center gap-2 py-3">{block.titles.fa}</span>,
                  children: (
                      <div className="p-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                             {moduleConfig.fields.filter(f => f.blockId === block.id).map(f => (
                                (!f.logic || checkVisibility(f.logic)) && (
                                    <div key={f.key} className="flex flex-col gap-1">
                                        <span className="text-xs text-gray-400">{f.labels.fa}</span>
                                        {renderSmartField(f)}
                                    </div>
                                )
                             ))}
                          </div>
                      </div>
                  )
              }))} />
          </div>
      )}

      {/* --- Editable Tables --- */}
      {tableBlocks && tableBlocks.length > 0 && (
          <div className="space-y-6">
              {tableBlocks.map(block => (
                  <EditableTable 
                    key={block.id}
                    block={block}
                    initialData={data[block.id] || []} 
                    moduleId={moduleId}
                    recordId={id!}
                    relationOptions={relationOptions} 
                    onSaveSuccess={(newData) => setData(prev => ({ ...prev, [block.id]: newData }))}
                  />
              ))}
          </div>
      )}

      {/* --- Full Edit Drawer --- */}
      <Drawer
        title={`ویرایش ${data.name}`}
        width={720}
        onClose={() => setIsEditDrawerOpen(false)}
        open={isEditDrawerOpen}
        styles={{ body: { paddingBottom: 80 } }}
        destroyOnClose
        zIndex={5000}
      >
        <SmartForm 
            moduleConfig={moduleConfig}
            mode="edit"
            recordId={id}
            initialValues={data}
            onSuccess={() => {
                setIsEditDrawerOpen(false);
                fetchRecord();
            }}
            onCancel={() => setIsEditDrawerOpen(false)}
        />
      </Drawer>

      <style>{`
        .custom-erp-table .ant-table-thead > tr > th { background: #f9fafb !important; color: #6b7280 !important; font-size: 12px !important; }
        .dark .custom-erp-table .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; border-bottom: 1px solid #303030 !important; }
        .dark .ant-tabs-tab { color: #888; }
        .dark .ant-tabs-tab-active .ant-tabs-tab-btn { color: white !important; }
        .dark .ant-table-cell { background: #1a1a1a !important; color: #ddd !important; border-bottom: 1px solid #303030 !important; }
        .dark .ant-table-tbody > tr:hover > td { background: #222 !important; }
      `}</style>
    </div>
  );
};

export default ModuleShow;
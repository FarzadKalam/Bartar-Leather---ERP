import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Descriptions, Tag, Spin, Empty, Image, Breadcrumb, message, Input, InputNumber, Select, App, Upload } from 'antd';
import { ArrowRightOutlined, EditOutlined, DeleteOutlined, HomeOutlined, CheckOutlined, CloseOutlined, UploadOutlined, LoadingOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';

const ModuleShow: React.FC = () => {
  const { moduleId = 'products', id } = useParams();
  const navigate = useNavigate();
  const { message: msg, modal } = App.useApp();
  const moduleConfig = MODULES[moduleId];

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  const [tempValues, setTempValues] = useState<Record<string, any>>({});
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchRecord();
  }, [moduleId, id]);

  const fetchRecord = async () => {
    if (!id || !moduleConfig) return;
    setLoading(true);
    const { data: record, error } = await supabase.from(moduleId).select('*').eq('id', id).single();
    if (!error && record) setData(record);
    else msg.error('خطا در دریافت اطلاعات');
    setLoading(false);
  };

  const handleDelete = () => {
    modal.confirm({
      title: 'حذف رکورد',
      content: 'آیا مطمئن هستید؟',
      okType: 'danger',
      onOk: async () => {
        const { error } = await supabase.from(moduleId).delete().eq('id', id);
        if (!error) { msg.success('حذف شد'); navigate(`/${moduleId}`); }
        else msg.error(error.message);
      }
    });
  };

  const startEdit = (key: string, value: any) => {
    setEditingFields(prev => ({ ...prev, [key]: true }));
    setTempValues(prev => ({ ...prev, [key]: value }));
  };

  const cancelEdit = (key: string) => {
    setEditingFields(prev => ({ ...prev, [key]: false }));
    setTempValues(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const saveEdit = async (key: string) => {
    setSavingField(key);
    const newValue = tempValues[key];
    try {
      const { error } = await supabase.from(moduleId).update({ [key]: newValue }).eq('id', id);
      if (error) throw error;
      
      setData((prev: any) => ({ ...prev, [key]: newValue }));
      msg.success('ذخیره شد');
      // بستن ادیت با کمی تاخیر برای اطمینان
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
      
    } catch (error: any) {
      msg.error(error.message);
    } finally {
      setSavingField(null);
    }
  };

  const handleImageUpdate = async (file: File) => {
    setUploadingImage(true);
    try {
      const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
      const { error: upErr } = await supabase.storage.from('images').upload(fileName, file);
      if (upErr) throw upErr;
      
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const { error: updateErr } = await supabase.from(moduleId).update({ image_url: publicUrl }).eq('id', id);
      if (updateErr) throw updateErr;

      setData((prev: any) => ({ ...prev, image_url: publicUrl }));
      msg.success('تصویر ویرایش شد');
    } catch (e: any) {
      msg.error('خطا: ' + e.message);
    } finally {
      setUploadingImage(false);
    }
    return false;
  };

  // تابع کمکی برای پیدا کردن لیبل فارسی آپشن‌ها
  const getOptionLabel = (field: any, value: any) => {
      const opt = field.options?.find((o: any) => o.value === value);
      return opt ? opt.label : value;
  };

  const renderFieldItem = (field: any) => {
    const isEditing = editingFields[field.key];
    const value = data[field.key];
    const tempValue = tempValues[field.key] !== undefined ? tempValues[field.key] : value;

    if (isEditing) {
      // --- MODE: EDIT ---
      let inputNode;
      if (field.type === FieldType.SELECT || field.type === FieldType.STATUS) {
           inputNode = <Select value={tempValue} onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" options={field.options} />;
      } else if (field.type === FieldType.NUMBER || field.type === FieldType.PRICE) {
           inputNode = <InputNumber value={tempValue} onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" />;
      } else {
           inputNode = <Input value={tempValue} onChange={e => setTempValues(prev => ({ ...prev, [field.key]: e.target.value }))} />;
      }

      return (
        <div className="flex items-center gap-2 animate-fadeIn">
          <div className="flex-1">{inputNode}</div>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => saveEdit(field.key)} loading={savingField === field.key} />
          <Button size="small" icon={<CloseOutlined />} onClick={() => cancelEdit(field.key)} danger />
        </div>
      );
    }

    // --- MODE: VIEW ---
    let displayContent;
    if (value === null || value === undefined || value === '') {
       displayContent = <span className="text-gray-300 text-xs italic">خالی</span>;
    } else if (field.type === FieldType.PRICE) {
       displayContent = <span>{Number(value).toLocaleString()} <span className="text-[10px] text-gray-500">تومان</span></span>;
    } else if (field.type === FieldType.STATUS) {
       const opt = field.options?.find((o: any) => o.value === value);
       displayContent = <Tag color={opt?.color || 'default'}>{opt?.label || value}</Tag>;
    } else if (field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT) {
        // اصلاح: نمایش لیبل فارسی به جای مقدار انگلیسی
        displayContent = <span>{getOptionLabel(field, value)}</span>;
    } else {
       displayContent = <span>{value}</span>;
    }

    return (
      <div className="group flex items-center justify-between min-h-[28px] hover:bg-gray-50 dark:hover:bg-white/5 px-2 rounded -mx-2 transition-colors">
        <div className="text-gray-800 dark:text-gray-200">{displayContent}</div>
        {!field.readonly && (
          <EditOutlined className="text-gray-400 hover:text-leather-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEdit(field.key, value)} />
        )}
      </div>
    );
  };

  if (!moduleConfig || !data) return null; // یا اسپینر

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-20">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
             <Button icon={<ArrowRightOutlined />} onClick={() => navigate(`/${moduleId}`)} shape="circle" size="large" />
             <Breadcrumb items={[{ title: <HomeOutlined /> }, { title: moduleConfig.titles.fa }, { title: data.name }]} />
        </div>
        <Button icon={<DeleteOutlined />} danger onClick={handleDelete}>حذف</Button>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-800 mb-6 flex flex-col md:flex-row gap-6 items-start">
         {/* بخش تصویر با قابلیت ویرایش */}
         <div className="w-32 h-32 md:w-48 md:h-48 shrink-0 rounded-2xl border border-gray-200 relative group overflow-hidden">
             {data.image_url ? (
                 <Image src={data.image_url} className="w-full h-full object-cover" />
             ) : (
                 <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">بدون تصویر</div>
             )}
             {/* دکمه آپلود روی تصویر */}
             <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <Upload showUploadList={false} beforeUpload={handleImageUpdate}>
                     <Button type="primary" icon={uploadingImage ? <LoadingOutlined /> : <UploadOutlined />}>
                        {uploadingImage ? '...' : 'تغییر'}
                     </Button>
                 </Upload>
             </div>
         </div>
         
         <div className="flex-1 w-full">
             <div className="flex items-center gap-3 mb-4">
                 <h1 className="text-2xl font-black m-0">{data.name}</h1>
                 {data.system_code && <Tag color="gold" className="font-mono dir-ltr">{data.system_code}</Tag>}
             </div>
             
             <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" layout="vertical">
                 {moduleConfig.fields.filter(f => f.location === 'header' && f.key !== 'image_url').map(f => (
                    <Descriptions.Item key={f.key} label={<span className="text-gray-500 text-xs">{f.labels.fa}</span>}>
                        {renderFieldItem(f)}
                    </Descriptions.Item>
                 ))}
             </Descriptions>
         </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-800">
          <h3 className="font-bold text-lg mb-4 border-b border-gray-100 pb-2">سایر مشخصات</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {moduleConfig.fields.filter(f => f.location === 'block').map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">{f.labels.fa}</span>
                    {renderFieldItem(f)}
                </div>
             ))}
          </div>
      </div>
    </div>
  );
};

export default ModuleShow;
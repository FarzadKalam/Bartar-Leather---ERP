import React, { useState, useRef, useEffect } from 'react';
import { PlusOutlined, LoadingOutlined, DeleteOutlined } from '@ant-design/icons';
import { FieldType, ModuleField } from '../types';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {
  Input, InputNumber, Switch, Select, Upload, Button, Divider, Space, message, Image, Modal, TimePicker
} from 'antd';
import { DatePicker as DatePickerJalali } from 'antd-jalali';

dayjs.extend(jalaliday);
dayjs.extend(customParseFormat);

interface SmartFieldRendererProps {
  label: string;
  value: any;
  type: FieldType;
  options?: { label: string; value: any; color?: string }[];
  onSave: (value: any) => void;
  forceEditMode?: boolean;
  fieldKey: string; 
  relationConfig?: ModuleField['relationConfig'];
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({
  label, value, type, options = [], onSave, forceEditMode = false, fieldKey, relationConfig
}) => {
  const [items, setItems] = useState(options || []);
  const [newItemName, setNewItemName] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<any>(null);

  // --- RELATION: سرچ + افزودن سریع ---
  const [relationOptions, setRelationOptions] = useState<{ label: string; value: any }[]>([]);
  const [relationLoading, setRelationLoading] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const searchTimer = useRef<any>(null);

  const isSystemCode = fieldKey === 'system_code';

  const baseLabel = (label || '').replace(/\s*\*\s*$/, '');

  const toJalaliDayjs = (raw: any) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const d = dayjs.isDayjs(raw) ? raw : dayjs(raw);
    if (!d.isValid()) return null;
    try {
      return d.calendar('jalali');
    } catch {
      return d;
    }
  };

  const toTimeDayjs = (raw: any) => {
    if (raw === undefined || raw === null || raw === '') return null;
    if (dayjs.isDayjs(raw)) return raw;
    const str = String(raw);
    const d = dayjs(str, ['HH:mm:ss', 'HH:mm'], true);
    return d.isValid() ? d : null;
  };

  useEffect(() => {
  if (!relationConfig?.targetModule) return;
  setRelationOptions([]);

  (async () => {
    try {
      if (value === undefined || value === null || value === '') return;
      const targetField = relationConfig.targetField || 'name';
      const { data, error } = await supabase
        .from(relationConfig.targetModule)
        .select(`id, ${targetField}`)
        .eq('id', value)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const opt = { value: data.id, label: (data as any)?.[targetField] ?? data.id };
        setRelationOptions([opt]);
      }
    } catch {}
  })();
}, [relationConfig?.targetModule, relationConfig?.targetField, value]);

// fetchRelationOptions مقاوم:
const fetchRelationOptions = async (search?: string) => {
  if (!relationConfig?.targetModule) return;
  const primaryTargetField = relationConfig.targetField || 'name';

  setRelationLoading(true);
  try {
    const candidates: (string | null)[] = [
      primaryTargetField,
      primaryTargetField !== 'name' ? 'name' : null,
      primaryTargetField !== 'full_name' ? 'full_name' : null,
      primaryTargetField !== 'title' ? 'title' : null,
      primaryTargetField !== 'email' ? 'email' : null,
      primaryTargetField !== 'username' ? 'username' : null,
      null,
    ].filter((x, idx, arr) => arr.indexOf(x) === idx);

    let data: any[] = [];
    let usedField: string | null = primaryTargetField;
    let lastError: any = null;

    for (const f of candidates) {
      usedField = f;
      let q = supabase
        .from(relationConfig.targetModule)
        .select(f ? `id, ${f}` : 'id')
        .limit(30);

      if (relationConfig.filter && typeof relationConfig.filter === 'object') {
        q = q.match(relationConfig.filter);
      }

      if (f && search && search.trim()) {
        q = q.ilike(f, `%${search.trim()}%`);
      }

      const res = await q;
      if (!res.error) {
        data = (res.data || []) as any[];
        lastError = null;
        break;
      }
      lastError = res.error;
    }

    if (lastError) throw lastError;

    const opts = (data || []).map((row: any) => ({
      value: row.id,
      label: (usedField ? row?.[usedField] : null) ?? row.id,
    }));
    setRelationOptions(opts);
  } catch (err: any) {
    message.error('خطا در دریافت لیست: ' + (err?.message || ''));
  } finally {
    setRelationLoading(false);
  }
}
  const handleRelationSearch = (txt: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchRelationOptions(txt);
    }, 250);
  };

  const handleQuickCreate = async () => {
    if (!relationConfig?.targetModule) return;
    const name = quickCreateName.trim();
    if (!name) {
      message.error('نام را وارد کنید');
      return;
    }
    const targetField = relationConfig.targetField || 'name';

    try {
      const payload: any = { [targetField]: name };
      if (relationConfig.filter && typeof relationConfig.filter === 'object') {
        Object.assign(payload, relationConfig.filter);
      }

      const { data, error } = await supabase
        .from(relationConfig.targetModule)
        .insert([payload])
        .select('id, ' + targetField)
        .single();
      if (error) throw error;

      const createdOpt = { value: data.id, label: data?.[targetField] ?? name };
      setRelationOptions(prev => {
        if (prev.some(o => o.value === createdOpt.value)) return prev;
        return [createdOpt, ...prev];
      });
      onSave(createdOpt.value);
      setQuickCreateName('');
      setQuickCreateOpen(false);
      message.success('اضافه شد');
    } catch (err: any) {
      message.error('خطا در افزودن: ' + (err?.message || ''));
    }
  };
  
  // --- اصلاح شده: نام باکت به 'images' تغییر کرد ---
  const handleUpload = async (file: File) => {
    try {
        setUploading(true);
        const fileExt = file.name.split('.').pop();
        // اسم فایل رو رندوم میکنیم که تداخل پیش نیاد
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // 1. آپلود در باکت images
        const { error: uploadError } = await supabase.storage
            .from('images') // <--- اصلاح شد
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 2. دریافت لینک عمومی از باکت images
        const { data: urlData } = supabase.storage
            .from('images') // <--- اصلاح شد
            .getPublicUrl(fileName);
        
        onSave(urlData.publicUrl);
        message.success('تصویر بارگذاری شد');
    } catch (error: any) {
        message.error('خطا در آپلود: ' + error.message);
    } finally {
        setUploading(false);
    }
    return false; 
  };

  const addItem = (e: React.MouseEvent) => {
    e.preventDefault();
    if (newItemName) {
      setItems([...items, { label: newItemName, value: newItemName }]);
      setNewItemName('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const renderInput = () => {
    if (isSystemCode) {
        return <Input value={value} disabled placeholder="(تولید خودکار)" className="bg-gray-50 text-gray-500 cursor-not-allowed" />;
    }

    switch (type) {
      case FieldType.TEXT:
        return <Input value={value} onChange={e => onSave(e.target.value)} placeholder={baseLabel} />;
      
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.STOCK:
      case FieldType.PERCENTAGE:
        return (
          <InputNumber 
            value={value} 
            onChange={val => onSave(val)} 
            style={{ width: '100%' }} 
            formatter={(val) => {
              if (val === null || val === undefined) return '';
              const str = `${val}`;
              if (type === FieldType.PRICE) return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              if (type === FieldType.PERCENTAGE) return str + '%';
              return str;
            }}
            parser={(val) => {
              if (!val) return '';
              return val.replace(/%/g, '').replace(/\$\s?|(,*)/g, '');
            }}
            placeholder={baseLabel}
            min={type === FieldType.PERCENTAGE ? 0 : undefined}
            max={type === FieldType.PERCENTAGE ? 100 : undefined}
          />
        );

      case FieldType.LONG_TEXT:
        return <Input.TextArea value={value} onChange={e => onSave(e.target.value)} rows={4} placeholder={baseLabel} />;

      case FieldType.CHECKBOX:
        return (
          <div className="flex items-center justify-between gap-3 bg-gray-50/60 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{baseLabel}</span>
            <Switch checked={!!value} onChange={val => onSave(val)} />
          </div>
        );

      case FieldType.DATE:
        return (
          <DatePickerJalali
            style={{ width: '100%' }}
            value={toJalaliDayjs(value)}
            placeholder={baseLabel}
            format="YYYY/MM/DD"
            onChange={(d) => {
              if (!d) return onSave(null);
              try {
                onSave(d.calendar('gregory').format('YYYY-MM-DD'));
              } catch {
                onSave(d.format('YYYY-MM-DD'));
              }
            }}
          />
        );

      case FieldType.TIME:
        return (
          <TimePicker
            style={{ width: '100%' }}
            value={toTimeDayjs(value)}
            placeholder={baseLabel}
            format="HH:mm"
            onChange={(d) => {
              if (!d) return onSave(null);
              onSave(d.format('HH:mm:ss'));
            }}
          />
        );

      case FieldType.DATETIME:
        return (
          <DatePickerJalali
            style={{ width: '100%' }}
            showTime
            value={toJalaliDayjs(value)}
            placeholder={baseLabel}
            format="YYYY/MM/DD HH:mm"
            onChange={(d) => {
              if (!d) return onSave(null);
              try {
                onSave(d.calendar('gregory').toISOString());
              } catch {
                onSave(d.toISOString());
              }
            }}
          />
        );

      case FieldType.USER:
        return (
          <Select
            style={{ width: '100%' }}
            placeholder={baseLabel}
            value={value}
            allowClear
            showSearch
            filterOption={false}
            options={relationOptions}
            loading={relationLoading}
            onFocus={() => { if (relationOptions.length === 0) fetchRelationOptions(); }}
            onSearch={handleRelationSearch}
            onChange={onSave}
            notFoundContent={relationLoading ? 'در حال دریافت...' : 'چیزی پیدا نشد'}
          />
        );

      case FieldType.PHONE:
        return <Input value={value} onChange={e => onSave(e.target.value)} placeholder={baseLabel} className="font-mono" />;

      case FieldType.LINK:
        return <Input value={value} onChange={e => onSave(e.target.value)} placeholder={baseLabel} type="url" />;

      case FieldType.LOCATION:
        return <Input value={value} onChange={e => onSave(e.target.value)} placeholder={baseLabel} />;

      case FieldType.JSON:
        return <Input.TextArea value={value} onChange={e => onSave(e.target.value)} rows={4} placeholder={baseLabel} className="font-mono" />;

      case FieldType.READONLY_LOOKUP:
        return <Input value={value} disabled placeholder={baseLabel} className="bg-gray-50 text-gray-500 cursor-not-allowed" />;

      case FieldType.RELATION:
        return (
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ width: '100%' }}
              placeholder={baseLabel}
              value={value}
              allowClear
              showSearch
              filterOption={false}
              options={relationOptions}
              loading={relationLoading}
              onFocus={() => { if (relationOptions.length === 0) fetchRelationOptions(); }}
              onSearch={handleRelationSearch}
              onChange={onSave}
              notFoundContent={relationLoading ? 'در حال دریافت...' : 'چیزی پیدا نشد'}
            />
            <Button
              icon={<PlusOutlined />}
              onClick={() => setQuickCreateOpen(true)}
              title="افزودن سریع"
            />
          </Space.Compact>
        );

      case FieldType.SELECT:
      case FieldType.STATUS:
        return (
          <Select
            style={{ width: '100%' }}
            placeholder={`انتخاب ${baseLabel}`}
            value={value}
            onChange={onSave}
            options={items}
            dropdownRender={(menu) => (
              <>
                {menu}
                {type !== FieldType.STATUS && (
                    <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Space style={{ padding: '0 8px 4px' }}>
                        <Input
                            placeholder="مورد جدید..."
                            ref={inputRef}
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                        <Button type="text" icon={<PlusOutlined />} onClick={addItem}>افزودن</Button>
                        </Space>
                    </>
                )}
              </>
            )}
          />
        );
      
      case FieldType.TAGS:
        return (
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder={baseLabel}
            value={value}
            onChange={onSave}
            options={options}
          />
        );

      case FieldType.MULTI_SELECT:
      case FieldType.CHECKLIST:
        return (
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={baseLabel}
            value={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={onSave}
            options={items}
          />
        );

      case FieldType.IMAGE:
        return (
            <div className="flex items-start gap-4 border border-dashed border-gray-300 rounded-lg p-3">
                <Upload
                    listType="picture-card"
                    maxCount={1}
                    showUploadList={false}
                    beforeUpload={handleUpload}
                >
                    {value ? (
                        <img src={value} alt="uploaded" className="w-full h-full object-cover rounded" />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400">
                            {uploading ? <LoadingOutlined /> : <PlusOutlined />}
                            <div className="text-xs mt-1">{uploading ? '...' : 'آپلود'}</div>
                        </div>
                    )}
                </Upload>
                {value && (
                    <Button danger icon={<DeleteOutlined />} onClick={() => onSave(null)} size="small">
                        حذف
                    </Button>
                )}
            </div>
        );

      default:
        return <Input value={value} onChange={e => onSave(e.target.value)} placeholder={baseLabel} />;
    }
  };

  if (!forceEditMode) {
     if (type === FieldType.CHECKBOX) return value ? 'بله' : 'خیر';
     if (type === FieldType.IMAGE && value) return <Image src={value} width={50} className="rounded" />;
     if (type === FieldType.PRICE) return <span className="font-mono">{Number(value).toLocaleString()}</span>;
     return <span className="text-gray-800 dark:text-gray-200">{value || '-'}</span>;
  }

  return (
    <>
      {renderInput()}
      {type === FieldType.RELATION && relationConfig?.targetModule && (
        // @ts-ignore
        <RelationQuickCreateInline
          open={quickCreateOpen}
          label={baseLabel}
          value={quickCreateName}
          onChange={setQuickCreateName}
          onCancel={() => { setQuickCreateOpen(false); setQuickCreateName(''); }}
          onOk={handleQuickCreate}
        />
      )}
    </>
  );
};

export default SmartFieldRenderer;

// --- کامپوننت داخلی (inline) برای افزودن سریع ریلیشن ---
// این را پایین فایل نگه داشتیم تا ساختار کلی عوض نشود.
// @ts-ignore
const RelationQuickCreateInline = ({ open, label, value, onChange, onCancel, onOk }: any) => {
  return (
    <Modal
      title={`افزودن سریع: ${label}`}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="افزودن"
      cancelText="انصراف"
      destroyOnClose
    >
      <Input
        autoFocus
        placeholder={label}
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
      />
      <div className="text-xs text-gray-400 mt-2">این افزودن سریع فقط یک فیلد اصلی را ثبت می‌کند. بعداً می‌توانید اطلاعات کامل را ویرایش کنید.</div>
    </Modal>
  );
};

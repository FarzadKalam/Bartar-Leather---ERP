import React, { useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App, Tag, Button } from 'antd';
import { UploadOutlined, LoadingOutlined, QrcodeOutlined } from '@ant-design/icons';
import { ModuleField, FieldType, FieldNature } from '../types';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import { supabase } from '../supabaseClient';
import DynamicSelectField from './DynamicSelectField';
import TagInput from './TagInput';
import ProductionStagesField from './ProductionStagesField';
import PersianDatePicker from './PersianDatePicker';
import RelatedRecordPopover from './RelatedRecordPopover';
import QrScanPopover from './QrScanPopover';
import ProductImagesManager from './ProductImagesManager';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';

interface SmartFieldRendererProps {
  field: ModuleField;
  value: any;
  onChange: (value: any) => void;
  label?: string; 
  type?: string;
  options?: any[];
  relationModule?: string;
  compactMode?: boolean;
  forceEditMode?: boolean;
  onSave?: (val: any) => void;
  onOptionsUpdate?: () => void;
  allValues?: Record<string, any>;
  recordId?: string;
  moduleId?: string;
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId, compactMode = false
}) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateValue, setQuickCreateValue] = useState('');
  const [, setQuickCreateLoading] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isRequired = field?.validation?.required || false;
  const fieldOptions = field?.options || options || [];
  const isReadonly = field?.readonly === true || field?.nature === FieldNature.SYSTEM;

  const fieldAny = field as any;
  if (fieldAny?.dependsOn && allValues) {
      const parentValue = allValues[fieldAny.dependsOn.field];
      if (parentValue && fieldAny.dependsOn.map) {
          // const subset = fieldAny.dependsOn.map[parentValue];
      }
  }

  if (!compactMode && forceEditMode && field?.nature === FieldNature.SYSTEM) {
      return <Input type="hidden" value={value} />;
  }

  const formatPersian = (val: any, kind: 'DATE' | 'TIME' | 'DATETIME') => {
    if (!val) return '-';
    try {
      let dateObj: DateObject | null = null;

      if (kind === 'TIME') {
        dateObj = new DateObject({
          date: `1970-01-01 ${val}`,
          format: 'YYYY-MM-DD HH:mm',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else if (kind === 'DATE') {
        dateObj = new DateObject({
          date: val,
          format: 'YYYY-MM-DD',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else {
        if (typeof val === 'string') {
          const direct = new Date(val);
          if (!Number.isNaN(direct.getTime())) {
            dateObj = new DateObject({ date: direct, calendar: gregorian, locale: gregorian_en });
          } else {
            dateObj = new DateObject({
              date: val,
              format: 'YYYY-MM-DD HH:mm',
              calendar: gregorian,
              locale: gregorian_en,
            });
          }
        } else if (val instanceof Date) {
          dateObj = new DateObject({ date: val, calendar: gregorian, locale: gregorian_en });
        } else {
          dateObj = new DateObject({ date: val, calendar: gregorian, locale: gregorian_en });
        }
      }

      if (!dateObj) return '-';
      const format = kind === 'DATE' ? 'YYYY/MM/DD' : kind === 'TIME' ? 'HH:mm' : 'YYYY/MM/DD HH:mm';
      return dateObj.convert(persian, persian_fa).format(format);
    } catch {
      return '-';
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

      msg.success('تصویر با موفقیت آپلود شد');
      onChange(publicUrl);
      return publicUrl;
    } catch (error: any) {
      console.error('خطا در آپلود تصویر:', error);
      msg.error(`خطا در آپلود: ${error.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleQuickCreate = async () => {
      if (!quickCreateValue.trim()) return;
      if (!field.relationConfig?.targetModule) return;

      setQuickCreateLoading(true);
      try {
          const targetModule = field.relationConfig.targetModule;
          const targetField = (field.relationConfig as any).targetField;
          const payload: any = {};
          payload[targetField] = quickCreateValue; 
          
          const { data, error } = await supabase
              .from(targetModule)
              .insert([payload])
              .select('id, ' + targetField)
              .single();

          if (error) throw error;

          if (data) {
              msg.success('رکورد جدید ایجاد شد');
              setQuickCreateOpen(false);
              setQuickCreateValue('');
              if (onOptionsUpdate) onOptionsUpdate(); 
              onChange((data as any).id);
          }
      } catch (err: any) {
          msg.error('خطا در ایجاد رکورد: ' + err.message);
      } finally {
          setQuickCreateLoading(false);
      }
  };

  const handleScan = () => {
    if (scannedCode) {
      const found = fieldOptions.find((opt: any) => 
        String(opt.value) === scannedCode || 
        (opt.label && opt.label.includes(scannedCode))
      );
      if (found) {
        onChange(found.value);
        setIsScanModalOpen(false);
        setScannedCode('');
      } else {
         if (fieldType === FieldType.TEXT) {
             onChange(scannedCode);
             setIsScanModalOpen(false);
         } else {
             msg.error('موردی یافت نشد');
         }
      }
    }
  };

  const renderInputContent = () => {
    if (fieldType === FieldType.PROGRESS_STAGES) {
      const status = (allValues as any)?.status;
      const canEditStages = moduleId === 'production_orders' && (!status || status === 'pending');
      return (
        <ProductionStagesField
          recordId={recordId}
          readOnly={!canEditStages}
          compact={compactMode}
          orderStatus={moduleId === 'production_orders' ? (allValues as any)?.status : null}
        />
      );
    }

    if (!forceEditMode) {
        if (fieldType === FieldType.CHECKBOX) {
            return value ? <Tag color="green">بله</Tag> : <Tag color="red">خیر</Tag>;
        }
        if (fieldType === FieldType.IMAGE && value) {
            return <Image src={value} width={40} className="rounded border" />;
        }
        if (fieldType === FieldType.PRICE) {
          const formatted = value ? formatPersianPrice(value, true) : '۰';
          return <span className="font-bold text-gray-700 dark:text-gray-300 text-xs persian-number">{formatted}</span>;
        }
        if (fieldType === FieldType.DATE) {
          return <span className="font-mono persian-number">{formatPersian(value, 'DATE')}</span>;
        }
        if (fieldType === FieldType.DATETIME) {
          return <span className="font-mono persian-number">{formatPersian(value, 'DATETIME')}</span>;
        }
        if (fieldType === FieldType.TIME) {
          return <span className="font-mono persian-number">{formatPersian(value, 'TIME')}</span>;
        }
        if (fieldType === FieldType.SELECT || fieldType === FieldType.RELATION || fieldType === FieldType.STATUS) {
             const selectedOpt = fieldOptions.find((o: any) => o.value === value);
             if (fieldType === FieldType.STATUS && selectedOpt) {
                 return <Tag color={selectedOpt.color}>{selectedOpt.label}</Tag>;
             }
             if (fieldType === FieldType.RELATION && field.relationConfig?.targetModule && value) {
                 return (
                   <RelatedRecordPopover
                     moduleId={field.relationConfig.targetModule}
                     recordId={String(value)}
                     label={selectedOpt ? selectedOpt.label : String(value)}
                   />
                 );
             }
             return <span className="text-gray-800">{selectedOpt ? selectedOpt.label : (value || '-')}</span>;
        }
        if (fieldType === FieldType.TAGS) {
             if (Array.isArray(value) && value.length > 0) {
                 return <div className="flex gap-1">{value.map((t: string, i: number) => <Tag key={i}>{t}</Tag>)}</div>;
             }
             return <span>-</span>;
        }
        
        return <span className="text-gray-800 break-words">{toPersianNumber(value) || (compactMode ? '' : '-')}</span>;
    }

    const commonProps = {
        value,
        onChange: (val: any) => onChange(val),
        disabled: !forceEditMode || isReadonly,
        placeholder: compactMode ? undefined : fieldLabel,
        style: { width: '100%' }
    };

    switch (fieldType) {
      case FieldType.TEXT:
        return <Input {...commonProps} onChange={e => onChange(e.target.value)} allowClear />;
      
      case FieldType.LONG_TEXT:
        return <Input.TextArea {...commonProps} onChange={e => onChange(e.target.value)} rows={compactMode ? 1 : 4} />;
      
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.PERCENTAGE:
      case FieldType.PERCENTAGE_OR_AMOUNT:
      case FieldType.STOCK:
        return (
            <InputNumber 
                {...commonProps}
                className="w-full" 
                controls={false}
                formatter={fieldType === FieldType.PRICE ? val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : undefined}
                parser={fieldType === FieldType.PRICE ? val => val!.replace(/\$\s?|(,*)/g, '') : undefined}
            />
        );
      case FieldType.SELECT:
      case FieldType.STATUS:
        if (field.dynamicOptionsCategory) {
             return (
                 <DynamicSelectField
                    value={value}
                    onChange={onChange}
                    options={fieldOptions}
                    category={field.dynamicOptionsCategory}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    onOptionsUpdate={onOptionsUpdate}
                    disabled={!forceEditMode}
                    getPopupContainer={() => document.body}
                    dropdownStyle={{ zIndex: 4000 }}
                />
            );
        }
        return (
            <Select 
                {...commonProps}
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 4000 }}
            />
        );

      case FieldType.MULTI_SELECT:
        if (field.dynamicOptionsCategory) {
             return (
                <DynamicSelectField
                    value={value}
                    onChange={onChange}
                    options={fieldOptions}
                    category={field.dynamicOptionsCategory}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    mode="multiple"
                    onOptionsUpdate={onOptionsUpdate}
                    disabled={!forceEditMode}
                    getPopupContainer={() => document.body}
                    dropdownStyle={{ zIndex: 4000 }}
                />
            );
        }
        return (
            <Select 
                {...commonProps}
                mode="multiple"
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 4000 }}
            />
        );

      case FieldType.RELATION:
        const allowQuickCreate = (field.relationConfig as any)?.allowQuickCreate;
        let filteredOptions = fieldOptions;
        
        const relConfigAny = field.relationConfig as any;
        if (relConfigAny?.dependsOn && allValues) {
             const depVal = allValues[relConfigAny.dependsOn];
             if (!depVal) {
                 return <Select disabled placeholder="ابتدا فیلد مرتبط را انتخاب کنید" style={{width:'100%'}} value={value} options={[]} />;
             }
             filteredOptions = fieldOptions.filter((opt: any) => opt.module === depVal);
        }

          return (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex gap-1 w-full">
                <Select 
                    {...commonProps}
                    showSearch
                    options={filteredOptions}
                    optionFilterProp="label"
                    getPopupContainer={() => document.body}
                    dropdownStyle={{ zIndex: 4000 }}
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    dropdownRender={(menu) => (
                        <>
                          {menu}
                          {!compactMode && allowQuickCreate && (
                              <>
                                  <div className="h-[1px] bg-gray-100 my-1"></div>
                                  <div 
                                      className="p-2 text-blue-500 cursor-pointer text-xs hover:bg-blue-50 flex items-center gap-1"
                                      onClick={() => setQuickCreateOpen(true)}
                                  >
                                      <LoadingOutlined spin={false} /> افزودن مورد جدید...
                                  </div>
                              </>
                          )}
                        </>
                    )}
                />
                <QrScanPopover
                  label=""
                  buttonClassName="shrink-0"
                  onScan={({ raw, moduleId, recordId }) => {
                    if (recordId && moduleId === field.relationConfig?.targetModule) {
                      onChange(recordId);
                      return;
                    }
                    const match = filteredOptions.find((opt: any) =>
                      String(opt.value) === raw || String(opt.label) === raw
                    );
                    if (match) onChange(match.value);
                  }}
                />
              </div>
              {value && field.relationConfig?.targetModule && (
                <RelatedRecordPopover
                  moduleId={field.relationConfig.targetModule}
                  recordId={String(value)}
                  label={filteredOptions.find((opt: any) => opt.value === value)?.label || String(value)}
                >
                  <span className="text-xs text-leather-600 cursor-pointer hover:underline">
                    مشاهده سریع رکورد مرتبط
                  </span>
                </RelatedRecordPopover>
              )}
           </div>
        );

      case FieldType.DATE:
        return (
          <PersianDatePicker
            type="DATE"
            value={value}
            onChange={onChange}
            className="w-full"
            disabled={!forceEditMode}
            placeholder={compactMode ? undefined : "انتخاب تاریخ"}
          />
        );

      case FieldType.TIME:
        return (
          <PersianDatePicker
            type="TIME"
            value={value}
            onChange={onChange}
            className="w-full"
            disabled={!forceEditMode}
            placeholder={compactMode ? undefined : "انتخاب زمان"}
          />
        );

      case FieldType.DATETIME:
        return (
          <PersianDatePicker
            type="DATETIME"
            value={value}
            onChange={onChange}
            className="w-full"
            disabled={!forceEditMode}
            placeholder={compactMode ? undefined : "انتخاب تاریخ و زمان"}
          />
        );

      case FieldType.TAGS:
        if (recordId && moduleId) {
          return (
            <TagInput
              recordId={recordId}
              moduleId={moduleId}
              initialTags={value || []}
              onChange={onOptionsUpdate as any}
              {...({ disabled: !forceEditMode } as any)}
            />
          );
        }
        return <Input disabled placeholder="بعد از ذخیره، تگ‌ها قابل ویرایش است" />;

      case FieldType.IMAGE:
        return (
            <div className="flex flex-col gap-2">
              <Upload 
                  listType="picture-card" 
                  showUploadList={false} 
                  beforeUpload={(file) => { handleImageUpload(file); return false; }}
                  disabled={uploading || !forceEditMode || isReadonly}
                  fileList={[]}
              >
                  {uploading ? (
                    <div><LoadingOutlined /><div style={{ marginTop: 8 }}>...</div></div>
                  ) : value ? (
                    <img src={value} alt="avatar" style={{ width: '100%', borderRadius: 8 }} />
                  ) : (
                    <div><UploadOutlined /><div style={{ marginTop: 8 }}>آپلود</div></div>
                  )}
              </Upload>
              {moduleId === 'products' && (
                <>
                  <Button size="small" onClick={() => setIsGalleryOpen(true)} disabled={!forceEditMode}>
                    مدیریت تصاویر
                  </Button>
                  <ProductImagesManager
                    open={isGalleryOpen}
                    onClose={() => setIsGalleryOpen(false)}
                    productId={recordId}
                    mainImage={value}
                    onMainImageChange={(url) => onChange(url)}
                    canEdit={forceEditMode && !isReadonly}
                  />
                </>
              )}
            </div>
        );

      case FieldType.CHECKBOX:
        return <Switch checked={!!value} onChange={onChange} disabled={!forceEditMode || isReadonly} />;

      default:
        return <Input {...commonProps} onChange={e => onChange(e.target.value)} />;
    }
  };

  if (compactMode) {
      const allowQuickCreate = (field.relationConfig as any)?.allowQuickCreate;
      return (
        <div className="w-full">
            {renderInputContent()}
            
            {fieldType === FieldType.RELATION && allowQuickCreate && (
                <RelationQuickCreateInline 
                    open={quickCreateOpen}
                    label={fieldLabel}
                    value={quickCreateValue}
                    onChange={setQuickCreateValue}
                    onCancel={() => setQuickCreateOpen(false)}
                    onOk={handleQuickCreate}
                />
            )}
             <Modal 
                title="اسکن بارکد" 
                open={isScanModalOpen} 
                onCancel={() => setIsScanModalOpen(false)} 
                footer={null}
                zIndex={10000}
            >
                <Input 
                    autoFocus 
                    placeholder="کد را اسکن کنید..." 
                    value={scannedCode} 
                    onChange={e => setScannedCode(e.target.value)}
                    onPressEnter={handleScan} 
                    suffix={<QrcodeOutlined />}
                />
            </Modal>
        </div>
      );
  }

  const formItemProps: any = {
      label: fieldLabel,
      name: fieldKey,
      rules: [{ required: isRequired, message: 'الزامی است' }],
      valuePropName: fieldType === FieldType.CHECKBOX ? 'checked' : 'value',
  };

  const allowQuickCreate = (field.relationConfig as any)?.allowQuickCreate;

  return (
    <>
        <Form.Item {...formItemProps}>
            {renderInputContent()}
        </Form.Item>

        {fieldType === FieldType.RELATION && allowQuickCreate && (
            <RelationQuickCreateInline 
                open={quickCreateOpen}
                label={fieldLabel}
                value={quickCreateValue}
                onChange={setQuickCreateValue}
                onCancel={() => setQuickCreateOpen(false)}
                onOk={handleQuickCreate}
            />
        )}
        <Modal 
            title="اسکن بارکد" 
            open={isScanModalOpen} 
            onCancel={() => setIsScanModalOpen(false)} 
            footer={null}
            zIndex={10000}
        >
            <Input 
                autoFocus 
                placeholder="کد را اسکن کنید..." 
                value={scannedCode} 
                onChange={e => setScannedCode(e.target.value)}
                onPressEnter={handleScan} 
                suffix={<QrcodeOutlined />}
            />
        </Modal>
    </>
  );
};

export default SmartFieldRenderer;

interface QuickCreateProps {
    open: boolean;
    label: string;
    value: string;
    onChange: (val: string) => void;
    onCancel: () => void;
    onOk: () => void;
}

export const RelationQuickCreateInline: React.FC<QuickCreateProps> = ({ open, label, value, onChange, onCancel, onOk }) => {
  return (
    <Modal
      title={`افزودن سریع: ${label}`}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="افزودن"
      cancelText="انصراف"
      destroyOnClose
      zIndex={2000} 
    >
      <Input
        autoFocus
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPressEnter={onOk}
      />
      <div className="text-xs text-gray-400 mt-2">این فقط فیلد اصلی را ثبت می‌کند. بعداً می‌توانید اطلاعات کامل را ویرایش کنید.</div>
    </Modal>
  );
};

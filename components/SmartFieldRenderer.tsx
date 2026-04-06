import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App, Tag, Button } from 'antd';
import { UploadOutlined, LoadingOutlined, QrcodeOutlined, PlusOutlined } from '@ant-design/icons';
import { ModuleField, FieldType, FieldNature } from '../types';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import DynamicSelectField from './DynamicSelectField';
import TagInput from './TagInput';
import ProductionStagesField from './ProductionStagesField';
import PersianDatePicker from './PersianDatePicker';
import RelatedRecordPopover from './RelatedRecordPopover';
import QrScanPopover from './QrScanPopover';
import RecordFilesManager from './RecordFilesManager';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { checkFieldDuplicate, findDuplicateUniqueFields, getUniqueFieldMessage, isUniqueField } from '../utils/fieldUniqueness';
import { formatRelationOptionLabel } from '../utils/relationOptionLabels';

const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

const normalizeNumericString = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  const englishDigits = normalizeDigitsToEnglish(raw)
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');

  const sign = englishDigits.startsWith('-') ? '-' : '';
  const unsigned = englishDigits.replace(/-/g, '');
  const cleaned = unsigned.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const integerPart = parts[0] ?? '';
  const decimalPart = parts.slice(1).join('');
  const hasDot = cleaned.includes('.');
  return `${sign}${integerPart}${hasDot ? `.${decimalPart}` : ''}`;
};

const formatNumericForInput = (raw: any, withGrouping = false): string => {
  const normalized = normalizeNumericString(raw);
  if (!normalized) return '';
  if (!withGrouping) return toPersianNumber(normalized);
  if (normalized === '-' || normalized === '.' || normalized === '-.') return toPersianNumber(normalized);

  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = sign ? normalized.slice(1) : normalized;
  const [integerPart = '', decimalPart] = unsigned.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const output = decimalPart !== undefined ? `${sign}${grouped}.${decimalPart}` : `${sign}${grouped}`;
  return toPersianNumber(output);
};

const formatTextForInput = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return toPersianNumber(normalizeDigitsToEnglish(raw));
};

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
  canViewFilesManager?: boolean;
  canEditFilesManager?: boolean;
  canDeleteFilesManager?: boolean;
  popupContainer?: HTMLElement | null;
  popupZIndex?: number;
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId, compactMode = false, canViewFilesManager = true, canEditFilesManager = true, canDeleteFilesManager = true, popupContainer, popupZIndex
}) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [quickCreateForm] = Form.useForm();
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickCreateRelationOptions, setQuickCreateRelationOptions] = useState<Record<string, any[]>>({});
  const [quickCreateDynamicOptions, setQuickCreateDynamicOptions] = useState<Record<string, any[]>>({});
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isGlobalImageGalleryOpen, setIsGlobalImageGalleryOpen] = useState(false);
  const [globalImageGalleryItems, setGlobalImageGalleryItems] = useState<Array<{
    id: string;
    url: string;
    label: string;
    createdAt: string | null;
  }>>([]);
  const [globalImageGalleryLoading, setGlobalImageGalleryLoading] = useState(false);
  const supportsFilesGallery = moduleId === 'products' || moduleId === 'production_orders' || moduleId === 'production_boms';
  const canShowFilesGallery = supportsFilesGallery && canViewFilesManager && !!recordId;
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  const resolvedPopupZIndex = popupZIndex ?? 13000;
  const resolvePopupContainer = (trigger?: HTMLElement | null) => {
    if (popupContainer) return popupContainer;
    const overlayParent = trigger?.closest(
      '.ant-modal-root, .ant-modal-wrap, .ant-modal-content, .ant-drawer, .ant-drawer-root, .ant-drawer-content, .ant-drawer-content-wrapper',
    );
    if (overlayParent instanceof HTMLElement) return overlayParent;
    return document.body;
  };

  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isRequired = field?.validation?.required || false;
  const fieldOptions = field?.options || options || [];
  const isReadonly = field?.readonly === true || field?.nature === FieldNature.SYSTEM;
  const relationConfigAny = field.relationConfig as any;
  const quickCreateTargetModuleId = relationConfigAny?.targetModule as string | undefined;
  const quickCreateTargetModule = quickCreateTargetModuleId ? MODULES[quickCreateTargetModuleId] : undefined;
  const quickCreateTargetField = useMemo(() => {
    const configured = relationConfigAny?.targetField;
    if (configured) return String(configured);
    const moduleFields = quickCreateTargetModule?.fields || [];
    const preferredKeys = ['name', 'title', 'full_name', 'business_name', 'shelf_number', 'system_code', 'bundle_number'];
    const preferred = moduleFields.find((f: any) => preferredKeys.includes(String(f?.key || '')));
    if (preferred?.key) return String(preferred.key);
    const headerField = moduleFields.find((f: any) => f?.location === 'header');
    if (headerField?.key) return String(headerField.key);
    return 'name';
  }, [relationConfigAny?.targetField, quickCreateTargetModule]);

  const quickCreateFields = useMemo(() => {
    const moduleFields = quickCreateTargetModule?.fields || [];
    const unsupported = new Set<string>([
      FieldType.IMAGE,
      FieldType.TAGS,
      FieldType.PROGRESS_STAGES,
      FieldType.JSON,
      FieldType.READONLY_LOOKUP,
    ]);

    const selected = moduleFields
      .filter((f: any) => !!f?.key)
      .filter((f: any) => f?.nature !== FieldNature.SYSTEM)
      .filter((f: any) => !['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(String(f?.key || '')))
      .filter((f: any) => !unsupported.has(String(f?.type || '')))
      .filter((f: any) => {
        const isHeader = f?.location === 'header';
        const isRequiredField = f?.validation?.required === true;
        const isKeyField = f?.isKey === true;
        const isTableColumn = f?.isTableColumn === true;
        const isTargetField = String(f?.key || '') === quickCreateTargetField;
        return isHeader || isRequiredField || isKeyField || isTableColumn || isTargetField;
      })
      .sort((a: any, b: any) => (a?.order || 0) - (b?.order || 0));

    const map = new Map<string, ModuleField>();
    selected.forEach((f: any) => map.set(String(f.key), f as ModuleField));

    if (!map.has(quickCreateTargetField)) {
      const existing = moduleFields.find((f: any) => String(f?.key || '') === quickCreateTargetField);
      if (existing && existing.nature !== FieldNature.SYSTEM) {
        map.set(quickCreateTargetField, existing as ModuleField);
      } else {
        map.set(quickCreateTargetField, {
          key: quickCreateTargetField,
          type: FieldType.TEXT,
          labels: { fa: quickCreateTargetField, en: quickCreateTargetField },
          validation: { required: true },
        } as ModuleField);
      }
    }

    return Array.from(map.values()).sort((a: any, b: any) => (a?.order || 0) - (b?.order || 0));
  }, [quickCreateTargetField, quickCreateTargetModule]);

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

  const uniqueValidator = isUniqueField(field) && moduleId
    ? async (_: any, currentValue: any) => {
        const duplicateCheck = await checkFieldDuplicate({
          moduleId,
          field,
          value: currentValue,
          recordId,
          allValues,
        });
        if (duplicateCheck.isDuplicate) {
          throw new Error(getUniqueFieldMessage(field));
        }
      }
    : null;

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
      const modulePath = moduleId || 'misc';
      const recordPath = recordId || 'draft';
      const filePath = `record_files/${modulePath}/${recordPath}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

      if (recordId && moduleId) {
        const { error: fileInsertError } = await supabase
          .from('record_files')
          .insert([
            {
              module_id: moduleId,
              record_id: recordId,
              file_url: publicUrl,
              file_type: 'image',
              file_name: file.name || null,
              mime_type: file.type || null,
            },
          ]);
        if (fileInsertError) {
          console.warn('Could not append file entry after image upload', fileInsertError);
        }
      }

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

  const loadGlobalImageGallery = async () => {
    setGlobalImageGalleryLoading(true);
    try {
      const [recordFilesResult, legacyImagesResult] = await Promise.allSettled([
        supabase
          .from('record_files')
          .select('id, module_id, record_id, file_url, file_name, mime_type, file_type, created_at')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('product_images')
          .select('id, product_id, image_url, created_at')
          .order('created_at', { ascending: false })
          .limit(300),
      ]);

      const isImageByUrl = (url: unknown) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?|$)/i.test(String(url || ''));
      const recordFilesRes = recordFilesResult.status === 'fulfilled' ? recordFilesResult.value : null;
      const legacyImagesRes = legacyImagesResult.status === 'fulfilled' ? legacyImagesResult.value : null;

      const recordFileRows = Array.isArray(recordFilesRes?.data) ? recordFilesRes?.data : [];
      const recordFileItems = recordFileRows
        .filter((row: any) => {
          const fileType = String(row?.file_type || '').toLowerCase();
          const mimeType = String(row?.mime_type || '').toLowerCase();
          return fileType === 'image' || mimeType.startsWith('image/') || isImageByUrl(row?.file_url);
        })
        .map((row: any, index: number) => ({
          id: `rf_${row?.id || index}`,
          url: String(row?.file_url || ''),
          label: String(row?.file_name || row?.module_id || 'تصویر'),
          createdAt: row?.created_at ? String(row.created_at) : null,
        }))
        .filter((row: any) => !!row.url);

      const legacyRows = Array.isArray(legacyImagesRes?.data) ? legacyImagesRes?.data : [];
      const legacyItems = legacyRows
        .map((row: any, index: number) => ({
          id: `legacy_${row?.id || index}`,
          url: String(row?.image_url || ''),
          label: `محصول ${String(row?.product_id || '').slice(0, 8) || '-'}`,
          createdAt: row?.created_at ? String(row.created_at) : null,
        }))
        .filter((row: any) => !!row.url);

      const merged = [...recordFileItems, ...legacyItems]
        .sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));

      const deduped: Array<{ id: string; url: string; label: string; createdAt: string | null }> = [];
      const seen = new Set<string>();
      merged.forEach((item) => {
        if (!item.url || seen.has(item.url)) return;
        seen.add(item.url);
        deduped.push(item);
      });

      setGlobalImageGalleryItems(deduped);
      if (!deduped.length && (recordFilesRes?.error || legacyImagesRes?.error)) {
        msg.warning('تصویری برای انتخاب از گالری پیدا نشد');
      }
    } catch (error) {
      console.warn('Could not load global image gallery', error);
      msg.error('خطا در دریافت تصاویر گالری');
      setGlobalImageGalleryItems([]);
    } finally {
      setGlobalImageGalleryLoading(false);
    }
  };

  const closeQuickCreate = () => {
    setQuickCreateOpen(false);
    quickCreateForm.resetFields();
    setQuickCreateRelationOptions({});
    setQuickCreateDynamicOptions({});
  };

  useEffect(() => {
    if (!quickCreateOpen) return;
    const defaults: Record<string, any> = {};
    quickCreateFields.forEach((f: any) => {
      if (f?.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
    });
    quickCreateForm.setFieldsValue(defaults);
  }, [quickCreateOpen, quickCreateFields, quickCreateForm]);

  useEffect(() => {
    if (!quickCreateOpen || quickCreateFields.length === 0) return;
    let cancelled = false;

    const loadOptions = async () => {
      const relationMap: Record<string, any[]> = {};
      const dynamicMap: Record<string, any[]> = {};
      const dynamicCategories = Array.from(new Set(
        quickCreateFields
          .map((quickField: any) => String(quickField?.dynamicOptionsCategory || '').trim())
          .filter(Boolean)
      ));

      await Promise.all(dynamicCategories.map(async (category) => {
        try {
          const { data } = await supabase
            .from('dynamic_options')
            .select('label, value')
            .eq('category', category)
            .eq('is_active', true)
            .order('display_order', { ascending: true });
          dynamicMap[category] = (data || []).map((item: any) => ({
            label: item.label,
            value: item.value,
          }));
        } catch (err) {
          console.warn('Failed loading dynamic options:', category, err);
        }
      }));

      const relationQueryCache = new Map<string, any[]>();
      const relationFields = quickCreateFields.filter((quickField: any) =>
        !!quickField?.key
        && quickField.type === FieldType.RELATION
        && !!quickField.relationConfig?.targetModule
      );

      await Promise.all(relationFields.map(async (quickField: any) => {
        const targetModule = quickField.relationConfig.targetModule;
        const rawTargetField = (quickField.relationConfig as any)?.targetField;
        const targetField = (targetModule === 'product_bundles' && (!rawTargetField || rawTargetField === 'name'))
          ? 'bundle_number'
          : (rawTargetField || 'name');
        const queryCacheKey = JSON.stringify({ targetModule, targetField });

        try {
          let options = relationQueryCache.get(queryCacheKey);
          if (!options) {
            const isShelvesTarget = targetModule === 'shelves';
            const extraSelect = isShelvesTarget ? ', shelf_number' : '';
            const { data, error } = await supabase
              .from(targetModule)
              .select(`id, ${targetField}, system_code${extraSelect}`)
              .limit(200);
            if (error) throw error;
            options = (data || []).map((item: any) => ({
              label: formatRelationOptionLabel(
                targetModule,
                item[targetField] || item.shelf_number || item.bundle_number || item.system_code || item.id,
                item.system_code,
              ),
              value: item.id,
            }));
            relationQueryCache.set(queryCacheKey, options);
          }
          relationMap[quickField.key] = options;
        } catch (err) {
          console.warn('Failed loading relation options:', quickField.key, err);
        }
      }));

      if (!cancelled) {
        setQuickCreateRelationOptions(relationMap);
        setQuickCreateDynamicOptions(dynamicMap);
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [quickCreateOpen, quickCreateFields]);

  const handleQuickCreate = async () => {
    if (!quickCreateTargetModuleId) return;
    setQuickCreateLoading(true);
    try {
      const values = await quickCreateForm.validateFields();
      const payload: Record<string, any> = {};

      quickCreateFields.forEach((f: any) => {
        if (!f?.key) return;
        let nextValue = values?.[f.key];
        if (nextValue === undefined) return;
        if (typeof nextValue === 'string') nextValue = nextValue.trim();
        if (nextValue === '') nextValue = null;
        payload[f.key] = nextValue;
      });

      if (!payload[quickCreateTargetField]) {
        throw new Error(`فیلد "${quickCreateTargetField}" الزامی است.`);
      }

      const duplicateFields = await findDuplicateUniqueFields({
        moduleId: quickCreateTargetModuleId,
        fields: quickCreateFields,
        values: payload,
      });
      if (duplicateFields.length > 0) {
        quickCreateForm.setFields(
          duplicateFields.map((item) => ({
            name: item.fieldKey,
            errors: [item.message],
          }))
        );
        return;
      }

      const selectFields = Array.from(new Set(['id', quickCreateTargetField])).join(', ');
      const { data: inserted, error } = await supabase
        .from(quickCreateTargetModuleId)
        .insert([payload])
        .select(selectFields)
        .single();
      if (error) throw error;

      msg.success('رکورد جدید ایجاد شد');
      closeQuickCreate();
      if (onOptionsUpdate) onOptionsUpdate();
      const insertedRow: any = inserted as any;
      if (insertedRow?.id) onChange(insertedRow.id);
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      msg.error('خطا در ایجاد رکورد: ' + (err?.message || 'نامشخص'));
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
      const isOrder = moduleId === 'production_orders';
      const isBom = moduleId === 'production_boms';
      const canEditStages = isOrder && String(status || '').toLowerCase() !== 'completed';
      return (
        <ProductionStagesField
          recordId={recordId}
          moduleId={moduleId}
          readOnly={isBom ? false : !canEditStages}
          compact={compactMode}
          orderStatus={isOrder ? (allValues as any)?.status : null}
          draftStages={(allValues as any)?.production_stages_draft || []}
          showWageSummary={isOrder}
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
    const imageSourceMode = String((field as any)?.imageSourceMode || '').toLowerCase();

    switch (fieldType) {
      case FieldType.TEXT:
        return (
          <Input
            {...commonProps}
            value={formatTextForInput(value)}
            onChange={e => onChange(normalizeDigitsToEnglish(e.target.value))}
            allowClear
          />
        );
      
      case FieldType.LONG_TEXT:
        return (
          <Input.TextArea
            {...commonProps}
            value={formatTextForInput(value)}
            onChange={e => onChange(normalizeDigitsToEnglish(e.target.value))}
            rows={compactMode ? 1 : 4}
          />
        );
      
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.PERCENTAGE:
      case FieldType.PERCENTAGE_OR_AMOUNT:
      case FieldType.STOCK:
        return (
            <InputNumber 
                {...commonProps}
                className="w-full persian-number" 
                controls={false}
                stringMode
                inputMode="decimal"
                formatter={(val, info) => formatNumericForInput(info?.input ?? val, true)}
                parser={(val) => normalizeNumericString(val)}
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
                    getPopupContainer={(trigger) => resolvePopupContainer(trigger)}
                    popupRootStyle={{ zIndex: resolvedPopupZIndex }}
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
                getPopupContainer={(trigger) => resolvePopupContainer(trigger)}
                styles={{ popup: { root: { zIndex: resolvedPopupZIndex } } }}
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
                getPopupContainer={(trigger) => resolvePopupContainer(trigger)}
                popupRootStyle={{ zIndex: resolvedPopupZIndex }}
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
                getPopupContainer={(trigger) => resolvePopupContainer(trigger)}
                styles={{ popup: { root: { zIndex: resolvedPopupZIndex } } }}
            />
        );

      case FieldType.RELATION:
        const canQuickCreate = !!field.relationConfig?.targetModule;
        let filteredOptions = fieldOptions;
        const relationPopupRootStyle = isMobileViewport
          ? { zIndex: resolvedPopupZIndex, width: 'min(92vw, 420px)', maxWidth: 'calc(100vw - 24px)' }
          : { zIndex: resolvedPopupZIndex, minWidth: 320 };
        
        const relConfigAny = field.relationConfig as any;
        if (relConfigAny?.dependsOn && allValues) {
             const depVal = allValues[relConfigAny.dependsOn];
             if (!depVal) {
                 return <Select disabled placeholder="ابتدا فیلد مرتبط را انتخاب کنید" style={{width:'100%'}} value={value} options={[]} getPopupContainer={(trigger) => resolvePopupContainer(trigger)} styles={{ popup: { root: { zIndex: resolvedPopupZIndex } } }} />;
             }
             filteredOptions = fieldOptions.filter((opt: any) => opt.module === depVal);
        }

          return (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex gap-1 w-full min-w-0">
                <Select 
                    {...commonProps}
                    style={{ ...((commonProps as any)?.style || {}), width: 'auto', flex: 1, minWidth: 0 }}
                    className="min-w-0"
                    showSearch
                    options={filteredOptions}
                    optionFilterProp="label"
                    getPopupContainer={(trigger) => resolvePopupContainer(trigger)}
                    popupMatchSelectWidth={isMobileViewport}
                    styles={{ popup: { root: relationPopupRootStyle } }}
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    popupRender={(menu) => (
                        <>
                          {menu}
                          {!compactMode && canQuickCreate && (
                              <>
                                  <div className="h-[1px] bg-gray-100 my-1"></div>
                                  <div 
                                      className="p-2 text-blue-500 cursor-pointer text-xs hover:bg-blue-50 flex items-center gap-1"
                                      onClick={() => setQuickCreateOpen(true)}
                                  >
                                      <PlusOutlined /> افزودن مورد جدید...
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
                {canQuickCreate && (
                  <Button
                    icon={<PlusOutlined />}
                    className="shrink-0"
                    onClick={() => setQuickCreateOpen(true)}
                    disabled={!forceEditMode || isReadonly}
                  />
                )}
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
            popupContainer={popupContainer}
            popupZIndex={resolvedPopupZIndex}
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
            popupContainer={popupContainer}
            popupZIndex={resolvedPopupZIndex}
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
            popupContainer={popupContainer}
            popupZIndex={resolvedPopupZIndex}
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
        if (imageSourceMode === 'gallery') {
          return (
            <div className="flex flex-col gap-2">
              {value ? (
                <img src={String(value)} alt="image" style={{ width: '100%', borderRadius: 8, border: '1px solid #f0f0f0', maxHeight: 120, objectFit: 'cover' }} />
              ) : (
                <div className="h-16 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">
                  تصویری انتخاب نشده است
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  onClick={() => {
                    setIsGlobalImageGalleryOpen(true);
                    void loadGlobalImageGallery();
                  }}
                  disabled={!forceEditMode || isReadonly}
                >
                  انتخاب از گالری
                </Button>
                {!!value && (
                  <Button
                    size="small"
                    danger
                    onClick={() => onChange(null)}
                    disabled={!forceEditMode || isReadonly}
                  >
                    حذف تصویر
                  </Button>
                )}
              </div>
            </div>
          );
        }
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
                {canShowFilesGallery && (
                  <>
                    <Button
                      size="small"
                      onClick={() => {
                        if (!recordId) {
                          msg.warning('ابتدا رکورد را ذخیره کنید');
                          return;
                        }
                        setIsGalleryOpen(true);
                      }}
                    >
                      گالری
                    </Button>
                    {!!recordId && (
                      <RecordFilesManager
                        open={isGalleryOpen}
                        onClose={() => setIsGalleryOpen(false)}
                        moduleId={String(moduleId || '')}
                        recordId={recordId}
                        mainImage={value}
                        onMainImageChange={(url) => onChange(url)}
                        canEdit={!!canEditFilesManager && !!forceEditMode && !isReadonly}
                        canDelete={!!canDeleteFilesManager && !!forceEditMode && !isReadonly}
                      />
                    )}
                  </>
                )}
            </div>
        );

      case FieldType.CHECKBOX:
        return <Switch checked={!!value} onChange={onChange} disabled={!forceEditMode || isReadonly} />;

      default:
        return (
          <Input
            {...commonProps}
            value={formatTextForInput(value)}
            onChange={e => onChange(normalizeDigitsToEnglish(e.target.value))}
          />
        );
    }
  };

  const canRelationQuickCreate = fieldType === FieldType.RELATION
    && !!field.relationConfig?.targetModule;
  const globalImageGalleryModalNode = (
    <Modal
      title="انتخاب تصویر از گالری"
      open={isGlobalImageGalleryOpen}
      onCancel={() => setIsGlobalImageGalleryOpen(false)}
      footer={null}
      width={980}
      zIndex={12000}
      destroyOnHidden
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          تصویر موردنظر را انتخاب کنید.
        </div>
        <Button
          size="small"
          onClick={() => {
            void loadGlobalImageGallery();
          }}
          loading={globalImageGalleryLoading}
        >
          بروزرسانی
        </Button>
      </div>
      {globalImageGalleryLoading ? (
        <div className="h-44 flex items-center justify-center text-gray-500 text-sm gap-2">
          <LoadingOutlined />
          در حال بارگذاری...
        </div>
      ) : globalImageGalleryItems.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-gray-400 text-sm">
          تصویری در گالری یافت نشد.
        </div>
      ) : (
        <div className="max-h-[62vh] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {globalImageGalleryItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-lg border border-gray-200 overflow-hidden bg-white text-right hover:border-leather-400 transition-colors"
              onClick={() => {
                onChange(item.url);
                setIsGlobalImageGalleryOpen(false);
              }}
            >
              <img src={item.url} alt={item.label || 'image'} className="w-full h-28 object-cover" />
              <div className="px-2 py-1 text-[11px] text-gray-600 truncate">{item.label || 'تصویر'}</div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );

  if (compactMode) {
      return (
        <div className="w-full">
            {renderInputContent()}
            
            {canRelationQuickCreate && (
                <RelationQuickCreateInline 
                    open={quickCreateOpen}
                    label={fieldLabel}
                    moduleId={quickCreateTargetModuleId}
                    fields={quickCreateFields}
                    form={quickCreateForm}
                    loading={quickCreateLoading}
                    relationOptions={quickCreateRelationOptions}
                    dynamicOptions={quickCreateDynamicOptions}
                    popupZIndex={resolvedPopupZIndex + 20}
                    onCancel={closeQuickCreate}
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
            {globalImageGalleryModalNode}
        </div>
      );
  }

  const formItemProps: any = {
      label: fieldLabel,
      name: fieldKey,
      rules: [
        ...(isRequired ? [{ required: true, message: 'الزامی است' }] : []),
        ...(uniqueValidator ? [{ validator: uniqueValidator }] : []),
      ],
      valuePropName: fieldType === FieldType.CHECKBOX ? 'checked' : 'value',
      validateTrigger: uniqueValidator ? ['onBlur', 'onSubmit'] : undefined,
      validateFirst: true,
  };

  return (
    <>
        <Form.Item {...formItemProps}>
            {renderInputContent()}
        </Form.Item>

        {canRelationQuickCreate && (
            <RelationQuickCreateInline 
                open={quickCreateOpen}
                label={fieldLabel}
                moduleId={quickCreateTargetModuleId}
                fields={quickCreateFields}
                form={quickCreateForm}
                loading={quickCreateLoading}
                relationOptions={quickCreateRelationOptions}
                dynamicOptions={quickCreateDynamicOptions}
                popupZIndex={resolvedPopupZIndex + 20}
                onCancel={closeQuickCreate}
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
        {globalImageGalleryModalNode}
    </>
  );
};

export default SmartFieldRenderer;

interface QuickCreateProps {
  open: boolean;
  label: string;
  moduleId?: string;
  fields: ModuleField[];
  form: any;
  loading: boolean;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  popupZIndex?: number;
  onCancel: () => void;
  onOk: () => void;
}

export const RelationQuickCreateInline: React.FC<QuickCreateProps> = ({
  open,
  label,
  moduleId,
  fields,
  form,
  loading,
  relationOptions,
  dynamicOptions,
  popupZIndex,
  onCancel,
  onOk,
}) => {
  const watchedValues = Form.useWatch([], form);
  const [modalContentElement, setModalContentElement] = useState<HTMLElement | null>(null);
  const resolvedPopupZIndex = popupZIndex ?? 13020;

  return (
    <Modal
      title={`افزودن سریع: ${label}`}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="افزودن"
      cancelText="انصراف"
      confirmLoading={loading}
      forceRender
      destroyOnHidden
      zIndex={resolvedPopupZIndex - 20}
      afterOpenChange={(visible) => {
        if (!visible) {
          setModalContentElement(null);
          return;
        }
        window.setTimeout(() => {
          const modalBodies = Array.from(document.querySelectorAll('.ant-modal .ant-modal-content'));
          const modalBody = modalBodies[modalBodies.length - 1] || null;
          setModalContentElement(modalBody instanceof HTMLElement ? modalBody : null);
        }, 0);
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onOk}
        className="max-h-[60vh] overflow-y-auto pr-1"
      >
        {fields.map((field) => (
          <Form.Item
            key={field.key}
            name={field.key}
            label={field.labels?.fa || field.key}
            valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
            rules={field.validation?.required ? [{ required: true, message: 'الزامی است' }] : undefined}
          >
            <SmartFieldRenderer
              field={field}
              value={(watchedValues as any)?.[field.key]}
              onChange={(val) => form.setFieldValue(field.key, val)}
              options={
                field.type === FieldType.RELATION
                  ? (relationOptions[field.key] || [])
                  : field.dynamicOptionsCategory
                    ? (dynamicOptions[field.dynamicOptionsCategory] || [])
                    : (field.options || [])
              }
              forceEditMode={true}
              compactMode={true}
              allValues={watchedValues || {}}
              moduleId={moduleId}
              popupContainer={modalContentElement}
              popupZIndex={resolvedPopupZIndex}
            />
          </Form.Item>
        ))}
      </Form>
      <div className="text-xs text-gray-400 mt-1">
        فیلدهای کلیدی، هدر، الزامی و ستون‌های لیست برای ثبت سریع نمایش داده شده‌اند.
      </div>
    </Modal>
  );
};

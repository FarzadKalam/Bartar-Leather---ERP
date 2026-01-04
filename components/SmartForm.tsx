import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Card, FormInstance, FormProps } from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { ModuleDefinition, BlockType, LogicOperator } from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';
import { MODULES } from '../moduleRegistry';
import EditableTable from './EditableTable';

interface SmartFormProps {
  module: ModuleDefinition;
  initialValues?: any;
  visible: boolean;
  onCancel: () => void;
  onSave: (values: any) => void;
  title?: string;
  isBulkEdit?: boolean;
  embedded?: boolean;
  form?: FormInstance; 
  formProps?: FormProps;
  isLoading?: boolean;
}

const evaluateCondition = (condition: any, data: any): boolean => {
  if (!condition) return true;
  const { field, operator, value } = condition;
  const fieldValue = data ? data[field] : null;

  switch (operator) {
    case LogicOperator.EQUALS: return fieldValue === value;
    case LogicOperator.NOT_EQUALS: return fieldValue !== value;
    case LogicOperator.GREATER_THAN: return Number(fieldValue) > Number(value);
    case LogicOperator.LESS_THAN: return Number(fieldValue) < Number(value);
    case LogicOperator.CONTAINS: return fieldValue?.includes(value);
    case LogicOperator.IS_TRUE: return fieldValue === true;
    case LogicOperator.IS_FALSE: return fieldValue === false;
    default: return true;
  }
};

const SmartForm: React.FC<SmartFormProps> = ({
  module, initialValues, visible, onCancel, onSave, title, isBulkEdit = false, embedded = false, form: propForm, formProps, isLoading = false
}) => {
  const [internalForm] = Form.useForm();
  const form = propForm || internalForm;
  const [formData, setFormData] = useState<any>({});

  const getFieldLabel = (field: any) => {
    const fa = field?.labels?.fa;
    const cleaned = typeof fa === 'string' ? fa.trim() : '';
    return cleaned ? cleaned : String(field?.key || '');
  };

  const getModuleDisplayField = (moduleId: string) => {
    const targetConfig: any = (MODULES as any)?.[moduleId];
    const keyField = targetConfig?.fields?.find((f: any) => f?.isKey)?.key;
    return keyField || 'name';
  };

  const resolveRelationConfig = (field: any, allValues: any) => {
    let rc: any = field?.relationConfig ? { ...field.relationConfig } : undefined;

    // FieldType.USER هم زیرساخت relation دارد
    if (!rc && field?.type === 'user') {
      rc = { targetModule: 'profiles', targetField: 'full_name' };
    }
    if (!rc) return rc;

    // Polymorphic / Dynamic relation convention:
    // xxx_id  ->  xxx_module
    const baseKey = String(field?.key || '').replace(/_id$/, '');
    const moduleKey = `${baseKey}_module`;
    const dynModule =
      allValues?.[moduleKey] ||
      (field?.key === 'related_to_id' ? allValues?.['related_to_module'] : undefined);

    if (dynModule && typeof dynModule === 'string') {
      rc.targetModule = dynModule;
      // در پلی‌مورفیک، فیلد نمایش هم باید با ماژول جدید هماهنگ شود
      rc.targetField = getModuleDisplayField(dynModule);
    }

    // اگر targetField تعیین نشده، از فیلد کلیدی ماژول مقصد استفاده می‌کنیم
    if (!rc.targetField && rc.targetModule) {
      rc.targetField = getModuleDisplayField(rc.targetModule);
    }

    return rc;
  };

  useEffect(() => {
    if (visible || embedded) {
      if (initialValues) {
        setFormData(initialValues);
        form.setFieldsValue(initialValues);
      }
    }
  }, [visible, embedded, initialValues, form]);

  const handleValuesChange = (changedValues: any, allValues: any) => {
    // اگر ماژولِ یک ریلیشن پلی‌مورفیک تغییر کرد، آی‌دی مرتبط را پاک می‌کنیم تا انتخاب قبلی باقی نماند.
    try {
      const changedKeys = Object.keys(changedValues || {});
      const moduleKeys = changedKeys.filter((k) => String(k).endsWith('_module'));
      moduleKeys.forEach((mk) => {
        const idKey = String(mk).replace(/_module$/i, '_id');
        if (allValues?.[idKey]) {
          form.setFieldsValue({ [idKey]: null });
          allValues[idKey] = null;
        }
      });
      // کیس خاص تسک‌ها: related_to_module -> related_to_id
      if ('related_to_module' in (changedValues || {}) && allValues?.related_to_id) {
        form.setFieldsValue({ related_to_id: null });
        allValues.related_to_id = null;
      }
    } catch {}
    setFormData(allValues);
  };

  const handleFieldChange = (key: string, value: any) => {
    form.setFieldsValue({ [key]: value });
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const renderFields = (fields: any[]) => (
    <>
      {fields.map(field => {
        if (field.logic?.visibleIf && !evaluateCondition(field.logic.visibleIf, formData)) return null;

        const required = !!field.validation?.required && !isBulkEdit && field.key !== 'system_code';
        const safeLabel = getFieldLabel(field) + (required ? ' *' : '');
        const effectiveRelationConfig = resolveRelationConfig(field, formData);

        return (
          <div key={field.key}>
            <Form.Item
              name={field.key}
              noStyle
              rules={[{ required, message: 'الزامی' }]}
            >
              <SmartFieldRenderer
                label={safeLabel}
                value={formData[field.key]}
                type={field.type}
                options={field.options}
                relationConfig={effectiveRelationConfig}
                onSave={(val) => handleFieldChange(field.key, val)}
                forceEditMode={true}
                fieldKey={field.key}
              />
            </Form.Item>
          </div>
        );
      })}
    </>
  )

  const formContent = (
    <Form
        form={form}
        layout="vertical"
        onFinish={onSave}
        onValuesChange={handleValuesChange}
        {...formProps}
        component={false}
    >
      <div className="flex flex-col gap-4 pb-4">
        {/* 1. Header Fields */}
        <Card size="small" className="bg-gray-50 dark:bg-[#1f1f1f] border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {renderFields(
                    module.fields
                    .filter(f => f.location === 'header')
                    .sort((a, b) => a.order - b.order)
                )}
            </div>
        </Card>

        {/* 2. Blocks */}
        {[...module.blocks].sort((a, b) => a.order - b.order).map(block => {
            if (block.visibleIf && !evaluateCondition(block.visibleIf, formData)) return null;

            // --- استفاده از EditableTable برای بلوک‌های جدولی ---
            if (block.type === BlockType.TABLE) {
                return (
                    <div key={block.id} className="mb-6 animate-fadeIn">
                        <div className="flex items-center gap-2 mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                            <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 m-0">
                                {block.titles.fa}
                            </h3>
                        </div>
                        
                        <Form.Item name={block.id} noStyle>
                            <EditableTable
                                block={block}
                                initialData={formData[block.id] || []}
                                // مهم: حالت local باعث می‌شود جدول دیتابیس را آپدیت نکند
                                // بلکه تابع onChange را صدا بزند
                                mode="local" 
                                relationOptions={{}} // اینجا باید آپشن‌های ریلیشن را پاس بدهیم (فعلا خالی)
                                onChange={(newData) => handleFieldChange(block.id, newData)}
                            />
                        </Form.Item>
                    </div>
                );
            }

            // --- بلوک‌های معمولی ---
            const blockFields = module.fields
                .filter(f => f.blockId === block.id)
                .sort((a, b) => a.order - b.order);

            if (blockFields.length === 0) return null;

            return (
                <div key={block.id} className="mb-6 animate-fadeIn">
                    <div className="flex items-center gap-2 mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                        <div className="w-1 h-5 bg-leather-500 rounded-full"></div>
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 m-0">
                            {block.titles.fa}
                        </h3>
                    </div>
                    
                    <div className="bg-gray-50/50 dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:border-leather-200 transition-colors">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                            {renderFields(blockFields)}
                        </div>
                    </div>
                </div>
            );
        })}
      </div>
    </Form>
  );

  const footerButtons = (
    <div className={`flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 ${embedded ? 'sticky bottom-0 bg-white dark:bg-[#141414] py-3 z-10' : ''}`}>
        <Button onClick={onCancel} icon={<CloseOutlined />}>انصراف</Button>
        <Button type="primary" onClick={() => form.submit()} loading={isLoading} icon={<SaveOutlined />} className="bg-leather-600 hover:bg-leather-500">
          {isBulkEdit ? 'اعمال تغییرات' : 'ذخیره'}
        </Button>
    </div>
  );

  if (embedded) {
    return (
      <>
        {formContent}
        {footerButtons}
      </>
    );
  }

  return (
    <Modal
      title={title || `افزودن ${module.titles.fa}`}
      open={visible}
      onCancel={onCancel}
      footer={footerButtons}
      width={1100}
      destroyOnClose
      centered
    >
      {formContent}
    </Modal>
  );
};

export default SmartForm;

import React, { useState, useEffect } from 'react';
import { 
  Modal, Button, Form, Card, FormInstance, FormProps 
} from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { ModuleDefinition, BlockType, LogicOperator } from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';
// ایمپورت کامپوننت جدول خودت
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

  useEffect(() => {
    if (visible || embedded) {
      if (initialValues) {
          setFormData(initialValues);
          form.setFieldsValue(initialValues);
      }
    }
  }, [visible, embedded, initialValues, form]);

  const handleValuesChange = (changedValues: any, allValues: any) => {
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
        return (
          <div key={field.key}>
             <Form.Item
                name={field.key}
                noStyle 
                rules={[{ required: field.validation?.required && !isBulkEdit && field.key !== 'system_code', message: 'الزامی' }]}
             >
                <SmartFieldRenderer
                  label={field.labels.fa + (field.validation?.required && !isBulkEdit ? ' *' : '')}
                  value={formData[field.key]}
                  type={field.type}
                  options={field.options}
                  onSave={(val) => handleFieldChange(field.key, val)}
                  forceEditMode={true}
                  fieldKey={field.key} // انتقال کلید فیلد
                />
             </Form.Item>
          </div>
        );
      })}
    </>
  );

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
          {isBulkEdit ? 'ذخیره تغییرات گروهی' : 'ذخیره'}
        </Button>
    </div>
  );

  if (embedded) {
    return <div className="h-full flex flex-col"><div className="flex-1 overflow-y-auto px-1">{formContent}</div></div>;
  }

  return (
    <Modal
      title={title || `افزودن/ویرایش ${module.titles.fa}`}
      open={visible}
      onCancel={onCancel}
      width={850}
      zIndex={6000}
      footer={footerButtons}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' } }}
    >
      {formContent}
    </Modal>
  );
};

export default SmartForm;
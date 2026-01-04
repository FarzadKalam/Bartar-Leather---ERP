import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Button, 
  Form, 
  message, 
  Card, 
  Divider, 
  Space 
} from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { 
  ModuleDefinition, 
  BlockType,
  LogicOperator 
} from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';

interface SmartFormProps {
  module: ModuleDefinition;
  initialValues?: any;
  visible: boolean;
  onCancel: () => void;
  onSave: (values: any) => void;
  title?: string;
  isBulkEdit?: boolean;
  embedded?: boolean; // <--- پراپ جدید: اگر true باشد، فرم بدون مودال رندر می‌شود
}

const evaluateCondition = (condition: any, data: any): boolean => {
  if (!condition) return true;
  const { field, operator, value } = condition;
  const fieldValue = data[field];

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
  module, 
  initialValues, 
  visible, 
  onCancel, 
  onSave, 
  title,
  isBulkEdit = false,
  embedded = false 
}) => {
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (visible) {
      setFormData(initialValues || {});
    }
  }, [visible, initialValues]);

  const handleFieldChange = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!isBulkEdit) {
      const errors: string[] = [];
      module.fields.forEach(field => {
        const isFieldVisible = field.logic?.visibleIf 
           ? evaluateCondition(field.logic.visibleIf, formData) 
           : true;

        if (!isFieldVisible) return;

        if (field.validation?.required && !formData[field.key]) {
             if (formData[field.key] !== 0) {
                 errors.push(`فیلد "${field.labels.fa}" الزامی است.`);
             }
        }
      });

      if (errors.length > 0) {
        message.error(errors[0]);
        return;
      }
    }
    onSave(formData);
  };

  const sortedBlocks = [...module.blocks].sort((a, b) => a.order - b.order);

  // محتوای اصلی فرم
  const formContent = (
    <div className="flex flex-col gap-4 pb-4">
      {/* 1. Header Fields */}
      <Card size="small" className="bg-gray-50 dark:bg-[#1f1f1f] border-gray-200 dark:border-gray-800 shadow-sm">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {module.fields
               .filter(f => f.location === 'header')
               .sort((a, b) => a.order - b.order)
               .map(field => {
                 if (field.logic?.visibleIf && !evaluateCondition(field.logic.visibleIf, formData)) return null;
                 return (
                   <div key={field.key}>
                      <SmartFieldRenderer
                        label={field.labels.fa + (field.validation?.required && !isBulkEdit ? ' *' : '')}
                        value={formData[field.key]}
                        type={field.type}
                        options={field.options}
                        relationModule={field.relationConfig?.targetModule}
                        onSave={(val) => handleFieldChange(field.key, val)}
                        forceEditMode={true}
                      />
                   </div>
                 );
               })}
           </div>
      </Card>

      {/* 2. Blocks */}
      {sortedBlocks.map(block => {
           if (block.visibleIf && !evaluateCondition(block.visibleIf, formData)) return null;
           if (block.type === BlockType.TABLE) return null;

           const blockFields = module.fields
             .filter(f => f.blockId === block.id)
             .sort((a, b) => a.order - b.order);

           if (blockFields.length === 0) return null;

           return (
             <Card 
                key={block.id} 
                title={<span className="text-xs font-bold text-gray-500">{block.titles.fa}</span>}
                size="small"
                className="shadow-sm border-gray-200 dark:border-gray-800"
             >
               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                 {blockFields.map(field => {
                    if (field.logic?.visibleIf && !evaluateCondition(field.logic.visibleIf, formData)) return null;
                    return (
                      <div key={field.key}>
                         <SmartFieldRenderer
                            label={field.labels.fa + (field.validation?.required && !isBulkEdit ? ' *' : '')}
                            value={formData[field.key]}
                            type={field.type}
                            options={field.options}
                            relationModule={field.relationConfig?.targetModule}
                            onSave={(val) => handleFieldChange(field.key, val)}
                            forceEditMode={true} 
                         />
                      </div>
                    );
                 })}
               </div>
             </Card>
           );
      })}
    </div>
  );

  const footerButtons = (
    <div className={`flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 ${embedded ? 'sticky bottom-0 bg-white dark:bg-[#141414] py-3 z-10' : ''}`}>
        <Button onClick={onCancel} icon={<CloseOutlined />}>
          انصراف
        </Button>
        <Button 
          type="primary" 
          onClick={handleSave} 
          icon={<SaveOutlined />}
          className="bg-leather-600 hover:bg-leather-500"
        >
          {isBulkEdit ? 'ذخیره تغییرات گروهی' : 'ذخیره'}
        </Button>
    </div>
  );

  // اگر embedded باشد، فقط محتوا + دکمه‌ها را برمی‌گرداند (بدون مودال)
  if (embedded) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto px-1">
            {formContent}
        </div>
        {footerButtons}
      </div>
    );
  }

  // در غیر این صورت، داخل مودال می‌گذارد
  return (
    <Modal
      title={title || `افزودن/ویرایش ${module.titles.fa}`}
      open={visible}
      onCancel={onCancel}
      width={850}
      zIndex={6000}
      footer={footerButtons}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: '1.0rem' } }}
    >
      {formContent}
    </Modal>
  );
};

export default SmartForm;